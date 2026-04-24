/**
 * WhatsApp Widget — All-in-one script with WebSocket real-time support
 * Floating button + slide-out panel with Login/QR, Chat List, Chat View, Contacts
 */
(function () {
    'use strict';

    /* ── State & Config ─────────────────────────────────────────── */
    var state = {
        initialized: false,
        panelBuilt: false,
        isOpen: false,
        screen: 'login', // login | chatList | chat | contacts
        status: 'unknown',
        isConnected: false,
        chats: [],
        messages: [],
        contacts: [],
        chatId: null,
        chatName: '',
        statusInterval: null,
        chatInterval: null,
        messagePollInterval: null,
        messagesLoading: false,
        chatsLoading: false,
        chatsPromise: null,
        chatsLoadedAt: 0,
        avatarCache: {},
        qrLibLoaded: false,
        qrLibPromise: null,
        lastQrString: null,
        subscribed: false,
        webSocketManager: null,
        webSocketHandler: null,
        wsSubscribing: false,
        wsRetryTimer: null,
        wsRetryDelay: 2000,
        wsTopicUri: null,
        wsRetryCount: 0,
        messagePollingActive: false,
        messageSortCounter: 0,
        chatRequestToken: null,
        messageCacheByChat: {},
        routeHandlersBound: false,
        widgetSuppressedByRoute: false
    };

    var config = {
        enabled: true,
        pollInterval: 1000,
        statusCheckInterval: 5000,
        chatListRefreshInterval: 15000,
        messageRefreshInterval: 7000,
        chatListCacheKey: 'wa-widget-chat-list-cache-v1',
        chatListCacheTtl: 12 * 60 * 60 * 1000
    };

    /* ── CSS Injection ──────────────────────────────────────────── */
    if (!document.querySelector('link[href*="whatsapp-widget.css"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'client/custom/css/whatsapp-widget.css?v=' + new Date().getTime();
        document.head.appendChild(link);
    }

    /* ── SVGs ────────────────────────────────────────────────────── */
    var WA_SVG = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    var SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

    /* ── Helpers ─────────────────────────────────────────────────── */
    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function _$(id) { return document.getElementById(id); }

    function formatTime(ts) {
        if (!ts) return '';
        var d = new Date(ts * 1000), now = new Date(), diff = now - d;
        if (diff < 86400000) return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        if (diff < 604800000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
        return d.toLocaleDateString();
    }

    function api(method, url, data) {
        if (typeof Espo === 'undefined' || !Espo.Ajax) return Promise.reject('Espo not ready');
        if (method === 'GET') return Espo.Ajax.getRequest(url, data);
        return Espo.Ajax.postRequest(url, data);
    }

    function isConnectedStatus(status) {
        var s = (status || '').toUpperCase();
        return s === 'AUTHENTICATED' || s === 'CONNECTED';
    }

    function getChatListCache() {
        try {
            var raw = localStorage.getItem(config.chatListCacheKey);
            if (!raw) return [];

            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.list)) return [];

            if (parsed.savedAt && (Date.now() - parsed.savedAt) > config.chatListCacheTtl) {
                localStorage.removeItem(config.chatListCacheKey);
                return [];
            }

            return parsed.list;
        } catch (e) {
            return [];
        }
    }

    function getSerializedChatId(chat) {
        if (!chat) return '';

        if (typeof chat === 'string') return chat;

        if (chat._serialized) return chat._serialized;

        if (chat.id) {
            if (typeof chat.id === 'string') return chat.id;
            if (chat.id._serialized) return chat.id._serialized;
        }

        return '';
    }

    function chatIdsEqual(a, b) {
        var first = getSerializedChatId(a);
        var second = getSerializedChatId(b);

        return !!first && first === second;
    }

    function getStoredUserId() {
        var raw = localStorage.getItem('espo-user-lastUserId');
        if (!raw) return 'system';

        try {
            return JSON.parse(raw);
        } catch (e) {
            return raw;
        }
    }

    function getStoredAuthString() {
        var auth = localStorage.getItem('espo-user-auth');

        if (!auth) {
            return '';
        }

        if (auth.charAt(0) === '"') {
            try {
                auth = JSON.parse(auth);
            } catch (e) {}
        }

        return auth;
    }

    function getStoredAuthToken() {
        var auth = getStoredAuthString();

        if (!auth) return '';

        try {
            var decoded = atob(auth);
            var parts = decoded.split(':');

            return parts.length > 1 ? parts.slice(1).join(':') : '';
        } catch (e) {
            console.warn('WA Widget: Failed to decode stored auth token', e);

            return '';
        }
    }

    function getWebSocketLocationParts() {
        var protocolPart = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        var url = window.location.host;

        if (protocolPart === 'wss://') {
            url += '/wss';
        }

        return {
            protocolPart: protocolPart,
            url: url
        };
    }

    function ensureWidgetWebSocketManager() {
        return new Promise(function(resolve, reject) {
            if (state.webSocketManager) {
                resolve(state.webSocketManager);
                return;
            }

            if (typeof Espo === 'undefined' || !Espo.loader || !Espo.loader.require) {
                reject(new Error('Espo loader not available'));
                return;
            }

            Espo.loader.require('di', function(diModule) {
                Espo.loader.require('web-socket-manager', function(WebSocketManagerModule) {
                    try {
                        var WebSocketManagerClass =
                            (WebSocketManagerModule && WebSocketManagerModule.default) || WebSocketManagerModule;
                        var container = diModule && diModule.container;

                        if (!container || !container.get || !WebSocketManagerClass) {
                            reject(new Error('Espo DI webSocketManager is unavailable'));
                            return;
                        }

                        var manager = container.get(WebSocketManagerClass);

                        if (!manager) {
                            reject(new Error('Espo webSocketManager instance not found'));
                            return;
                        }

                        state.webSocketManager = manager;
                        resolve(manager);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }

    function applyMessageDeliveryState(message) {
        if (!message) return message;

        if (message.ack === undefined || message.ack === null) {
            var status = (message.status || '').toLowerCase();

            if (status === 'read' || status === 'played') message.ack = 3;
            else if (status === 'delivered') message.ack = 2;
            else if (status === 'sent' || status === 'received') message.ack = 1;
        }

        return message;
    }

    function isTemporaryMessageId(id) {
        return typeof id === 'string' &&
            (
                id.indexOf('temp-') === 0 ||
                id.indexOf('sent_') === 0 ||
                id.indexOf('recv_') === 0
            );
    }

    function normalizeMessageRecord(message) {
        if (!message) return null;

        var normalized = {};

        Object.keys(message).forEach(function(key) {
            normalized[key] = message[key];
        });

        var canonicalId = normalized.messageId || getSerializedChatId(normalized.id) || normalized.tempId || '';
        var normalizedChatId = getSerializedChatId(normalized.chatId) || normalized.chatId || '';

        if (canonicalId) {
            normalized.messageId = canonicalId;
            normalized.id = canonicalId;
        }

        if (normalizedChatId) {
            normalized.chatId = normalizedChatId;
        }

        normalized.fromMe = !!normalized.fromMe;
        normalized.timestamp = Math.floor(normalizeTimestamp(normalized.timestamp) / 1000);

        if (normalized._sortSequence === undefined || normalized._sortSequence === null) {
            var sortSequence = normalized.sortSequence;

            if ((sortSequence === undefined || sortSequence === null || sortSequence === '') && normalized.payloadMeta) {
                if (typeof normalized.payloadMeta === 'object') {
                    sortSequence = normalized.payloadMeta.sortSequence;
                }
            }

            if (sortSequence !== undefined && sortSequence !== null && sortSequence !== '') {
                normalized._sortSequence = Number(sortSequence);
            }
        }

        return applyMessageDeliveryState(normalized);
    }

    function nextMessageSortSequence() {
        state.messageSortCounter += 1;
        return state.messageSortCounter;
    }

    function ensureMessageSortSequence(message, fallback) {
        if (!message) return null;

        if (message._sortSequence !== undefined && message._sortSequence !== null && message._sortSequence !== '') {
            var current = Number(message._sortSequence);
            if (!isNaN(current)) {
                state.messageSortCounter = Math.max(state.messageSortCounter, current);
                return current;
            }
        }

        if (fallback !== undefined && fallback !== null) {
            var fallbackNumber = Number(fallback);
            if (!isNaN(fallbackNumber)) {
                message._sortSequence = fallbackNumber;
                state.messageSortCounter = Math.max(state.messageSortCounter, fallbackNumber);
                return fallbackNumber;
            }
        }

        message._sortSequence = nextMessageSortSequence();
        return message._sortSequence;
    }

    function compareMessagesForDisplay(a, b) {
        var timeDiff = normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp);
        if (timeDiff !== 0) {
            return timeDiff;
        }

        var seqA = ensureMessageSortSequence(a);
        var seqB = ensureMessageSortSequence(b);

        if (seqA !== seqB) {
            return seqA - seqB;
        }

        var idA = getMessageIdentity(a) || '';
        var idB = getMessageIdentity(b) || '';

        if (idA && idB && idA !== idB) {
            return idA.localeCompare(idB);
        }

        return 0;
    }

    function compareMessagesForThread(a, b) {
        var timeA = normalizeTimestamp(a.timestamp);
        var timeB = normalizeTimestamp(b.timestamp);
        var timeDiff = timeA - timeB;

        if (timeDiff !== 0) {
            return timeDiff;
        }

        var bothLiveHistory =
            a &&
            b &&
            a.payloadMeta &&
            b.payloadMeta &&
            a.payloadMeta.source === 'getChatMessages' &&
            b.payloadMeta.source === 'getChatMessages';

        if (
            bothLiveHistory &&
            Math.abs(timeA - timeB) <= 90 * 1000
        ) {
            var authorA = (a.author || (a.payloadMeta && a.payloadMeta.author) || '').trim();
            var authorB = (b.author || (b.payloadMeta && b.payloadMeta.author) || '').trim();
            var fromA = (a.from || (a.payloadMeta && a.payloadMeta.from) || '').trim();
            var fromB = (b.from || (b.payloadMeta && b.payloadMeta.from) || '').trim();
            var bridgeOutgoingA = !!a.fromMe && !authorA && !/@c\.us$/i.test(fromA);
            var bridgeOutgoingB = !!b.fromMe && !authorB && !/@c\.us$/i.test(fromB);
            var linkedDeviceA = !!authorA || /@c\.us$/i.test(fromA);
            var linkedDeviceB = !!authorB || /@c\.us$/i.test(fromB);

            if (bridgeOutgoingA !== bridgeOutgoingB) {
                return bridgeOutgoingA ? 1 : -1;
            }

            if (
                a.fromMe &&
                b.fromMe &&
                linkedDeviceA !== linkedDeviceB
            ) {
                return linkedDeviceA ? -1 : 1;
            }

        }

        var seqA = ensureMessageSortSequence(a);
        var seqB = ensureMessageSortSequence(b);

        if (seqA !== null && seqB !== null && seqA !== seqB) {
            return seqA - seqB;
        }

        return compareMessagesForDisplay(a, b);
    }

    function getMessageIdentity(message) {
        if (!message) return '';

        return message.messageId || getSerializedChatId(message.id) || message.tempId || '';
    }

    function messagesLookEquivalent(existing, incoming) {
        if (!existing || !incoming) return false;

        if (!!existing.fromMe !== !!incoming.fromMe) return false;

        var existingChatId = getSerializedChatId(existing.chatId) || existing.chatId || '';
        var incomingChatId = getSerializedChatId(incoming.chatId) || incoming.chatId || '';

        if (existingChatId && incomingChatId && existingChatId !== incomingChatId) {
            return false;
        }

        var existingBody = (existing.body || '').trim();
        var incomingBody = (incoming.body || '').trim();

        if (!existingBody || existingBody !== incomingBody) {
            return false;
        }

        var diff = Math.abs(normalizeTimestamp(existing.timestamp) - normalizeTimestamp(incoming.timestamp));
        var existingId = getMessageIdentity(existing);
        var incomingId = getMessageIdentity(incoming);

        if (existing._optimistic || incoming._optimistic) {
            return diff <= 5 * 60 * 1000;
        }

        if (isTemporaryMessageId(existingId) || isTemporaryMessageId(incomingId)) {
            return diff <= 60 * 1000;
        }

        return false;
    }

    function mergeMessageCollections(existingList, incomingList) {
        var list = (existingList || []).map(normalizeMessageRecord).filter(Boolean);
        var changed = false;

        for (var existingIndex = 0; existingIndex < list.length; existingIndex++) {
            ensureMessageSortSequence(list[existingIndex], existingIndex + 1);
        }

        (incomingList || []).forEach(function(message) {
            message = normalizeMessageRecord(message);

            if (!message) return;

            var id = getMessageIdentity(message);
            var matchIndex = -1;

            for (var i = 0; i < list.length; i++) {
                var existing = list[i];
                var existingId = getMessageIdentity(existing);

                if (existingId && id && existingId === id) {
                    matchIndex = i;
                    break;
                }

                if (messagesLookEquivalent(existing, message)) {
                    matchIndex = i;
                    break;
                }
            }

            if (matchIndex === -1) {
                ensureMessageSortSequence(message);
                list.push(message);
                changed = true;
                return;
            }

            var current = list[matchIndex];
            ensureMessageSortSequence(current, matchIndex + 1);
            ensureMessageSortSequence(message, current._sortSequence);
            var hasDiff =
                current._optimistic ||
                current.body !== message.body ||
                !!current.fromMe !== !!message.fromMe ||
                normalizeTimestamp(current.timestamp) !== normalizeTimestamp(message.timestamp) ||
                current.ack !== message.ack ||
                (current.status || '') !== (message.status || '');

            if (hasDiff) {
                list[matchIndex] = message;
                changed = true;
            }
        });

        list.sort(compareMessagesForThread);

        return {
            list: list,
            changed: changed
        };
    }

    function fetchStoredMessages(chatId, limit) {
        return api('GET', 'WhatsAppMessage', {
            where: [{
                type: 'equals',
                attribute: 'chatId',
                value: chatId
            }],
            orderBy: 'timestamp',
            order: 'desc',
            maxSize: limit || 100
        }).then(function(dbResult) {
            var list = (dbResult.list || []).map(function(message) {
                return normalizeMessageRecord(message);
            }).filter(Boolean);

            list.sort(compareMessagesForThread);

            return list;
        });
    }

    function getKnownLastMessageForChat(chatId) {
        if (!chatId || !Array.isArray(state.chats) || !state.chats.length) return null;

        var chat = state.chats.find(function(c) {
            return chatIdsEqual(c, chatId);
        });

        if (!chat || !chat.lastMessage) return null;

        var normalized = normalizeMessageRecord({
            id: getSerializedChatId(chat.lastMessage.id) || chat.lastMessage.id,
            messageId: getSerializedChatId(chat.lastMessage.id) || chat.lastMessage.id,
            body: chat.lastMessage.body || '',
            timestamp: chat.lastMessage.timestamp || null,
            fromMe: !!chat.lastMessage.fromMe,
            ack: chat.lastMessage.ack,
            status: chat.lastMessage.status || null,
            chatId: chatId
        });

        if (!normalized || !normalized.body) return null;

        return normalized;
    }

    function mergeKnownLastMessage(chatId, messages) {
        var normalizedMessages = (messages || []).map(normalizeMessageRecord).filter(Boolean);
        var knownLastMessage = getKnownLastMessageForChat(chatId);

        if (!knownLastMessage) {
            return mergeMessageCollections([], normalizedMessages);
        }

        return mergeMessageCollections(normalizedMessages, [knownLastMessage]);
    }

    function normalizeCachedLastMessage(message) {
        if (!message) return null;

        var messageId = getSerializedChatId(message.id);

        return {
            id: messageId ? {_serialized: messageId} : null,
            body: message.body || '',
            bodyPreview: message.bodyPreview || message.body || '',
            timestamp: message.timestamp || null,
            fromMe: !!message.fromMe,
            ack: message.ack,
            status: message.status || null,
            sortSequence: message.sortSequence !== undefined ? message.sortSequence : message._sortSequence
        };
    }

    function normalizeChatForCache(chat) {
        var chatId = getSerializedChatId(chat);
        if (!chatId) return null;

        return {
            id: {_serialized: chatId},
            name: chat.name || '',
            contact: chat.contact ? {
                pushname: chat.contact.pushname || '',
                name: chat.contact.name || ''
            } : null,
            lastMessage: normalizeCachedLastMessage(chat.lastMessage)
        };
    }

    function getMessagePreviewText(message) {
        if (!message) return '';

        var body = (message.body || '').trim();
        if (body) return body;

        var bodyPreview = (message.bodyPreview || '').trim();
        if (bodyPreview) return bodyPreview;

        return '';
    }

    function sortChatsByLastMessage() {
        state.chats.sort(function(a, b) {
            var msgA = normalizeMessageRecord(a && a.lastMessage ? a.lastMessage : null);
            var msgB = normalizeMessageRecord(b && b.lastMessage ? b.lastMessage : null);

            if (!msgA && !msgB) return 0;
            if (!msgA) return 1;
            if (!msgB) return -1;

            return compareMessagesForDisplay(msgB, msgA);
        });
    }

    function updateChatLastMessage(chatId, message, chatName) {
        if (!chatId || !message) return false;

        var normalizedMessage = normalizeMessageRecord(message);
        if (!normalizedMessage) return false;

        var preview = getMessagePreviewText(normalizedMessage);
        if (!preview) return false;

        normalizedMessage.body = normalizedMessage.body || preview;
        normalizedMessage.bodyPreview = normalizedMessage.bodyPreview || preview;

        var updated = false;

        for (var i = 0; i < state.chats.length; i++) {
            if (!chatIdsEqual(state.chats[i], chatId)) continue;

            var current = state.chats[i];
            var currentLastMessage = normalizeMessageRecord(current.lastMessage || null);

            if (currentLastMessage) {
                var currentLastId = getMessageIdentity(currentLastMessage);
                var incomingId = getMessageIdentity(normalizedMessage);

                if (
                    incomingId !== currentLastId &&
                    compareMessagesForDisplay(normalizedMessage, currentLastMessage) < 0
                ) {
                    return false;
                }
            }

            current.lastMessage = {
                id: normalizedMessage.messageId ? {_serialized: normalizedMessage.messageId} : normalizedMessage.id,
                body: normalizedMessage.body,
                bodyPreview: normalizedMessage.bodyPreview,
                timestamp: normalizedMessage.timestamp,
                fromMe: !!normalizedMessage.fromMe,
                ack: normalizedMessage.ack,
                status: normalizedMessage.status || null,
                sortSequence: normalizedMessage.sortSequence !== undefined ? normalizedMessage.sortSequence : normalizedMessage._sortSequence
            };

            if (chatName && !current.name) {
                current.name = chatName;
            }

            updated = true;
            break;
        }

        if (updated) {
            sortChatsByLastMessage();
            saveChatListCache(state.chats);
        }

        return updated;
    }

    function saveChatListCache(chats) {
        try {
            var list = (chats || [])
                .map(normalizeChatForCache)
                .filter(Boolean)
                .slice(0, 200);

            localStorage.setItem(config.chatListCacheKey, JSON.stringify({
                savedAt: Date.now(),
                list: list
            }));
        } catch (e) {}
    }

    function renderCachedChatList() {
        var cached = getChatListCache();
        if (!cached.length) return false;

        state.chats = cached;

        if (state.screen === 'chatList') {
            renderChatList(state.chats);
        }

        return true;
    }

    function renderChatListLoading(message) {
        var el = _$('wa-chat-list');
        if (!el) return;

        el.innerHTML =
            '<div class="wa-loading">' +
                '<div class="wa-spinner"></div>' +
                '<div class="wa-loading-text">' + esc(message || 'Loading chats...') + '</div>' +
            '</div>';
    }

    /* ── Helpers for Contacts & Avatars ─────────────────────────── */
    function extractPhoneNumber(contactId) {
        if (typeof contactId === 'string') {
            return contactId
                .replace('@c.us', '')
                .replace('@s.whatsapp.net', '')
                .replace('@g.us', '')
                .replace('@lid', '')
                .replace('@us', '');
        }
        if (contactId && contactId._serialized) {
            return contactId._serialized
                .replace('@c.us', '')
                .replace('@s.whatsapp.net', '')
                .replace('@g.us', '')
                .replace('@lid', '')
                .replace('@us', '');
        }
        if (contactId && contactId.user) {
            return contactId.user;
        }
        return '';
    }

    function getContactId(contact) {
        if (!contact) return '';
        return (contact.id && contact.id._serialized) || contact.id || '';
    }

    function getContactServer(contact) {
        var id = getContactId(contact);
        var parts = id.split('@');
        return parts.length > 1 ? parts[1] : '';
    }

    function getContactDisplayName(contact) {
        if (!contact) return '';
        return (contact.name || contact.pushname || contact.shortName || '').trim();
    }

    function hasMeaningfulContactName(contact) {
        return !!getContactDisplayName(contact);
    }

    function normalizeContactLike(contact) {
        if (!contact) return null;

        var normalized = {};
        Object.keys(contact).forEach(function(key) {
            normalized[key] = contact[key];
        });

        normalized.id = getContactId(contact);
        normalized.number = normalized.number || extractPhoneNumber(normalized.id);
        normalized.isGroup = !!(normalized.isGroup || normalized.id.indexOf('@g.us') !== -1);
        normalized._displayName = getContactDisplayName(normalized);
        normalized._hasChat = !!normalized._hasChat;
        normalized._source = normalized._source || 'contact';

        return normalized.id ? normalized : null;
    }

    function makeContactFromChat(chat) {
        var id = getSerializedChatId(chat);
        if (!id) return null;

        return normalizeContactLike({
            id: id,
            name: (chat.name || (chat.contact && chat.contact.pushname) || '').trim(),
            pushname: (chat.contact && chat.contact.pushname) || '',
            shortName: (chat.contact && chat.contact.shortName) || '',
            number: extractPhoneNumber(id),
            isGroup: !!chat.isGroup,
            _hasChat: true,
            _source: 'chat'
        });
    }

    function getContactPriority(contact) {
        var score = 0;
        var server = getContactServer(contact);

        if (contact._hasChat) score += 50;
        if (hasMeaningfulContactName(contact)) score += 25;
        if (contact.isMyContact) score += 10;
        if (server === 'lid' && contact._hasChat) score += 5;
        if (server === 'c.us' && !contact._hasChat) score += 3;
        if (contact.isGroup) score -= 5;

        return score;
    }

    function pickPreferredContact(existing, candidate) {
        if (!existing) return candidate;
        if (!candidate) return existing;

        var existingPriority = getContactPriority(existing);
        var candidatePriority = getContactPriority(candidate);

        if (candidatePriority !== existingPriority) {
            return candidatePriority > existingPriority ? candidate : existing;
        }

        if (getContactId(candidate).length < getContactId(existing).length) {
            return candidate;
        }

        return existing;
    }

    function shouldSkipContact(contact) {
        var id = getContactId(contact);
        if (!id || id === 'status@broadcast') return true;

        var server = getContactServer(contact);
        var meaningfulName = hasMeaningfulContactName(contact);

        if (server === 'lid' && contact.isBlocked && !meaningfulName) return true;
        if (!contact.isGroup && !meaningfulName && !contact.isMyContact && !contact._hasChat) return true;

        return false;
    }

    function deduplicateContacts(contacts, chats) {
        var byId = {};
        var merged = [];
        var nameBuckets = {};

        function addContact(contact) {
            var normalized = normalizeContactLike(contact);
            if (!normalized || shouldSkipContact(normalized)) return;

            var id = normalized.id;
            if (!byId[id]) {
                byId[id] = normalized;
                merged.push(normalized);
                return;
            }

            var preferred = pickPreferredContact(byId[id], normalized);
            if (preferred !== byId[id]) {
                var idx = merged.indexOf(byId[id]);
                byId[id] = preferred;
                if (idx !== -1) merged[idx] = preferred;
            }
        }

        (contacts || []).forEach(addContact);
        (chats || []).forEach(function(chat) {
            addContact(makeContactFromChat(chat));
        });

        merged.forEach(function(contact) {
            var name = contact._displayName.toLowerCase();
            if (!name || contact.isGroup) return;
            if (!nameBuckets[name]) nameBuckets[name] = [];
            nameBuckets[name].push(contact);
        });

        Object.keys(nameBuckets).forEach(function(name) {
            var bucket = nameBuckets[name];
            if (bucket.length !== 2) return;

            var first = bucket[0];
            var second = bucket[1];
            var firstServer = getContactServer(first);
            var secondServer = getContactServer(second);

            if (firstServer === secondServer) return;
            if (![firstServer, secondServer].includes('lid')) return;
            if (![firstServer, secondServer].includes('c.us')) return;

            var preferred = pickPreferredContact(first, second);
            var rejected = preferred === first ? second : first;
            delete byId[rejected.id];
        });

        merged = merged.filter(function(contact) {
            return byId[contact.id] === contact;
        });

        merged.sort(function(a, b) {
            var priorityDelta = getContactPriority(b) - getContactPriority(a);
            if (priorityDelta) return priorityDelta;

            var aName = (a._displayName || a.number || '').toLowerCase();
            var bName = (b._displayName || b.number || '').toLowerCase();
            if (aName < bName) return -1;
            if (aName > bName) return 1;
            return 0;
        });

        return merged;
    }

    function getInitials(name) {
        if (!name) return '?';
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    function stringToColor(str) {
        var colors = [
            '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e',
            '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50',
            '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#f39c12'
        ];
        
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }

    var avatarObserver = null;
    function initAvatarObserver() {
        if (!window.IntersectionObserver || avatarObserver) return;
        avatarObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var id = el.getAttribute('data-wa-avatar-id');
                    if (id && (!state.avatarCache || state.avatarCache[id] === undefined)) {
                        loadAvatar(id);
                    }
                    avatarObserver.unobserve(el);
                    el.classList.remove('wa-lazy-avatar');
                }
            });
        }, { root: null, rootMargin: '150px' });
        
        var mo = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (node.classList.contains('wa-lazy-avatar')) avatarObserver.observe(node);
                        var lazies = node.querySelectorAll('.wa-lazy-avatar');
                        for (var i=0; i<lazies.length; i++) avatarObserver.observe(lazies[i]);
                    }
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    function getAvatarHtml(contact, size) {
        size = size || 40;
        var id = getContactId(contact);
        var name = getContactDisplayName(contact) || extractPhoneNumber(id);
        var initials = getInitials(name);
        var color = stringToColor(name);
        var picUrl = null;
        
        if (state.avatarCache && state.avatarCache[id]) {
             picUrl = state.avatarCache[id];
        }
        
        var lazyClass = (!picUrl && id) ? ' wa-lazy-avatar' : '';
        
        if (picUrl) {
            return '<div class="wa-avatar" data-wa-avatar-id="' + esc(id) + '" style="width:' + size + 'px;height:' + size + 'px;">' +
                '<img class="wa-avatar-img" src="' + esc(picUrl) + '" alt="' + esc(name) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" ' +
                'onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'flex\';">' +
                '<div class="wa-avatar-initials" style="display:none;background:' + color + ';width:100%;height:100%;line-height:' + size + 'px;font-size:' + (size/2) + 'px;">' + initials + '</div>' + 
            '</div>';
        }
        
        return '<div class="wa-avatar' + lazyClass + '" data-wa-avatar-id="' + esc(id) + '" style="width:' + size + 'px;height:' + size + 'px;">' +
            '<div class="wa-avatar-initials" style="background:' + color + ';width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px;font-size:' + (size/2) + 'px;">' +
                initials +
            '</div>' +
        '</div>';
    }

    function loadAvatar(id) {
        if (!state.avatarCache) state.avatarCache = {};
        if (state.avatarCache[id] !== undefined) return;
        
        state.avatarCache[id] = null;
        
        api('GET', 'WhatsApp/action/getProfilePic', { id: id }).then(function(r) {
            if (r && r.url) {
                state.avatarCache[id] = r.url;
                
                var els = document.querySelectorAll('[data-wa-avatar-id="' + CSS.escape(id) + '"]');
                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    var initDiv = el.querySelector('.wa-avatar-initials');
                    if (initDiv) {
                        var oldImg = el.querySelector('img');
                        if (oldImg) oldImg.remove();
                        
                        var img = document.createElement('img');
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.borderRadius = '50%';
                        img.style.display = 'none';
                        
                        img.onload = function() {
                            this.style.display = 'block';
                            if (this.nextElementSibling) {
                                this.nextElementSibling.style.display = 'none';
                            }
                        };
                        
                        img.onerror = function() {
                            this.style.display = 'none';
                            if (this.nextElementSibling) {
                                this.nextElementSibling.style.display = 'flex';
                            }
                        };
                        
                        img.src = r.url;
                        el.insertBefore(img, initDiv);
                    }
                }
            }
        }).catch(function() {});
    }

    function normalizeTimestamp(ts) {
        if (!ts) return Date.now();
        if (typeof ts === 'string' && (ts.indexOf('-') !== -1 || ts.indexOf(':') !== -1)) {
            var d = new Date(ts.replace(' ', 'T'));
            return isNaN(d.getTime()) ? Date.now() : d.getTime();
        }
        var num = parseFloat(ts);
        if (isNaN(num)) return Date.now();
        if (num < 100000000000) return num * 1000;
        return num;
    }

    function isWhatsAppMainRoute() {
        var hash = window.location.hash || '';

        return /^#WhatsApp(?:$|[/?])/.test(hash);
    }

    function syncWidgetRouteVisibility() {
        var shouldHide = isWhatsAppMainRoute();
        var btn = _$('whatsapp-floating-btn');
        var panel = _$('wa-panel-root');

        state.widgetSuppressedByRoute = shouldHide;

        if (shouldHide) {
            if (state.isOpen) {
                close();
            }

            if (btn) {
                btn.style.display = 'none';
            }

            if (panel) {
                panel.classList.remove('open');
                panel.style.display = 'none';
                panel.style.opacity = '0';
                panel.style.pointerEvents = 'none';
            }

            stopPolling();

            return true;
        }

        if (panel) {
            panel.style.display = '';
        }

        if (btn) {
            btn.style.display = config.enabled ? 'flex' : 'none';
        }

        return false;
    }

    function bindRouteVisibilityHandlers() {
        if (state.routeHandlersBound) return;

        state.routeHandlersBound = true;

        var handler = function () {
            if (syncWidgetRouteVisibility()) {
                return;
            }

            checkStatus();
        };

        window.addEventListener('hashchange', handler);
        window.addEventListener('popstate', handler);
    }

    /* ── UI Building ────────────────────────────────────────────── */

    /* ── Navigation ──────────────────────────────────────────────── */
    function toggle() { state.isOpen ? close() : open(); }
    
    function open() {
        if (syncWidgetRouteVisibility()) return;

        state.isOpen = true;
        var p = _$('wa-panel-root');
        if (p) {
            p.classList.add('open');
            p.style.opacity = '1'; 
            p.style.pointerEvents = 'auto';
            if (!p.style.transform || p.style.transform === 'translateY(20px)') {
                p.style.transform = 'translateY(0)';
            }
        } else {
            console.error('WA: Panel root not found!');
        }
        updateTheme();
        checkStatus();
        startPolling();
    }

    function close() {
        state.isOpen = false;
        var p = _$('wa-panel-root');
        if (p) {
            p.classList.remove('open');
            p.style.opacity = '';
            p.style.pointerEvents = '';
        }
        stopPolling();
    }

    function showScreen(name) {
        state.lastScreen = state.screen;
        state.screen = name;
        
        // Clear caches so the new screen is forced to render completely
        state.lastChatListHtml = null;
        state.lastContactsHtml = null;

        var screens = document.querySelectorAll('#wa-panel .wa-screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        
        var active = _$('wa-screen-' + name);
        if (active) active.classList.add('active');

        var backBtn = _$('wa-back-btn');
        var newChatBtn = _$('wa-btn-new-chat');
        var refreshQrBtn = _$('wa-btn-refresh-qr');
        
        if (backBtn) {
            backBtn.style.display = (name === 'chat' || name === 'contacts') ? 'flex' : 'none';
        }
        
        if (newChatBtn) {
            newChatBtn.style.display = (name === 'chatList') ? 'flex' : 'none';
        }

        if (refreshQrBtn) {
            refreshQrBtn.style.display = (name === 'login') ? 'flex' : 'none';
        }

        var title = _$('wa-panel-title');
        if (title) {
             _$('wa-panel-title').textContent = (name === 'chat' ? (state.chatName || 'Chat') : (name === 'contacts' ? 'Select Contact' : 'WhatsApp'));
        }

        if (name === 'chatList') {
            startChatListPolling();

            if (state.chats.length) {
                renderChatList(state.chats);
            } else {
                renderCachedChatList();
            }
        } else if (state.chatInterval) {
            clearInterval(state.chatInterval);
            state.chatInterval = null;
        }

        if (name !== 'chat') {
            stopMessagePolling();
        } else {
            startMessagePolling();
        }
    }

    /* ── Status & Polling ───────────────────────────────────────── */
    function checkStatus() {
        if (syncWidgetRouteVisibility()) {
            return;
        }

        api('GET', 'WhatsApp/action/status').then(function (r) {
            state.status = r.status || 'disconnected';
            config.enabled = r.enabled !== false;

            var btn = _$('whatsapp-floating-btn');
            if (btn) btn.style.display = config.enabled ? 'flex' : 'none';
            if (!config.enabled && state.isOpen) close();

            updateStatusUI();

            var isConnected = r.isConnected || isConnectedStatus(state.status);
            state.isConnected = isConnected;

            if (!state.isOpen) {
                return;
            }

            if (isConnected) {
                if (!isRealtimeConnected()) {
                    state.subscribed = false;
                    subscribeToRealTime();
                }

                var loginScreen = _$('wa-screen-login');
                if (state.screen === 'login' || (loginScreen && loginScreen.classList.contains('active'))) {
                    showScreen('chatList');
                    loadChats({silent: false});
                } else if (!state.screen || state.screen === '') {
                     showScreen('chatList');
                     loadChats({silent: false});
                } else if (
                    state.screen === 'chatList' &&
                    (
                        !state.chats.length ||
                        !state.chatsLoadedAt ||
                        (Date.now() - state.chatsLoadedAt) > config.chatListRefreshInterval
                    )
                ) {
                    loadChats({silent: !!state.chats.length});
                }
                
                if (!state.subscribed) {
                     subscribeToRealTime();
                }
            } else {
                if (state.screen !== 'login') {
                     showScreen('login');
                }
                
                stopMessagePolling();
            }
        }).catch(function (e) {
            console.error('WhatsApp Widget: Status check error', e);
            state.status = 'disconnected';
            state.isConnected = false;
            config.enabled = false; // Disable widget if API check fails

            var btn = _$('whatsapp-floating-btn');
            if (btn) btn.style.display = 'none';
            
            updateStatusUI();
            if (state.isOpen) close();
            
            stopMessagePolling();
        });
    }

    function updateStatusUI() {
        var el = _$('wa-panel-status');
        var connected = isConnectedStatus(state.status);
        
        if (el) {
            el.textContent = connected ? '\u25cf Connected' : ('\u25cb ' + (state.status || 'Disconnected'));
            el.className = 'wa-status-text' + (connected ? ' connected' : '');
        }
        var dot = _$('wa-status-dot');
        if (dot) dot.className = 'wa-status-dot ' + (connected ? 'connected' : 'disconnected');
        
        var logoutBtn = _$('wa-logout-btn');
        if (logoutBtn) logoutBtn.style.display = connected ? 'block' : 'none';
    }

    function isRealtimeConnected() {
        return !!(state.webSocketManager && state.webSocketManager.isConnected);
    }

    function startPolling() {
        stopPolling();
        state.statusInterval = setInterval(checkStatus, config.statusCheckInterval);
    }

    function stopPolling() {
        if (state.statusInterval) { clearInterval(state.statusInterval); state.statusInterval = null; }
        if (state.chatInterval) { clearInterval(state.chatInterval); state.chatInterval = null; }
        if (state.wsRetryTimer) { clearTimeout(state.wsRetryTimer); state.wsRetryTimer = null; }
        stopMessagePolling();
    }

    function startChatListPolling() {
        if (state.chatInterval) return;

        state.chatInterval = setInterval(function() {
            if (!state.isOpen || state.screen !== 'chatList' || !state.isConnected) return;

            if (isRealtimeConnected() && state.chats.length) return;

            loadChats({silent: true, force: true});
        }, config.chatListRefreshInterval);
    }

    /* ── WebSocket Real-Time Subscription ───────────────────────── */
    /* ── WebSocket Real-Time Subscription ───────────────────────── */
    function subscribeToRealTime() {
        if (state.subscribed || state.wsSubscribing) return;

        state.wsSubscribing = true;

        ensureWidgetWebSocketManager().then(function(manager) {
            var locationParts = getWebSocketLocationParts();
            var auth = getStoredAuthString();
            var userId = getStoredUserId();
            var shouldReconnect =
                manager.protocolPart !== locationParts.protocolPart ||
                manager.url !== locationParts.url;

            manager.protocolPart = locationParts.protocolPart;
            manager.url = locationParts.url;

            var isEnabled = typeof manager.isEnabled === 'function' ? manager.isEnabled() : true;

            if (typeof manager.setEnabled === 'function' && !isEnabled) {
                manager.setEnabled();
            }

            if (shouldReconnect && manager.connection && !manager.isConnected) {
                manager.connection = null;
                manager.isConnecting = false;
            }

            if (!manager.connection && auth && userId) {
                manager.connect(auth, userId);
            } else if (!manager.isConnected && !manager.isConnecting && auth && userId) {
                manager.connect(auth, userId);
            }

            if (!state.webSocketHandler) {
                state.webSocketHandler = function(topic, data) {
                    if (typeof data === 'string') {
                        try { data = JSON.parse(data); } catch (e) { return; }
                    }

                    if (!data) return;

                    var action = data.action;
                    var payload = data.data || data;
                    var chatId = data.chatId || (payload && payload.chatId);

                    if (payload && !payload.chatId && chatId) {
                        payload.chatId = chatId;
                    }

                    if (action === 'message' || action === 'message_ack') {
                        onRealTimeMessage(payload, action);
                        return;
                    }

                    if (action === 'lifecycle') {
                        var nextStatus = payload && payload.state ? payload.state : 'disconnected';
                        state.status = nextStatus;
                        state.isConnected = isConnectedStatus(nextStatus);
                        updateStatusUI();

                        if (!state.isConnected && state.screen !== 'login') {
                            showScreen('login');
                        }
                    }
                };
            }

            if (state.webSocketHandler) {
                manager.unsubscribe('WhatsApp', state.webSocketHandler);
            }
            manager.subscribe('WhatsApp', state.webSocketHandler);
            state.subscribed = true;
            state.wsSubscribing = false;
            state.wsRetryDelay = 2000;

            if (state.wsRetryTimer) {
                clearTimeout(state.wsRetryTimer);
                state.wsRetryTimer = null;
            }
        }).catch(function(error) {
            state.wsSubscribing = false;
            console.warn('WA Widget: Failed to attach to Espo webSocketManager', error);
            scheduleWebSocketRetry();
        });
    }

    function scheduleWebSocketRetry() {
        if (state.subscribed || state.wsSubscribing || state.wsRetryTimer) return;

        var delay = state.wsRetryDelay || 2000;

        state.wsRetryTimer = setTimeout(function() {
            state.wsRetryTimer = null;
            state.wsRetryDelay = Math.min(30000, Math.round((state.wsRetryDelay || 2000) * 1.6));
            subscribeToRealTime();
        }, delay);
    }

    function startMessagePolling() {
        if (state.messagePollInterval) return;

        state.messagePollingActive = true;
        state.messagePollInterval = setInterval(function() {
            if (!state.isOpen || state.screen !== 'chat' || !state.chatId || !state.isConnected) return;

            if (isRealtimeConnected()) return;

            pollMessages();
        }, config.messageRefreshInterval);
    }

    function pollMessages() {
        if (state.messagesLoading) return;

        if (state.screen === 'chat' && state.chatId) {
            state.messagesLoading = true;

            fetchStoredMessages(state.chatId, 50).then(function(messages) {
                var knownMerged = mergeKnownLastMessage(state.chatId, messages);

                if (!knownMerged.list.length) return;

                var merged = mergeMessageCollections(state.messages, knownMerged.list);

                if (merged.changed) {
                    state.messages = merged.list;
                    renderMessages(state.messages);
                }
            }).catch(function(e) {
                console.warn('WA Widget: Message polling failed', e);
            }).then(function() {
                state.messagesLoading = false;
            });
        }
    }

    function stopMessagePolling() {
        if (state.messagePollInterval) {
            clearInterval(state.messagePollInterval);
            state.messagePollInterval = null;
        }
        state.messagePollingActive = false;
    }

    function onRealTimeMessage(msg, action) {
        if (!msg) return;
        action = action || 'message';
        msg = normalizeMessageRecord(msg);

        if (!msg) return;

        if (action === 'message') {
            updateChatLastMessage(msg.chatId, msg, state.chatId && chatIdsEqual(state.chatId, msg.chatId) ? state.chatName : '');
        }

        if (state.screen === 'chat' && chatIdsEqual(state.chatId, msg.chatId)) {
            if (action === 'message_ack') {
                var incomingId = getMessageIdentity(msg);

                for (var i = 0; i < state.messages.length; i++) {
                    var existing = state.messages[i];
                    var existingId = getMessageIdentity(existing);

                    if (existingId === incomingId) {
                        state.messages[i].ack = msg.ack;
                        if (msg.status) state.messages[i].status = msg.status;
                        break;
                    }
                }
                renderMessages(state.messages);
            } else {
                var merged = mergeMessageCollections(state.messages, [msg]);

                state.messages = merged.list;
                renderMessages(state.messages);
            }
        }

        if (state.isOpen) {
            var chatFound = false;
            for (var j = 0; j < state.chats.length; j++) {
                var cId = state.chats[j].id._serialized || state.chats[j].id;
                if (chatIdsEqual(cId, msg.chatId)) {
                    chatFound = true;
                    if (action === 'message_ack' && state.chats[j].lastMessage) {
                        var lmId = getMessageIdentity(state.chats[j].lastMessage);
                        var msgId = getMessageIdentity(msg);
                        if (lmId === msgId) {
                            state.chats[j].lastMessage.ack = msg.ack;
                            if (msg.status) state.chats[j].lastMessage.status = msg.status;
                        }
                    }
                    break;
                }
            }

            if (!chatFound && action === 'message') {
                loadChats({silent: true, force: true});
            } else if (state.screen === 'chatList') {
                sortChatsByLastMessage();
                saveChatListCache(state.chats);
                renderChatList(state.chats);
            }
        }
    }

    function logout() {
        if (!confirm('Sei sicuro di voler disconnettere WhatsApp?\n\nDovrai scansionare nuovamente il QR code per riconnetterti.')) return;
        
        api('POST', 'WhatsApp/action/logout').then(function() {
            state.status = 'DISCONNECTED';
            state.subscribed = false;
            showScreen('login');
            startSession();
            
             state.chats = [];
             state.messages = [];
             state.contacts = [];
             state.chatId = null;

        }).catch(function(e) {
             console.error('Logout error:', e);
        });
    }

    /* ── Session / QR ───────────────────────────────────────────── */
    function ensureQrLib() {
        if (window.QRCode) {
            state.qrLibLoaded = true;
            return Promise.resolve(window.QRCode);
        }

        if (state.qrLibPromise) {
            return state.qrLibPromise;
        }

        state.qrLibPromise = new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[data-wa-qr-lib="true"]');
            if (existing) {
                existing.addEventListener('load', function() {
                    state.qrLibLoaded = !!window.QRCode;
                    resolve(window.QRCode);
                }, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            var script = document.createElement('script');
            script.src = 'client/lib/qrcode.js';
            script.async = true;
            script.setAttribute('data-wa-qr-lib', 'true');
            script.onload = function() {
                state.qrLibLoaded = !!window.QRCode;
                resolve(window.QRCode);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        }).then(function(result) {
            state.qrLibPromise = null;
            return result;
        }).catch(function(error) {
            state.qrLibPromise = null;
            throw error;
        });

        return state.qrLibPromise;
    }

    function showQrUi() {
        if (_$('wa-qr-container')) _$('wa-qr-container').style.display = 'flex';
        if (_$('wa-qr-spinner')) _$('wa-qr-spinner').style.display = 'none';
        if (_$('wa-connect-btn')) _$('wa-connect-btn').style.display = 'none';
    }

    function renderQrValue(qrValue) {
        if (!qrValue) return;

        ensureQrLib().then(function(QRCodeLib) {
            if (!QRCodeLib) return;

            var container = _$('wa-qr-container');
            if (!container) return;

            if (state.lastQrString === qrValue && container.getAttribute('data-wa-qr-rendered') === 'true') {
                showQrUi();
                return;
            }

            container.innerHTML = '<div id="wa-qr-generated" class="wa-qr-generated"></div>';
            container.setAttribute('data-wa-qr-rendered', 'true');
            state.lastQrString = qrValue;

            new QRCodeLib(document.getElementById('wa-qr-generated'), {
                text: qrValue,
                width: 176,
                height: 176
            });

            showQrUi();
        }).catch(function(error) {
            console.warn('WA Widget: Failed to render QR from raw string', error);
        });
    }

    function startSession() {
        if (state.sessionStarting) return;
        state.sessionStarting = true;
        state.lastQrString = null;

        if (state.qrPollTimeout) { clearTimeout(state.qrPollTimeout); state.qrPollTimeout = null; }

        var btn = _$('wa-connect-btn');
        var area = _$('wa-qr-area');
        var spinner = _$('wa-qr-spinner');
        var qrc = _$('wa-qr-container');

        if (btn) { btn.disabled = true; btn.textContent = 'Connecting\u2026'; }
        if (spinner) spinner.style.display = 'block';
        if (qrc) {
            qrc.style.display = 'none';
            qrc.innerHTML = '';
            qrc.removeAttribute('data-wa-qr-rendered');
        }

        api('GET', 'WhatsApp/action/login').then(function (r) {
            if (r && r.qrCode) {
                renderQrValue(r.qrCode);
            }
            state.qrPollTimeout = setTimeout(function() { pollQR(0); }, 2000);
        }).catch(function () {
             state.sessionStarting = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
            if (typeof Espo !== 'undefined' && Espo.Ui) Espo.Ui.error('Failed to connect');
        });
    }

    function pollQR(attempts) {
        if (!state.isOpen || attempts > 60) {
            state.sessionStarting = false;
            var btn = _$('wa-connect-btn');
            if (btn) { btn.disabled = false; btn.textContent = 'Regenerate QR'; }
            return; 
        }

        api('GET', 'WhatsApp/action/qrCode').then(function (r) {
            if (r.qr) {
                renderQrValue(r.qr);
                state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 3000); 
            } else {
                 api('GET', 'WhatsApp/action/status').then(function(s) {
                     var isConnected = s.isConnected || 
                                       s.status === 'CONNECTED' || 
                                       s.status === 'AUTHENTICATED';

                     if (isConnected) {
                         state.sessionStarting = false;
                         state.status = s.status;
                         updateStatusUI();
                         showScreen('chatList');
                         loadChats();
                     } else {
                         state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 2000);
                     }
                 });
            }
        }).catch(function() {
            state.qrPollTimeout = setTimeout(function() { pollQR(attempts + 1); }, 3000);
        });
    }

    /* ── Data Loading ───────────────────────────────────────────── */
    function loadChats(options) {
        options = options || {};

        if (state.chatsLoading) {
            return state.chatsPromise || Promise.resolve(state.chats);
        }

        if (!options.force && state.chatsLoadedAt && (Date.now() - state.chatsLoadedAt) < 5000) {
            if (state.screen === 'chatList' && state.chats.length) {
                renderChatList(state.chats);
            }

            return Promise.resolve(state.chats);
        }

        if (!state.chats.length) {
            var hadCachedChats = renderCachedChatList();

            if (!hadCachedChats && state.screen === 'chatList' && !options.silent) {
                renderChatListLoading('Loading chats...');
            }
        }

        state.chatsLoading = true;

        state.chatsPromise = api('GET', 'WhatsApp/action/getChats').then(function (r) {
            var list = Array.isArray(r.list) ? r.list : [];

            if (list.length) {
                state.chats = list;
                state.chatsLoadedAt = Date.now();
                saveChatListCache(list);
            }

            if (state.screen === 'chatList') {
                if (state.chats.length) {
                    renderChatList(state.chats);
                } else {
                    renderChatListLoading('Waiting for chats to sync...');
                }
            }

            return state.chats;
        }).catch(function (e) {
            console.warn('WA Widget: Chat list load failed', e);

            if (!state.chats.length && state.screen === 'chatList') {
                if (!renderCachedChatList()) {
                    renderChatListLoading('Unable to load chats. Retrying...');
                }
            }

            return state.chats;
        }).then(function (result) {
            state.chatsLoading = false;
            state.chatsPromise = null;
            return result;
        }, function (error) {
            state.chatsLoading = false;
            state.chatsPromise = null;
            throw error;
        });

        return state.chatsPromise;
    }

    function loadContacts() {
        showScreen('contacts');
        var list = _$('wa-contacts-list');
        if (list) list.innerHTML = '<div class="wa-loading"><div class="wa-spinner"></div></div>';

        Promise.all([
            loadChats().catch(function() { return state.chats || []; }),
            api('GET', 'WhatsApp/action/getContacts').catch(function() { return { list: [] }; })
        ]).then(function(results) {
            var chats = Array.isArray(results[0]) ? results[0] : [];
            var response = results[1] || {};
            state.contacts = deduplicateContacts(response.list || [], chats);
            renderContacts(state.contacts);
        });
    }

    function openChat(chatId, chatName) {
        var requestToken = String(Date.now()) + ':' + Math.random();

        state.chatRequestToken = requestToken;
        state.chatId = chatId;
        state.chatName = chatName;
        state.messages = [];
        state.lastMessagesHtml = null; // Clear cache for new chat
        showScreen('chat');

        var container = _$('wa-messages-container');
        var cachedMessages = state.messageCacheByChat[chatId];
        if (cachedMessages && cachedMessages.length) {
            state.messages = mergeKnownLastMessage(chatId, cachedMessages).list;
            renderMessages(state.messages);
        } else if (container) {
            container.innerHTML = '<div class="wa-loading wa-loading-messages"><div class="wa-spinner"></div><div class="wa-loading-text">Loading messages...</div></div>';
        }

        api('GET', 'WhatsApp/action/getChatMessages', { 
            chatId: chatId, 
            limit: 100 
        }).then(function (r) {
            if (state.chatRequestToken !== requestToken) return;

            var merged = mergeKnownLastMessage(chatId, (r && r.list) || []);

            state.messages = merged.list;

            if (state.messages.length) {
                renderMessages(state.messages);
            } else {
                fallbackToLastMessage(chatId);
            }
        }).catch(function () {
            if (state.chatRequestToken !== requestToken) return;
            fallbackToLastMessage(chatId);
        });

    }

    function fallbackToLastMessage(chatId) {
        var container = _$('wa-messages-container');
        if (!container) return;
        
        fetchStoredMessages(chatId, 50).then(function(list) {
            var merged = mergeKnownLastMessage(chatId, list || []);

            if (merged.list.length > 0) {
                state.messages = merged.list;
                renderMessages(state.messages);
                showSystemMessage('Loaded ' + merged.list.length + ' messages from local storage.');
                return;
            }
            fallbackToLastMessageFromList(chatId, container);
        }).catch(function() {
            fallbackToLastMessageFromList(chatId, container);
        });
    }

    function fallbackToLastMessageFromList(chatId, container) {
        var chat = state.chats.find(function(c) { return (c.id._serialized || c.id) === chatId; });
        var msgs = [];
        if (chat && chat.lastMessage && chat.lastMessage.body) {
            var lm = chat.lastMessage;
            msgs.push({
                body: lm.body,
                timestamp: lm.timestamp,
                fromMe: lm.fromMe,
                id: lm.id._serialized || lm.id
            });
        }
        
        if (msgs.length) {
            renderMessages(msgs);
            showSystemMessage('History fetched from device. Older messages may be unavailable via API.');
        } else {
            container.innerHTML = '<div class="wa-empty-state"><p>No messages yet</p></div>';
        }
    }
    
    function showSystemMessage(text) {
        var container = _$('wa-messages-container');
        if (!container) return;
        var div = document.createElement('div');
        div.className = 'wa-system-message';
        div.textContent = text;
        container.appendChild(div);
    }

    function sendMessage() {
        var input = _$('wa-message-input');
        var text = input ? input.value.trim() : '';
        if (!text || !state.chatId) return;
        input.value = '';

        var now = new Date();
        var tempId = 'temp-' + Date.now();
        var optimisticMsg = {
            id: tempId,
            tempId: tempId,
            body: text,
            bodyPreview: text,
            chatId: state.chatId,
            timestamp: Math.floor(now.getTime() / 1000),
            fromMe: true,
            _optimistic: true,
            _sortSequence: nextMessageSortSequence()
        };

        state.messages.push(optimisticMsg);
        updateChatLastMessage(state.chatId, optimisticMsg, state.chatName);
        renderMessages(state.messages);

        api('POST', 'WhatsApp/action/sendMessage', { chatId: state.chatId, message: text }).then(function (r) {
             if (r && r.messageId) {
                 for (var i = 0; i < state.messages.length; i++) {
                     if (state.messages[i].tempId === tempId) {
                         state.messages[i].id = r.messageId;
                         state.messages[i].messageId = r.messageId;
                         state.messages[i]._optimistic = false;
                         if (!state.messages[i].ack && state.messages[i].ack !== 0) {
                             state.messages[i].ack = 1; 
                             state.messages[i].status = 'Sent';
                         }
                         updateChatLastMessage(state.chatId, state.messages[i], state.chatName);
                         renderMessages(state.messages);
                         break;
                     }
                 }
             }
        }).catch(function(e) {
            for (var i = 0; i < state.messages.length; i++) {
                if (state.messages[i].tempId === tempId) {
                    state.messages[i].body += ' \u26A0\uFE0F (Error)';
                    state.messages[i].ack = -1;
                    state.messages[i]._optimistic = false;
                    renderMessages(state.messages);
                    break;
                }
            }
        });
    }

    /* ── Renderers ──────────────────────────────────────────────── */
    function renderChatList(chats) {
        var el = _$('wa-chat-list');
        if (!el) return;
        if (!chats.length) { el.innerHTML = '<div class="wa-empty-state"><p>No chats</p></div>'; return; }

        var q = (_$('wa-search-input') || {}).value || '';
        if (q) {
             q = q.toLowerCase();
             chats = chats.filter(function(c) {
                 var n = (c.name || (c.contact && c.contact.pushname) || '');
                 if (typeof n !== 'string') n = String(n);
                 return n.toLowerCase().indexOf(q) !== -1;
             });
        }
        
        chats = chats.slice().sort(function(a, b) {
            var msgA = normalizeMessageRecord(a && a.lastMessage ? a.lastMessage : null);
            var msgB = normalizeMessageRecord(b && b.lastMessage ? b.lastMessage : null);

            if (!msgA && !msgB) return 0;
            if (!msgA) return 1;
            if (!msgB) return -1;

            return compareMessagesForDisplay(msgB, msgA);
        });

        var html = chats.map(function (c) {
            var chatId = c.id._serialized || c.id;
            var name = c.name || extractPhoneNumber(chatId);
            var last = getMessagePreviewText(c.lastMessage);
            var time = (c.lastMessage && c.lastMessage.timestamp) ? formatTime(c.lastMessage.timestamp) : '';
            
            return '<li class="wa-chat-item" data-cid="' + esc(chatId) + '" data-cname="' + esc(name) + '">' +
                getAvatarHtml(c, 42) + 
                '<div class="wa-chat-info"><div class="wa-chat-name">' + esc(name) + '</div>' +
                '<div class="wa-chat-last-msg">' + esc(last) + '</div></div>' +
                '<div class="wa-chat-meta"><div class="wa-chat-time">' + esc(time) + '</div></div>' +
                '</li>';
        }).join('');

        if (state.lastChatListHtml === html) return;
        state.lastChatListHtml = html;
        el.innerHTML = html;

        var items = el.querySelectorAll('.wa-chat-item');
        for (var i = 0; i < items.length; i++) {
            items[i].onclick = function() { openChat(this.getAttribute('data-cid'), this.getAttribute('data-cname')); };
        }
    }

    function renderContacts(contacts) {
        var el = _$('wa-contacts-list');
        if (!el) return;
        
        var q = (_$('wa-contact-search') || {}).value || '';
        if (q) {
             q = q.toLowerCase();
             contacts = contacts.filter(function(c) {
                 var n = getContactDisplayName(c) || c.number || '';
                 if (typeof n !== 'string') n = String(n);
                 var number = (c.number || '').toLowerCase();
                 return n.toLowerCase().indexOf(q) !== -1 || number.indexOf(q) !== -1;
             });
        }

        _$('wa-contacts-list').innerHTML = '';
        
        if (!contacts || contacts.length === 0) {
            _$('wa-contacts-list').innerHTML = '<div class="wa-empty-state">No contacts found.</div>';
            return;
        }
        
        var html = contacts.map(function(c) {
             var name = getContactDisplayName(c) || c.number;
             var id = getContactId(c);
             var isGroup = id && id.indexOf('@g.us') !== -1;
             var number = c.number || extractPhoneNumber(id);
             
             var numberHtml = isGroup ? '' : '<div class="wa-contact-number">' + esc(number) + '</div>';
             
             return '<li class="wa-contact-item" data-id="' + esc(id) + '" data-name="' + esc(name) + '">' +
                    getAvatarHtml(c, 42) +
                    '<div class="wa-contact-info"><div class="wa-contact-name">' + esc(name) + '</div>' +
                    numberHtml + '</div></li>';
        }).join('');
        
        if (state.lastContactsHtml === html) return;
        state.lastContactsHtml = html;
        el.innerHTML = html;
        
        var items = el.querySelectorAll('.wa-contact-item');
        for (var i = 0; i < items.length; i++) {
            items[i].onclick = function() { openChat(this.getAttribute('data-id'), this.getAttribute('data-name')); };
        }
    }

    function buildEmojiPicker() {
        var emojis = [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '❣️', '💕',
            '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
            '🔥', '💧', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '💢'
        ];
        
        var html = '<div class="wa-emoji-grid">';
        emojis.forEach(function(emoji) {
            html += '<button class="wa-emoji-item" data-emoji="' + emoji + '">' + emoji + '</button>';
        });
        html += '</div>';
        return html;
    }

    function renderMessages(msgs) {
        var container = _$('wa-messages-container');
        if (!container) return;
        var sorted = msgs.slice().sort(compareMessagesForThread);
        if (state.chatId) {
            state.messageCacheByChat[state.chatId] = sorted.slice();
        }
        var html = '';
        sorted.forEach(function (m) {
            var ms = normalizeTimestamp(m.timestamp);
            var d = new Date(ms);
            var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var icon = '';
            
            if (m.fromMe) {
                if (m._optimistic) {
                    icon = ' \u23f3';
                } else {
                    var ack = m.ack;
                    var st = m.status ? m.status.toLowerCase() : '';
                    
                    if (ack === undefined || ack === null) {
                        if (st === 'read' || st === 'played') ack = 3;
                        else if (st === 'delivered') ack = 2;
                        else if (st === 'sent' || st === 'received') ack = 1;
                    }
                    
                    if (ack >= 3 || st === 'read' || st === 'played') {
                        icon = ' <span style="color:#53bdeb; letter-spacing:-2px;">\u2713\u2713</span>'; 
                    } else if (ack >= 2 || st === 'delivered') {
                        icon = ' <span style="letter-spacing:-2px; opacity:0.6;">\u2713\u2713</span>';
                    } else if (ack >= 1 || st === 'sent') {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    } else if (ack === 0) {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    } else {
                        icon = ' <span style="opacity:0.6;">\u2713</span>';
                    }
                }
            }

            html += '<div class="wa-message ' + (m.fromMe ? 'outgoing' : 'incoming') + '">' +
                '<div class="wa-message-text">' + esc(m.body || '') + '</div>' +
                '<div class="wa-message-time">' + esc(t) + icon + '</div></div>';
        });

        if (state.lastMessagesHtml === html) return;
        state.lastMessagesHtml = html;
        
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    /* ── Theme Detection ────────────────────────────────────────── */
    function updateTheme() {
        var panel = _$('wa-panel-root');
        if (!panel) return;
        
        var saved = localStorage.getItem('wa-theme-pref');
        if (saved) {
             if (saved === 'dark') panel.classList.add('wa-dark');
             else panel.classList.remove('wa-dark');
             return;
        }

        var isDark = document.body.classList.contains('dark') || 
                     document.body.classList.contains('dark-theme') || 
                     document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (isDark) {
            panel.classList.add('wa-dark');
            var moon = panel.querySelector('.wa-theme-icon-moon');
            var sun = panel.querySelector('.wa-theme-icon-sun');
            if (moon) moon.style.display = 'none';
            if (sun) sun.style.display = 'block';
        } else {
            panel.classList.remove('wa-dark');
            var moon = panel.querySelector('.wa-theme-icon-moon');
            var sun = panel.querySelector('.wa-theme-icon-sun');
            if (moon) moon.style.display = 'block';
            if (sun) sun.style.display = 'none';
        }
    }

    function toggleTheme() {
        var panel = _$('wa-panel-root');
        var isDark = panel.classList.contains('wa-dark');
        if (isDark) {
            panel.classList.remove('wa-dark');
            localStorage.setItem('wa-theme-pref', 'light');
            updateTheme();
        } else {
            panel.classList.add('wa-dark');
            localStorage.setItem('wa-theme-pref', 'dark');
            updateTheme();
        }
    }

    /* ── UI Building ────────────────────────────────────────────── */
    function buildButton() {
        if (_$('whatsapp-floating-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'whatsapp-floating-btn';
        btn.id = 'whatsapp-floating-btn';
        btn.innerHTML = WA_SVG + '<span class="wa-status-dot disconnected" id="wa-status-dot"></span>';
        btn.style.display = 'none'; 
        document.body.appendChild(btn);

        btn.addEventListener('click', function () {
            if (state.widgetSuppressedByRoute) return;
            if (!state.panelBuilt) buildPanel();
            toggle();
        });
    }

    function makeDraggable() {
        var panel = _$('wa-panel-root');
        var header = panel.querySelector('.wa-panel-header');
        if (!panel || !header) return;

        var isDragging = false;
        var currentX, currentY, initialX, initialY;
        var xOffset = 0, yOffset = 0;
        var panelWidth, panelHeight, originalLeft, originalTop;
        
        header.style.cursor = 'move';
        
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            e.preventDefault();
            
            if (!xOffset) xOffset = 0;
            if (!yOffset) yOffset = 0;
            
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            var rect = panel.getBoundingClientRect();
            panelWidth = rect.width;
            panelHeight = rect.height;
            originalLeft = rect.left - xOffset;
            originalTop = rect.top - yOffset;

            isDragging = true;
            panel.classList.add('wa-dragging');
            document.body.style.userSelect = 'none';
        }

        function drag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            var rawX = e.clientX - initialX;
            var rawY = e.clientY - initialY;
            
            var SNAP_THRESHOLD = 20;
            var viewportWidth = window.innerWidth;
            var viewportHeight = window.innerHeight;
            
            var proposedLeft = originalLeft + rawX;
            var proposedTop = originalTop + rawY;
            var proposedRight = proposedLeft + panelWidth;
            var proposedBottom = proposedTop + panelHeight;
            
            var finalX = rawX;
            var finalY = rawY;
            
            if (Math.abs(proposedLeft) < SNAP_THRESHOLD) {
                finalX = -originalLeft;
            } 
            else if (Math.abs(viewportWidth - proposedRight) < SNAP_THRESHOLD) {
                finalX = viewportWidth - panelWidth - originalLeft;
            }
            
            if (Math.abs(proposedTop) < SNAP_THRESHOLD) {
                finalY = -originalTop;
            }
            else if (Math.abs(viewportHeight - proposedBottom) < SNAP_THRESHOLD) {
                finalY = viewportHeight - panelHeight - originalTop;
            }

            currentX = finalX;
            currentY = finalY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, panel);
        }

        function dragEnd(e) {
            if (!isDragging) return;
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            
            panel.classList.remove('wa-dragging');
            document.body.style.userSelect = '';
        }
        
        function setTranslate(xPos, yPos, el) {
            el.style.transform = "translate3d(" + xPos + "px, " + yPos + "px, 0)";
        }
    }

    function buildPanel() {
        if (state.panelBuilt) return;
        state.panelBuilt = true;

        var root = document.createElement('div');
        root.id = 'wa-panel-root';
        var panelHtml = [
            '<div class="whatsapp-widget-panel" id="wa-panel">',
            '  <div class="wa-panel-header" style="z-index:10001;position:relative;">',
            '    <button class="wa-back-btn" id="wa-back-btn">\u2190</button>',
            '    <div class="wa-header-info" style="flex:1">',
            '      <div class="wa-title" id="wa-panel-title">WhatsApp</div>',
            '      <div class="wa-status-text" id="wa-panel-status">Checking\u2026</div>',
            '    </div>',
            '    <div class="wa-header-actions" id="wa-header-actions">',
            '       <button class="wa-icon-btn" id="wa-theme-btn" title="Toggle Theme">',
            '           <svg class="wa-theme-icon-sun" style="display:none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.29 1.29c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.29 1.29c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41l-1.29-1.29zm1.41-13.78c-.39-.39-1.02-.39-1.41 0l-1.29 1.29c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.29-1.29c.39-.39.39-1.02 0-1.41zM7.28 17.39c-.39-.39-1.02-.39-1.41 0l-1.29 1.29c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.29-1.29c.39-.39.39-1.02 0-1.41z"/></svg>',
            '           <svg class="wa-theme-icon-moon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>',
            '       </button>',
            '       <button class="wa-icon-btn" id="wa-btn-new-chat" title="New Chat" style="display:none">',
            '           <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
            '       </button>',
            '    </div>',
            '    <button class="wa-logout-btn" id="wa-logout-btn" title="Logout" style="display:none">\u23FB</button>',
            '    <button class="wa-close-btn" id="wa-close-btn">\u2715</button>',
            '  </div>',
            '  <div class="wa-screen active" id="wa-screen-login">',
            '     <div class="wa-login-container">',
            '       <div class="wa-login-card">',
            '         <div class="wa-login-text">',
            '           <div class="wa-login-title">Use WhatsApp on your computer</div>',
            '           <ol class="wa-login-steps">',
            '             <li>Open WhatsApp on your phone</li>',
            '             <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>',
            '             <li>Tap on <strong>Link a Device</strong></li>',
            '             <li>Tap on <strong>Link a Device</strong></li>',
            '             <li>Point your phone to this screen to capture the code</li>',
            '           </ol>',
            '         </div>',
            '         <button class="wa-connect-btn" id="wa-connect-btn">Generate QR Code</button>',
            '         <div class="wa-qr-wrapper">',
            '            <div class="wa-spinner" id="wa-qr-spinner" style="display:none"></div>',
            '            <div class="wa-qr-container" id="wa-qr-container" style="display:none">',
            '            </div>',
            '            <button class="wa-icon-btn" id="wa-btn-refresh-qr" style="display:none" title="Refresh QR">\u21BB Refresh QR</button>',
            '         </div>',
            '       </div>',
            '     </div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-chatList">',
            '     <div class="wa-search-bar">',
            '       <input type="text" id="wa-search-input" autocomplete="off" placeholder="Search chats \u2026">',
            '     </div>', 
            '     <div class="wa-panel-body" id="wa-chat-list"></div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-chat">',
            '     <div class="wa-messages-container" id="wa-messages-container"></div>',
            '     <div class="wa-send-box">',
            '        <button id="wa-emoji-btn" class="wa-emoji-btn" title="Emoji"><i class="far fa-smile"></i></button>',
            '        <input type="text" id="wa-message-input" autocomplete="off" placeholder="Type a message\u2026">',
            '        <button class="wa-send-btn" id="wa-send-btn">' + SEND_SVG + '</button>',
            '     </div>',
            '     <div id="wa-emoji-picker" class="wa-emoji-picker" style="display:none;">' + buildEmojiPicker() + '</div>',
            '  </div>',
            '  <div class="wa-screen" id="wa-screen-contacts">',
            '      <div class="wa-search-bar">',
            '         <input type="text" id="wa-contact-search" autocomplete="off" placeholder="Search contacts \u2026">',
            '      </div>',
            '      <div class="wa-panel-body" id="wa-contacts-list"></div>',
            '  </div>',
            '</div>'
        ].join('');

        root.innerHTML = panelHtml;
        document.body.appendChild(root);
        initAvatarObserver();
        syncWidgetRouteVisibility();
        
        // --- Inject Resizers ---
        var resizers = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        resizers.forEach(function(dir) {
            var el = document.createElement('div');
            el.className = 'wa-resizer ' + dir;
            root.appendChild(el); 
            
            el.addEventListener('mousedown', function(e) {
                e.preventDefault(); e.stopPropagation();
                root.classList.add('wa-resizing'); 
                
                var startX = e.clientX, startY = e.clientY;
                var rect = root.getBoundingClientRect();
                var startW = rect.width, startH = rect.height;
                var styles = window.getComputedStyle(root);
                var startRight = parseFloat(styles.right); 
                var startBottom = parseFloat(styles.bottom); 
                
                function onMove(e) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    
                    if (dir.indexOf('w') !== -1) {
                        root.style.width = Math.max(300, startW - dx) + 'px';
                    }
                    if (dir.indexOf('e') !== -1) {
                         var newW = Math.max(300, startW + dx);
                         root.style.width = newW + 'px';
                         if (!isNaN(startRight)) root.style.right = (startRight - (newW - startW)) + 'px';
                    }
                    
                    if (dir.indexOf('n') !== -1) {
                        root.style.height = Math.max(400, startH - dy) + 'px';
                    }
                    if (dir.indexOf('s') !== -1) {
                        var newH = Math.max(400, startH + dy);
                        root.style.height = newH + 'px';
                        if (!isNaN(startBottom)) root.style.bottom = (startBottom - (newH - startH)) + 'px';
                    }
                }
                function onUp() {
                    root.classList.remove('wa-resizing');
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                }
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
            });
        });
        // --- End Inject Resizers ---

        makeDraggable();

        var closeBtn = _$('wa-close-btn');
        if (closeBtn) closeBtn.onclick = function() { close(); };

        var backBtn = _$('wa-back-btn');
        if (backBtn) backBtn.onclick = function() { showScreen('chatList'); };

        var newChatBtn = _$('wa-btn-new-chat');
        if (newChatBtn) newChatBtn.onclick = function() { loadContacts(); };

        var searchInput = _$('wa-search-input');
        if (searchInput) searchInput.oninput = function() { renderChatList(state.chats); };

        var contactSearch = _$('wa-contact-search');
        if (contactSearch) contactSearch.oninput = function() { renderContacts(state.contacts); };

        var sendBtn = _$('wa-send-btn');
        if (sendBtn) sendBtn.onclick = sendMessage;

        var msgInput = _$('wa-message-input');
        if (msgInput) msgInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });

        var connectBtn = _$('wa-connect-btn');
        if (connectBtn) connectBtn.onclick = startSession;

        var logoutBtn = _$('wa-logout-btn');
        if (logoutBtn) logoutBtn.onclick = logout;

        var themeBtn = _$('wa-theme-btn');
        if (themeBtn) themeBtn.onclick = toggleTheme;
    }

    /* ── Initialization ────────────────────────────────────────── */
    function init() {
        if (state.initialized) return;
        
        // EspoCRM loads its core JS asynchronously. We must wait until Ajax and the base path are ready.
        if (typeof Espo === 'undefined' || !Espo.Ajax || !document.body) {
            setTimeout(init, 500); 
            return;
        }
        state.initialized = true;

        buildButton();
        bindRouteVisibilityHandlers();

        if (syncWidgetRouteVisibility()) {
            return;
        }

        checkStatus();
        startPolling();

        console.log('WhatsApp Widget initialized');
    }

    // Auto-init when document ready or on demand
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); });
    } else {
        setTimeout(init, 1000);
    }

    // Export for manual control
    window.WhatsAppWidget = {
        open: open,
        close: close,
        toggle: toggle,
        openChat: openChat
    };
})();
