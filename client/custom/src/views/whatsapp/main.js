define('custom:views/whatsapp/main', ['view'], function (View) {

    return class extends View {

        templateContent = `
<div class="header-page">
    <div class="clearfix">
        <h3 class="pull-left">{{translate scope category='scopeNamesPlural'}}</h3>
        <div class="pull-right wa-main-toolbar">
            <button type="button" class="btn btn-default btn-sm action" data-action="refresh-all">
                <span class="fas fa-rotate-right"></span>
            </button>
            <button type="button" class="btn btn-success btn-sm action" data-action="open-login-panel" data-role="login-button">
                <span class="fas fa-link"></span> {{translate 'login' category='labels' scope='WhatsApp'}}
            </button>
            <button type="button" class="btn btn-danger btn-sm action" data-action="logout-session" data-role="logout-button">
                <span class="fas fa-power-off"></span> {{translate 'logout' category='labels' scope='WhatsApp'}}
            </button>
            <button type="button" class="btn btn-default btn-sm action" data-action="toggle-history" data-role="history-toggle-button">
                <span class="fas fa-history"></span> {{translate 'conversationHistory' category='labels' scope='WhatsApp'}}
            </button>
            <button type="button" class="btn btn-default btn-sm action" data-action="toggle-folder-panel" data-role="folder-toggle-button">
                <span class="fas fa-folder-open"></span> {{translate 'manageFolders' category='labels' scope='WhatsApp'}}
            </button>
            <button type="button" class="btn btn-default btn-sm action" data-action="open-settings">
                <span class="fas fa-sliders"></span> {{translate 'Integrations' category='labels' scope='Admin'}}
            </button>
        </div>
    </div>
</div>

<div class="wa-main-screen" data-role="main-screen">
    <div class="wa-main-col wa-main-col-chats panel panel-default">
        <div class="panel-heading">
            <div class="wa-main-heading-row">
                <div class="wa-chat-panel-heading">
                    <button type="button" class="btn btn-default btn-sm action wa-burger-trigger" data-action="toggle-chat-tabs">
                        <span class="fas fa-bars"></span>
                    </button>
                    <strong>{{translate 'activeChats' category='labels' scope='WhatsApp'}}</strong>
                </div>
                <span class="wa-chat-list-count" data-role="chat-count"></span>
            </div>
            <div class="wa-main-section-note">
                <span class="small text-muted" data-role="status-chip"></span>
            </div>
            <input type="text" class="form-control input-sm wa-chat-search" data-name="chat-search" placeholder="{{translate 'searchChats' category='labels' scope='WhatsApp'}}">
        </div>
        <div class="panel-body wa-main-scroll" data-role="chat-list"></div>
    </div>

    <div class="wa-tabs-popover" data-role="chat-tabs-panel">
        <div class="wa-tabs-popover-card panel panel-default">
            <div class="panel-heading">
                <div class="wa-main-heading-row">
                    <strong>{{translate 'chatViews' category='labels' scope='WhatsApp'}}</strong>
                    <button type="button" class="btn btn-link btn-sm action" data-action="close-chat-tabs">
                        <span class="fas fa-times"></span>
                    </button>
                </div>
            </div>
            <div class="panel-body wa-main-scroll">
                <div class="wa-side-tabs-shell" data-role="chat-tabs"></div>
            </div>
        </div>
    </div>

    <div class="wa-main-col wa-main-col-thread panel panel-default">
        <div class="panel-heading">
            <div class="wa-main-heading-row">
                <div class="wa-main-heading-copy">
                    <div class="wa-thread-title" data-role="thread-title">{{translate 'selectChat' category='labels' scope='WhatsApp'}}</div>
                    <div class="wa-thread-subtitle" data-role="thread-subtitle">{{translate 'mainScreenIntro' category='labels' scope='WhatsApp'}}</div>
                </div>
            </div>
        </div>
        <div class="panel-body wa-thread-body" data-role="messages"></div>
        <div class="panel-footer">
            <div class="wa-composer">
                <input type="text" class="form-control wa-composer-input" data-name="message-input" placeholder="{{translate 'messagePlaceholder' category='labels' scope='WhatsApp'}}">
                <button type="button" class="btn btn-primary action wa-composer-send" data-action="send-message">{{translate 'sendMessage' category='labels' scope='WhatsApp'}}</button>
            </div>
        </div>
    </div>

    <div class="wa-main-col wa-main-col-context panel panel-default">
        <div class="panel-heading">
            <div class="wa-main-heading-row">
                <strong>{{translate 'chatDetails' category='labels' scope='WhatsApp'}}</strong>
            </div>
        </div>
        <div class="panel-body wa-context-panel-body">
            <div class="wa-context-card" data-role="chat-context"></div>
            <div class="wa-side-history-shell" data-role="history-shell">
                <div class="wa-side-history-header">
                    <strong>{{translate 'conversationHistory' category='labels' scope='WhatsApp'}}</strong>
                </div>
                <div class="wa-main-scroll wa-side-history-list" data-role="conversation-history"></div>
            </div>
        </div>
    </div>

    <div class="wa-login-popover" data-role="login-panel">
        <div class="wa-login-popover-card panel panel-default">
            <div class="panel-heading">
                <div class="wa-main-heading-row">
                    <strong>{{translate 'connectWhatsapp' category='labels' scope='WhatsApp'}}</strong>
                    <button type="button" class="btn btn-link btn-sm action" data-action="close-login-panel">
                        <span class="fas fa-times"></span>
                    </button>
                </div>
            </div>
            <div class="panel-body">
                <div class="wa-login-hint">{{translate 'loginPanelHint' category='labels' scope='WhatsApp'}}</div>
                <div class="wa-login-qr-stage">
                    <div class="wa-login-spinner" data-role="login-spinner"></div>
                    <div class="wa-login-qr-container" data-role="login-qr-container"></div>
                </div>
                <div class="wa-login-actions">
                    <button type="button" class="btn btn-primary btn-sm action" data-action="start-login">
                        {{translate 'generateQr' category='labels' scope='WhatsApp'}}
                    </button>
                    <button type="button" class="btn btn-default btn-sm action" data-action="refresh-login-qr" data-role="refresh-qr-button">
                        {{translate 'refreshQr' category='labels' scope='WhatsApp'}}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="wa-folder-popover" data-role="folder-panel">
        <div class="wa-folder-popover-card panel panel-default">
            <div class="panel-heading">
                <div class="wa-main-heading-row">
                    <strong>{{translate 'chatFolders' category='labels' scope='WhatsApp'}}</strong>
                    <button type="button" class="btn btn-link btn-sm action" data-action="close-folder-panel">
                        <span class="fas fa-times"></span>
                    </button>
                </div>
            </div>
            <div class="panel-body wa-main-scroll">
                <div class="wa-folder-create">
                    <input type="text" class="form-control input-sm wa-folder-input" data-name="folder-name-input" placeholder="{{translate 'newFolderPlaceholder' category='labels' scope='WhatsApp'}}">
                    <button type="button" class="btn btn-primary btn-sm action" data-action="create-chat-folder">
                        {{translate 'addFolder' category='labels' scope='WhatsApp'}}
                    </button>
                </div>
                <div class="wa-folder-panel-note">{{translate 'folderPanelHint' category='labels' scope='WhatsApp'}}</div>
                <div data-role="folder-list"></div>
            </div>
        </div>
    </div>
</div>
`;

        events = {
            'click [data-action="open-settings"]': function () {
                this.getRouter().dispatch('Admin', 'integrations', {name: 'WhatsApp'});
            },
            'click [data-action="refresh-all"]': function () {
                this.refreshActiveData({forceChats: true});
            },
            'click [data-action="open-login-panel"]': function () {
                this.openLoginPanel();
            },
            'click [data-action="toggle-chat-tabs"]': function () {
                this.state.chatTabsOpen = !this.state.chatTabsOpen;

                if (this.state.chatTabsOpen) {
                    this.state.folderPanelOpen = false;
                }

                this.renderFolderPanelState();
                this.renderChatTabsPanelState();
            },
            'click [data-action="close-chat-tabs"]': function () {
                this.state.chatTabsOpen = false;
                this.renderChatTabsPanelState();
            },
            'click [data-action="toggle-folder-panel"]': function () {
                const nextState = !this.state.folderPanelOpen;

                this.state.folderPanelOpen = nextState;

                if (nextState) {
                    this.state.chatTabsOpen = false;
                }

                this.renderFolderPanelState();
                this.renderChatTabsPanelState();
                this.renderFolderPanel();
            },
            'click [data-action="close-folder-panel"]': function () {
                this.state.folderPanelOpen = false;
                this.renderFolderPanelState();
            },
            'click [data-action="close-login-panel"]': function () {
                this.closeLoginPanel();
            },
            'click [data-action="start-login"]': function () {
                this.startLoginSession();
            },
            'click [data-action="refresh-login-qr"]': function () {
                this.refreshLoginQr();
            },
            'click [data-action="logout-session"]': function () {
                this.logoutSession();
            },
            'click [data-action="toggle-history"]': function () {
                this.state.historyVisible = !this.state.historyVisible;

                if (
                    this.state.historyVisible &&
                    this.state.activeChatId &&
                    !this.state.loadingHistory &&
                    !this.isGroupChat(this.state.activeChatId) &&
                    !this.state.conversations.length
                ) {
                    this.loadConversationHistory(this.state.activeChatId, this.chatRequestToken);
                }

                this.renderHistoryPanelState();
            },
            'input [data-name="chat-search"]': function () {
                this.renderChatList();
            },
            'click [data-action="select-chat-tab"]': function (e) {
                this.selectChatTab(e.currentTarget.getAttribute('data-tab-id'));
            },
            'click [data-action="select-chat"]': function (e) {
                this.openChat(
                    e.currentTarget.getAttribute('data-chat-id'),
                    e.currentTarget.getAttribute('data-chat-name')
                );
            },
            'click [data-action="jump-conversation"]': function (e) {
                this.jumpToConversation(e.currentTarget.getAttribute('data-message-id'));
            },
            'click [data-action="create-contact"]': function () {
                this.createContactFromChat();
            },
            'click [data-action="create-chat-folder"]': function () {
                this.createChatFolder();
            },
            'keypress [data-name="folder-name-input"]': function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createChatFolder();
                }
            },
            'change [data-action="toggle-folder-membership"]': function (e) {
                this.setChatFolderMembership(
                    e.currentTarget.getAttribute('data-folder-id'),
                    !!e.currentTarget.checked
                );
            },
            'click [data-action="activate-folder-tab"]': function (e) {
                this.state.folderPanelOpen = false;
                this.renderFolderPanelState();
                this.selectChatTab('folder:' + e.currentTarget.getAttribute('data-folder-id'));
            },
            'click [data-action="delete-chat-folder"]': function (e) {
                this.deleteChatFolder(e.currentTarget.getAttribute('data-folder-id'));
            },
            'click [data-action="open-linked-record"]': function (e) {
                const type = e.currentTarget.getAttribute('data-entity-type');
                const id = e.currentTarget.getAttribute('data-entity-id');

                if (type && id) {
                    this.getRouter().navigate('#' + type + '/view/' + id, {trigger: true});
                }
            },
            'click [data-action="send-message"]': function () {
                this.sendMessage();
            },
            'keypress [data-name="message-input"]': function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            }
        };

        setup() {
            this.state = {
                status: 'unknown',
                isConnected: false,
                chats: [],
                contacts: [],
                activeChatId: null,
                activeChatName: '',
                activeChatPhone: '',
                messages: [],
                conversations: [],
                chatContext: null,
                historyVisible: true,
                loginPanelOpen: false,
                sessionStarting: false,
                loadingChats: false,
                loadingContacts: false,
                loadingMessages: false,
                loadingHistory: false,
                loadingContext: false,
                chatTabsOpen: false,
                chatFolders: [],
                activeChatTab: 'all',
                folderPanelOpen: false
            };
            this.chatListCacheKey = 'wa-main-chat-list-cache-v1';
            this.chatListCacheTtl = 12 * 60 * 60 * 1000;
            this.chatsLoadedAt = 0;
            this.messageCacheByChat = {};
            this.chatRefreshTimer = null;
            this.contactRefreshTimer = null;
            this.lazyContactsTimer = null;
            this.activeChatRefreshTimer = null;
            this.statusRefreshTimer = null;
            this.realtimeChatRefreshTimer = null;
            this.webSocketManager = null;
            this.webSocketHandler = null;
            this.realtimeSubscribed = false;
            this.postLoginChatRetryTimer = null;
            this.chatRequestToken = null;
            this.historyRequestToken = null;
            this.contextRequestToken = null;
            this.chatLiveRefreshPromise = null;
            this.boundWindowResize = this.applyViewportHeight.bind(this);
            this.qrPollTimeout = null;
            this.qrLibPromise = null;
            this.lastQrString = null;
            this.state.chats = this.getChatListCache();
            this.ensureStyles();
        }

        data() {
            return {
                scope: 'WhatsApp'
            };
        }

        afterRender() {
            this.renderAll();
            this.applyViewportHeight();

            if (this._initialized) {
                return;
            }

            this._initialized = true;
            window.addEventListener('resize', this.boundWindowResize);
            this.ensureQrLib().catch(() => {});
            this.loadInitial();
            this.startTimers();
            this.subscribeToRealTime();
        }

        onRemove() {
            if (this.chatRefreshTimer) {
                clearInterval(this.chatRefreshTimer);
            }

            if (this.contactRefreshTimer) {
                clearInterval(this.contactRefreshTimer);
            }

            if (this.lazyContactsTimer) {
                clearTimeout(this.lazyContactsTimer);
                this.lazyContactsTimer = null;
            }

            if (this.activeChatRefreshTimer) {
                clearInterval(this.activeChatRefreshTimer);
            }

            if (this.statusRefreshTimer) {
                clearInterval(this.statusRefreshTimer);
            }

            if (this.realtimeChatRefreshTimer) {
                clearTimeout(this.realtimeChatRefreshTimer);
                this.realtimeChatRefreshTimer = null;
            }

            if (this.postLoginChatRetryTimer) {
                clearTimeout(this.postLoginChatRetryTimer);
                this.postLoginChatRetryTimer = null;
            }

            if (this.boundWindowResize) {
                window.removeEventListener('resize', this.boundWindowResize);
            }

            if (this.qrPollTimeout) {
                clearTimeout(this.qrPollTimeout);
                this.qrPollTimeout = null;
            }

            this.unsubscribeFromRealTime();
        }

        ensureStyles() {
            const href = 'client/custom/css/whatsapp-main-screen.css?v=2026.04.10.1';
            const existing = document.getElementById('wa-main-screen-styles');

            if (existing) {
                if (existing.getAttribute('href') !== href) {
                    existing.setAttribute('href', href);
                }
                return;
            }

            const link = document.createElement('link');
            link.id = 'wa-main-screen-styles';
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }

        apiGet(url, data) {
            return Espo.Ajax.getRequest(url, data || {});
        }

        apiPost(url, data) {
            return Espo.Ajax.postRequest(url, data || {});
        }

        getWebSocketLocationParts() {
            const protocolPart = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            let url = window.location.host;

            if (protocolPart === 'wss://') {
                url += '/wss';
            }

            return {protocolPart, url};
        }

        getStoredWebSocketAuth() {
            let auth = window.localStorage.getItem('espo-user-auth') || window.sessionStorage.getItem('espo-user-auth') || '';
            let userId = window.localStorage.getItem('espo-user-lastUserId') || window.sessionStorage.getItem('espo-user-lastUserId') || 'system';

            if (auth && auth.charAt(0) === '"') {
                try {
                    auth = JSON.parse(auth);
                } catch (e) {}
            }

            if (userId && userId.charAt(0) === '"') {
                try {
                    userId = JSON.parse(userId);
                } catch (e) {}
            }

            return {auth, userId};
        }

        ensureMainWebSocketManager() {
            return new Promise((resolve, reject) => {
                if (this.webSocketManager) {
                    resolve(this.webSocketManager);
                    return;
                }

                if (typeof Espo === 'undefined' || !Espo.loader || !Espo.loader.require) {
                    reject(new Error('Espo loader not available'));
                    return;
                }

                Espo.loader.require('di', diModule => {
                    Espo.loader.require('web-socket-manager', WebSocketManagerModule => {
                        try {
                            const WebSocketManagerClass =
                                (WebSocketManagerModule && WebSocketManagerModule.default) || WebSocketManagerModule;
                            const container = diModule && diModule.container;

                            if (!container || !container.get || !WebSocketManagerClass) {
                                reject(new Error('Espo DI webSocketManager is unavailable'));
                                return;
                            }

                            const manager = container.get(WebSocketManagerClass);

                            if (!manager) {
                                reject(new Error('Espo webSocketManager instance not found'));
                                return;
                            }

                            this.webSocketManager = manager;
                            resolve(manager);
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            });
        }

        subscribeToRealTime() {
            if (this.realtimeSubscribed) {
                return;
            }

            this.ensureMainWebSocketManager()
                .then(manager => {
                    const locationParts = this.getWebSocketLocationParts();
                    const authState = this.getStoredWebSocketAuth();
                    const shouldReconnect =
                        manager.protocolPart !== locationParts.protocolPart ||
                        manager.url !== locationParts.url;

                    manager.protocolPart = locationParts.protocolPart;
                    manager.url = locationParts.url;

                    const isEnabled = typeof manager.isEnabled === 'function' ? manager.isEnabled() : true;

                    if (typeof manager.setEnabled === 'function' && !isEnabled) {
                        manager.setEnabled();
                    }

                    if (shouldReconnect && manager.connection && !manager.isConnected) {
                        manager.connection = null;
                        manager.isConnecting = false;
                    }

                    if (!manager.connection && authState.auth && authState.userId) {
                        manager.connect(authState.auth, authState.userId);
                    } else if (!manager.isConnected && !manager.isConnecting && authState.auth && authState.userId) {
                        manager.connect(authState.auth, authState.userId);
                    }

                    if (!this.webSocketHandler) {
                        this.webSocketHandler = (topic, data) => this.handleRealtimeEvent(topic, data);
                    }

                    manager.unsubscribe('WhatsApp', this.webSocketHandler);
                    manager.subscribe('WhatsApp', this.webSocketHandler);
                    this.realtimeSubscribed = true;
                })
                .catch(error => {
                    console.warn('WhatsApp main: failed to attach to Espo webSocketManager', error);
                });
        }

        unsubscribeFromRealTime() {
            if (!this.webSocketManager || !this.webSocketHandler) {
                return;
            }

            try {
                this.webSocketManager.unsubscribe('WhatsApp', this.webSocketHandler);
            } catch (e) {}

            this.realtimeSubscribed = false;
        }

        handleRealtimeEvent(topic, data) {
            if (typeof topic === 'string' && topic !== 'WhatsApp') {
                return;
            }

            let payload = typeof topic === 'object' && !data ? topic : data;

            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch (e) {
                    return;
                }
            }

            if (!payload || !payload.action) {
                return;
            }

            const eventData = payload.data || payload;
            const chatId = payload.chatId || (eventData && eventData.chatId);

            if (eventData && chatId && !eventData.chatId) {
                eventData.chatId = chatId;
            }

            if (payload.action === 'message') {
                this.applyRealtimeMessage(eventData);
                return;
            }

            if (payload.action === 'message_ack') {
                this.applyRealtimeAck(eventData, chatId);
                return;
            }

            if (payload.action === 'conversation' && chatId && chatId === this.state.activeChatId) {
                this.loadConversationHistory(chatId, this.chatRequestToken);
                return;
            }

            if (payload.action === 'lifecycle') {
                const wasConnected = this.state.isConnected;
                const nextStatus = eventData && eventData.state ? eventData.state : this.state.status;

                this.state.status = nextStatus;
                this.state.isConnected = this.isConnectedStatus(nextStatus);
                this.renderStatus();

                if (this.state.isConnected && !wasConnected) {
                    this.scheduleRealtimeChatRefresh(250);
                }
            }
        }

        isConnectedStatus(status) {
            const value = String(status || '').toLowerCase();

            return value === 'connected' ||
                value === 'authenticated' ||
                value === 'ready' ||
                value === 'open';
        }

        getChatListCache() {
            try {
                const raw = window.localStorage.getItem(this.chatListCacheKey);

                if (!raw) {
                    return [];
                }

                const parsed = JSON.parse(raw);

                if (!parsed || !Array.isArray(parsed.list)) {
                    return [];
                }

                if (parsed.savedAt && (Date.now() - parsed.savedAt) > this.chatListCacheTtl) {
                    window.localStorage.removeItem(this.chatListCacheKey);
                    return [];
                }

                return parsed.list;
            } catch (e) {
                return [];
            }
        }

        saveChatListCache(chatList) {
            try {
                const list = (chatList || []).slice(0, 200);

                window.localStorage.setItem(this.chatListCacheKey, JSON.stringify({
                    savedAt: Date.now(),
                    list: list
                }));
            } catch (e) {}
        }

        getCachedMessages(chatId) {
            if (!chatId) {
                return [];
            }

            const list = this.messageCacheByChat[chatId];

            return Array.isArray(list) ? list.slice() : [];
        }

        saveCachedMessages(chatId, messageList) {
            if (!chatId || !Array.isArray(messageList) || !messageList.length) {
                return;
            }

            this.messageCacheByChat[chatId] = this.trimCachedMessages(messageList, 300);
        }

        buildPreviewMessageFromChat(chat) {
            const lastMessage = chat && chat.lastMessage ? chat.lastMessage : null;

            if (!lastMessage) {
                return [];
            }

            const chatId = this.getChatId(chat);
            const timestamp = this.getMessageTimestamp(lastMessage) || this.getLastMessageTimestamp(chat);
            const messageId = this.getMessageIdentity(lastMessage) || `preview-${chatId}-${timestamp || Date.now()}`;
            const body = String(lastMessage.body || lastMessage.caption || lastMessage.bodyPreview || this.getChatPreview(chat) || '');

            if (!body) {
                return [];
            }

            return [{
                id: messageId,
                messageId: messageId,
                body: body,
                bodyPreview: body,
                chatId: chatId,
                fromMe: !!lastMessage.fromMe,
                timestamp: timestamp || Math.floor(Date.now() / 1000),
                ack: lastMessage.ack || (lastMessage.fromMe ? 1 : 0),
                status: lastMessage.fromMe ? 'Sent' : 'Received',
                sortSequence: ((timestamp || 0) * 10000),
                payloadMeta: {
                    source: 'chatListPreview'
                }
            }];
        }

        async fetchStoredMessages(chatId, limit) {
            if (!chatId) {
                return [];
            }

            try {
                const response = await this.apiGet('WhatsApp/action/getChatMessages', {
                    chatId: chatId,
                    limit: limit || 120,
                    mode: 'stored'
                });

                const list = Array.isArray(response.list) ? response.list.slice() : [];

                return this.sortMessageList(list);
            } catch (e) {
                return [];
            }
        }

        mergeMessageList(existingList, incomingList) {
            const result = (existingList || []).map(message => Object.assign({}, message));
            const newestFirst = this.isMessageListNewestFirst(result);
            const rebuildIndexMap = () => {
                const nextMap = new Map();

                result.forEach((message, index) => {
                    if (!message) {
                        return;
                    }

                    const key = String(message.messageId || message.id || '');

                    if (key) {
                        nextMap.set(key, index);
                    }
                });

                return nextMap;
            };
            let indexMap = rebuildIndexMap();

            (incomingList || []).forEach(message => {
                if (!message) {
                    return;
                }

                const normalized = Object.assign({}, message);
                const key = String(normalized.messageId || normalized.id || '');

                if (key && indexMap.has(key)) {
                    result[indexMap.get(key)] = normalized;
                    return;
                }

                if (key) {
                    if (newestFirst) {
                        result.unshift(normalized);
                        indexMap = rebuildIndexMap();
                        return;
                    }

                    indexMap.set(key, result.length);
                }

                result.push(normalized);
            });

            return result;
        }

        isMessageListNewestFirst(list) {
            if (!Array.isArray(list) || list.length < 2) {
                return false;
            }

            return this.getMessageTimestamp(list[0]) > this.getMessageTimestamp(list[list.length - 1]);
        }

        trimCachedMessages(list, maxSize) {
            const normalizedList = Array.isArray(list) ? list.slice() : [];

            if (!normalizedList.length || normalizedList.length <= maxSize) {
                return normalizedList;
            }

            return this.isMessageListNewestFirst(normalizedList)
                ? normalizedList.slice(0, maxSize)
                : normalizedList.slice(-maxSize);
        }

        async loadInitial() {
            await this.loadStatus();
            this.loadChatFolders(true);
            await this.loadChats();
            this.scheduleLazyContactsLoad(2500);
        }

        startTimers() {
            this.statusRefreshTimer = setInterval(() => {
                if (document.hidden) {
                    return;
                }

                const wasConnected = this.state.isConnected;

                this.loadStatus().then(() => {
                    if (this.state.isConnected && (!wasConnected || !this.state.chats.length)) {
                        this.loadChats(true, {forceRefresh: true});
                    }
                });
            }, 10000);

            this.chatRefreshTimer = setInterval(() => {
                this.loadChats(true);
            }, 15000);

            this.contactRefreshTimer = setInterval(() => {
                this.loadContacts(true);
            }, 120000);

            this.activeChatRefreshTimer = setInterval(() => {
                if (!this.state.activeChatId || this.state.loadingMessages || document.hidden) {
                    return;
                }

                this.refreshActiveChatMessages();
            }, 20000);
        }

        async refreshActiveData(options) {
            options = options || {};

            if (options.forceChats) {
                // Load contacts, folders, and chats in parallel for faster startup
                await Promise.all([
                    this.loadContacts(true),
                    this.loadChatFolders(true),
                    this.loadChats(true, {forceRefresh: true})
                ]);
            }

            // Defer loading of the active chat's messages to avoid blocking the main UI render
            if (this.state.activeChatId) {
                setTimeout(() => {
                    this.loadChatData(this.state.activeChatId, this.state.activeChatName, true);
                }, 0);
            }
        }

        async loadStatus() {
            try {
                const response = await this.apiGet('WhatsApp/action/status');
                this.state.status = response.status || 'unknown';
                this.state.isConnected = !!response.isConnected;
            } catch (e) {
                this.state.status = 'error';
                this.state.isConnected = false;
            }

            this.renderStatus();
        }

        async loadChats(silent, options) {
            options = options || {};
            const forceRefresh = !!options.forceRefresh;
            const retryAttempt = Number(options.retryAttempt || 0);

            if (!this.state.chats.length) {
                const cached = this.getChatListCache();

                if (cached.length) {
                    this.state.chats = cached;
                    this.renderChatTabs();
                    this.renderChatList();
                }
            }

            if (this.state.loadingChats) {
                return;
            }

            if (!forceRefresh && !silent && this.chatsLoadedAt && (Date.now() - this.chatsLoadedAt) < 5000 && this.state.chats.length) {
                this.renderChatTabs();
                this.renderChatList();
                return;
            }

            this.state.loadingChats = true;

            if (!silent || !this.state.chats.length) {
                this.renderChatList(true);
            }

            try {
                const response = await this.apiGet('WhatsApp/action/getChats', forceRefresh ? {refresh: true} : {});
                const list = Array.isArray(response.list) ? response.list : [];

                if (list.length || !this.state.chats.length) {
                    this.state.chats = list;
                    this.saveChatListCache(this.state.chats);
                }

                this.chatsLoadedAt = Date.now();

                if (
                    !forceRefresh &&
                    this.state.isConnected &&
                    (response.fromCache || response.stale || !this.state.chats.length)
                ) {
                    this.refreshChatsInBackground();
                }
            } catch (e) {
                if (!silent) {
                    Espo.Ui.error('Unable to load WhatsApp chats.');
                }
            }

            this.state.loadingChats = false;
            this.renderChatList();
            this.renderChatTabs();

            if (this.state.chats.length && this.postLoginChatRetryTimer) {
                clearTimeout(this.postLoginChatRetryTimer);
                this.postLoginChatRetryTimer = null;
            }

            if (this.state.isConnected && !this.state.chats.length && retryAttempt < 6) {
                this.schedulePostLoginChatRetry(retryAttempt + 1);
            }

            const visibleChatList = this.getVisibleChats();

            if (this.state.activeChatId) {
                const hasActiveChat = visibleChatList.some(chat => this.getChatId(chat) === this.state.activeChatId);

                if (!hasActiveChat) {
                    this.clearActiveChatState();
                    this.renderAll();
                }
                return;
            }
        }

        schedulePostLoginChatRetry(attempt) {
            if (this.postLoginChatRetryTimer) {
                clearTimeout(this.postLoginChatRetryTimer);
            }

            this.postLoginChatRetryTimer = setTimeout(() => {
                this.loadChats(true, {
                    forceRefresh: true,
                    retryAttempt: attempt
                });
            }, Math.min(5000, 1000 * Math.max(1, attempt)));
        }

        refreshChatsInBackground() {
            if (this.chatLiveRefreshPromise) {
                return this.chatLiveRefreshPromise;
            }

            this.chatLiveRefreshPromise = this.apiGet('WhatsApp/action/getChats', {refresh: true})
                .then(response => {
                    const list = Array.isArray(response.list) ? response.list : [];

                    if (!list.length) {
                        return;
                    }

                    this.state.chats = list;
                    this.chatsLoadedAt = Date.now();
                    this.saveChatListCache(list);
                    this.renderChatTabs();
                    this.renderChatList();

                    if (this.state.activeChatId) {
                        this.syncActiveChatToVisibleList();
                    }
                })
                .catch(() => {})
                .finally(() => {
                    this.chatLiveRefreshPromise = null;
                });

            return this.chatLiveRefreshPromise;
        }

        scheduleRealtimeChatRefresh(delay) {
            if (this.realtimeChatRefreshTimer) {
                clearTimeout(this.realtimeChatRefreshTimer);
            }

            this.realtimeChatRefreshTimer = setTimeout(() => {
                this.realtimeChatRefreshTimer = null;

                if (!this.state.isConnected) {
                    return;
                }

                this.loadChats(true, {forceRefresh: true});
            }, delay || 800);
        }

        applyRealtimeMessage(message) {
            if (!message) {
                return;
            }

            if (!this.state.isConnected) {
                this.state.status = 'connected';
                this.state.isConnected = true;
                this.renderStatus();
            }

            const chatId = message.chatId || message.from || message.to || null;

            if (!chatId) {
                return;
            }

            this.upsertChatPreviewFromMessage(chatId, message);

            if (this.state.activeChatId === chatId) {
                this.state.messages = this.sortMessageList(this.mergeMessageList(this.state.messages, [message]));
                this.saveCachedMessages(chatId, this.state.messages);
                this.renderMessages();

                if (!this.isGroupChat(chatId)) {
                    this.loadConversationHistory(chatId, this.chatRequestToken);
                }
            }

            this.scheduleRealtimeChatRefresh();
        }

        applyRealtimeAck(ackData, chatId) {
            if (!ackData || !chatId || this.state.activeChatId !== chatId) {
                return;
            }

            const ackId = this.getMessageIdentity(ackData);

            if (!ackId) {
                return;
            }

            let changed = false;

            this.state.messages = (this.state.messages || []).map(message => {
                if (this.getMessageIdentity(message) !== ackId) {
                    return message;
                }

                changed = true;

                return Object.assign({}, message, {
                    ack: ackData.ack,
                    status: ackData.status || message.status
                });
            });

            if (changed) {
                this.saveCachedMessages(chatId, this.state.messages);
                this.renderMessages();
            }
        }

        upsertChatPreviewFromMessage(chatId, message) {
            const list = (this.state.chats || []).slice();
            const index = list.findIndex(chat => this.getChatId(chat) === chatId);
            const timestamp = this.getMessageTimestamp(message) || Math.floor(Date.now() / 1000);
            const lastMessage = Object.assign({}, message, {
                chatId: chatId,
                timestamp: timestamp
            });
            const shouldIncreaseUnread =
                !message.fromMe &&
                this.state.activeChatId !== chatId;

            if (index >= 0) {
                const current = Object.assign({}, list[index]);

                current.lastMessage = lastMessage;
                current.timestamp = timestamp;
                current.unreadCount = shouldIncreaseUnread ? Number(current.unreadCount || 0) + 1 : current.unreadCount;
                list[index] = current;
            } else {
                list.push({
                    id: chatId,
                    chatId: chatId,
                    name: this.extractPhoneNumber(chatId),
                    timestamp: timestamp,
                    unreadCount: shouldIncreaseUnread ? 1 : 0,
                    isGroup: this.isGroupChat(chatId),
                    lastMessage: lastMessage
                });
            }

            this.state.chats = this.sortChatsByTimestamp(list);
            this.saveChatListCache(this.state.chats);
            this.renderChatTabs();
            this.renderChatList();
        }

        sortChatsByTimestamp(list) {
            return (list || []).slice().sort((a, b) => {
                const timestampA = this.getLastMessageTimestamp(a) || Number(a && a.timestamp || 0);
                const timestampB = this.getLastMessageTimestamp(b) || Number(b && b.timestamp || 0);

                return timestampB - timestampA;
            });
        }

        async loadContacts(silent) {
            if (this.state.loadingContacts) {
                return;
            }

            this.state.loadingContacts = true;

            try {
                const response = await this.apiGet('WhatsApp/action/getContacts');
                this.state.contacts = Array.isArray(response.list) ? response.list : [];
            } catch (e) {
                if (!silent) {
                    Espo.Ui.error('Unable to load WhatsApp contacts.');
                }
            }

            this.state.loadingContacts = false;
        }

        scheduleLazyContactsLoad(delay) {
            if (this.lazyContactsTimer || this.state.contacts.length) {
                return;
            }

            this.lazyContactsTimer = setTimeout(() => {
                this.lazyContactsTimer = null;
                this.loadContacts(true).then(() => {
                    this.renderChatList();

                    if (this.state.activeChatId) {
                        this.state.activeChatPhone = this.getChatPhone(this.findChatById(this.state.activeChatId)) || this.state.activeChatPhone;
                        this.renderContext();
                    }
                });
            }, delay || 3000);
        }

        async loadChatFolders(silent) {
            try {
                const response = await this.apiGet('WhatsApp/action/getChatFolders');
                this.state.chatFolders = Array.isArray(response.list) ? response.list : [];
            } catch (e) {
                if (!silent) {
                    Espo.Ui.error('Unable to load WhatsApp folders.');
                }
            }

            if (
                this.state.activeChatTab &&
                this.state.activeChatTab.indexOf('folder:') === 0 &&
                !this.getActiveCustomFolder()
            ) {
                this.state.activeChatTab = 'all';
            }
        }

        async openChat(chatId, chatName) {
            if (!chatId) {
                return;
            }

            const chat = this.findChatById(chatId);
            this.state.activeChatId = chatId;
            this.state.activeChatName = chatName || this.extractPhoneNumber(chatId);
            this.state.activeChatPhone = this.getChatPhone(chat);
            return this.loadChatData(chatId, this.state.activeChatName);
        }

        async loadChatData(chatId, chatName, silent) {
            const token = String(Date.now()) + ':' + Math.random();
            const cachedMessages = this.getCachedMessages(chatId);
            const chat = this.findChatById(chatId);
            const previewMessages = cachedMessages.length ? [] : this.buildPreviewMessageFromChat(chat);
            const preserveCurrentMessages = silent &&
                this.state.activeChatId === chatId &&
                Array.isArray(this.state.messages) &&
                this.state.messages.length;

            this.chatRequestToken = token;
            this.state.activeChatId = chatId;
            this.state.activeChatName = chatName || this.extractPhoneNumber(chatId);
            this.state.activeChatPhone = this.getChatPhone(chat) || this.state.activeChatPhone;
            this.state.loadingMessages = !preserveCurrentMessages && !cachedMessages.length && !previewMessages.length;
            this.state.loadingHistory = !this.isGroupChat(chatId);
            this.state.loadingContext = true;
            this.state.messages = preserveCurrentMessages
                ? this.state.messages.slice()
                : (cachedMessages.length ? cachedMessages.slice() : previewMessages);
            this.state.conversations = [];
            this.state.chatContext = null;

            if (!silent || cachedMessages.length || previewMessages.length || preserveCurrentMessages) {
                this.renderChatList();
                this.renderMessages();
            }

            this.renderContext();

            this.loadConversationHistory(chatId, token);

            this.loadChatContext(chatId, token);

            try {
                const storedList = await this.fetchStoredMessages(chatId, 40);

                if (this.chatRequestToken !== token) {
                    return;
                }

                if (storedList.length) {
                    this.state.messages = storedList;
                    this.saveCachedMessages(chatId, storedList);
                } else if (!preserveCurrentMessages && !cachedMessages.length && previewMessages.length) {
                    this.saveCachedMessages(chatId, previewMessages);
                }
            } catch (e) {}

            if (this.chatRequestToken !== token) {
                return;
            }

            this.state.loadingMessages = false;
            this.renderMessages();

            if (!this.state.isConnected) {
                return;
            }

            this.apiGet('WhatsApp/action/getChatMessages', {
                chatId: chatId,
                limit: 40,
                refresh: true,
                sync: false
            }).then(response => {
                if (this.chatRequestToken !== token) {
                    return;
                }

                const list = Array.isArray(response.list) ? response.list : [];

                if (!list.length) {
                    return;
                }

                this.state.messages = list.slice();
                this.saveCachedMessages(chatId, this.state.messages);
                this.renderMessages();
            }).catch(() => {});
        }

        async refreshActiveChatMessages() {
            const chatId = this.state.activeChatId;

            if (!chatId) {
                return;
            }

            try {
                const storedList = await this.fetchStoredMessages(chatId, 40);

                if (!storedList.length || this.state.activeChatId !== chatId) {
                    return;
                }

                this.state.messages = storedList;
                this.saveCachedMessages(chatId, storedList);
                this.renderMessages();
            } catch (e) {}
        }

        async loadChatContext(chatId, token) {
            if (!chatId) {
                return;
            }

            const contextToken = token || this.chatRequestToken || String(Date.now());

            this.state.loadingContext = true;
            this.renderContext();
            this.contextRequestToken = contextToken;

            return this.apiGet('WhatsApp/action/getChatContext', {
                chatId: chatId,
                phoneNumber: this.state.activeChatPhone || undefined
            }).then(response => {
                if (this.contextRequestToken !== contextToken || this.state.activeChatId !== chatId) {
                    return;
                }

                this.state.chatContext = response.data || null;
                this.state.loadingContext = false;
                this.renderContext();
                this.renderMessages();
            }).catch(() => {
                if (this.contextRequestToken !== contextToken || this.state.activeChatId !== chatId) {
                    return;
                }

                this.state.chatContext = null;
                this.state.loadingContext = false;
                this.renderContext();
            });
        }

        async loadConversationHistory(chatId, token) {
            if (!chatId) {
                this.state.conversations = [];
                this.state.loadingHistory = false;
                this.renderConversationHistory();
                return;
            }

            if (this.isGroupChat(chatId)) {
                this.state.conversations = [];
                this.state.loadingHistory = false;
                this.renderConversationHistory();
                return;
            }

            const historyToken = token || this.chatRequestToken || String(Date.now());

            this.historyRequestToken = historyToken;
            this.state.loadingHistory = true;
            this.renderConversationHistory();

            return this.apiGet('WhatsApp/action/getConversationHistory', {chatId: chatId, limit: 20})
                .then(response => {
                    if (this.historyRequestToken !== historyToken || this.state.activeChatId !== chatId) {
                        return;
                    }

                    this.state.conversations = Array.isArray(response.list) ? response.list : [];
                    this.state.loadingHistory = false;
                    this.renderConversationHistory();
                })
                .catch(() => {
                    if (this.historyRequestToken !== historyToken || this.state.activeChatId !== chatId) {
                        return;
                    }

                    this.state.conversations = [];
                    this.state.loadingHistory = false;
                    this.renderConversationHistory();
                });
        }

        async sendMessage() {
            const input = this.$el.find('[data-name="message-input"]');
            const text = (input.val() || '').trim();

            if (!text || !this.state.activeChatId) {
                return;
            }

            try {
                const response = await this.apiPost('WhatsApp/action/sendMessage', {
                    chatId: this.state.activeChatId,
                    message: text
                });
                input.val('');

                if (response && response.message) {
                    this.state.messages = this.mergeMessageList(this.state.messages, [response.message]);
                    this.saveCachedMessages(this.state.activeChatId, this.state.messages);
                    this.renderMessages();
                }

                this.loadChats(true, {forceRefresh: true});
                this.loadChatData(this.state.activeChatId, this.state.activeChatName, true);
            } catch (e) {
                Espo.Ui.error('Unable to send the WhatsApp message.');
            }
        }

        async createContactFromChat() {
            if (!this.state.activeChatId) {
                return;
            }

            try {
                await this.apiPost('WhatsApp/action/createContactFromChat', {
                    chatId: this.state.activeChatId,
                    displayName: this.state.activeChatName,
                    phoneNumber: this.state.activeChatPhone || undefined
                });

                this.loadChatContext(this.state.activeChatId, this.chatRequestToken);

                this.loadConversationHistory(this.state.activeChatId, this.chatRequestToken);

                Espo.Ui.success('Contatto CRM creato.');
            } catch (e) {
                Espo.Ui.error('Unable to create the CRM contact from WhatsApp.');
            }
        }

        async createChatFolder() {
            const input = this.$el.find('[data-name="folder-name-input"]');
            const name = String(input.val() || '').trim();

            if (!name) {
                return;
            }

            try {
                const response = await this.apiPost('WhatsApp/action/createChatFolder', {name});
                this.state.chatFolders = Array.isArray(response.list) ? response.list : [];
                input.val('');

                const createdFolder = this.state.chatFolders[this.state.chatFolders.length - 1] || null;

                if (createdFolder && createdFolder.id) {
                    this.state.activeChatTab = 'folder:' + createdFolder.id;

                    if (this.state.activeChatId) {
                        const membershipResponse = await this.apiPost('WhatsApp/action/setChatFolderMembership', {
                            folderId: createdFolder.id,
                            chatId: this.state.activeChatId,
                            enabled: true
                        });

                        this.state.chatFolders = Array.isArray(membershipResponse.list) ? membershipResponse.list : this.state.chatFolders;
                    }
                }

                this.renderChatTabs();
                this.renderChatList();
                this.renderFolderPanel();
                await this.syncActiveChatToVisibleList();
            } catch (e) {
                Espo.Ui.error('Unable to create the chat folder.');
            }
        }

        async setChatFolderMembership(folderId, enabled) {
            if (!folderId || !this.state.activeChatId) {
                return;
            }

            try {
                const response = await this.apiPost('WhatsApp/action/setChatFolderMembership', {
                    folderId,
                    chatId: this.state.activeChatId,
                    enabled: !!enabled
                });

                this.state.chatFolders = Array.isArray(response.list) ? response.list : [];

                this.renderChatTabs();
                this.renderChatList();
                this.renderFolderPanel();
                await this.syncActiveChatToVisibleList();
            } catch (e) {
                Espo.Ui.error('Unable to update chat folder membership.');
            }
        }

        async deleteChatFolder(folderId) {
            if (!folderId) {
                return;
            }

            if (!window.confirm('Sei sicuro di voler eliminare questa cartella chat?')) {
                return;
            }

            try {
                const response = await this.apiPost('WhatsApp/action/deleteChatFolder', {folderId});
                this.state.chatFolders = Array.isArray(response.list) ? response.list : [];

                if (this.state.activeChatTab === 'folder:' + folderId) {
                    this.state.activeChatTab = 'all';
                }

                this.renderChatTabs();
                this.renderChatList();
                this.renderFolderPanel();
                await this.syncActiveChatToVisibleList();
            } catch (e) {
                Espo.Ui.error('Unable to delete the chat folder.');
            }
        }

        async selectChatTab(tabId) {
            if (!tabId || this.state.activeChatTab === tabId) {
                this.state.chatTabsOpen = false;
                this.renderChatTabsPanelState();
                return;
            }

            this.state.activeChatTab = tabId;
            this.state.chatTabsOpen = false;
            this.renderChatTabsPanelState();
            this.renderChatTabs();
            this.renderChatList();
            await this.syncActiveChatToVisibleList();
        }

        clearActiveChatState() {
            this.state.activeChatId = null;
            this.state.activeChatName = '';
            this.state.activeChatPhone = '';
            this.state.messages = [];
            this.state.conversations = [];
            this.state.chatContext = null;
            this.state.loadingMessages = false;
            this.state.loadingHistory = false;
            this.state.loadingContext = false;
        }

        async syncActiveChatToVisibleList() {
            const visibleChatList = this.getVisibleChats();
            const hasActiveChat = this.state.activeChatId &&
                visibleChatList.some(chat => this.getChatId(chat) === this.state.activeChatId);

            if (hasActiveChat) {
                return;
            }

            if (!visibleChatList.length) {
                this.clearActiveChatState();
                this.renderAll();
                return;
            }

            this.clearActiveChatState();
            this.renderAll();
        }

        renderAll() {
            this.renderStatus();
            this.renderChatTabsPanelState();
            this.renderHistoryPanelState();
            this.renderFolderPanelState();
            this.renderLoginPanelState();
            this.renderChatTabs();
            this.renderChatList();
            this.renderMessages();
            this.renderContext();
            this.renderConversationHistory();
            this.renderFolderPanel();
        }

        renderStatus() {
            const chip = this.$el.find('[data-role="status-chip"]');

            if (!chip.length) {
                return;
            }

            chip
                .toggleClass('is-connected', !!this.state.isConnected)
                .text(
                    this.state.isConnected
                        ? this.t('statusConnected', 'Connesso')
                        : (this.state.status || this.t('statusDisconnected', 'Disconnesso'))
                );

            this.renderSessionControls();
        }

        renderSessionControls() {
            const loginButton = this.$el.find('[data-role="login-button"]');
            const logoutButton = this.$el.find('[data-role="logout-button"]');

            if (loginButton.length) {
                loginButton.toggle(!this.state.isConnected);
            }

            if (logoutButton.length) {
                logoutButton.toggle(!!this.state.isConnected);
            }
        }

        renderHistoryPanelState() {
            const shell = this.$el.find('[data-role="history-shell"]');
            const button = this.$el.find('[data-role="history-toggle-button"]');

            if (shell.length) {
                shell.toggleClass('is-hidden', !this.state.historyVisible);
            }

            if (button.length) {
                button.toggleClass('active', !!this.state.historyVisible);
            }
        }

        renderChatTabsPanelState() {
            const screen = this.$el.find('[data-role="main-screen"]');
            const panel = this.$el.find('[data-role="chat-tabs-panel"]');

            if (!panel.length) {
                return;
            }

            screen.toggleClass('is-chat-tabs-open', !!this.state.chatTabsOpen);
            panel.toggleClass('is-open', !!this.state.chatTabsOpen);
        }

        renderFolderPanelState() {
            const panel = this.$el.find('[data-role="folder-panel"]');

            if (!panel.length) {
                return;
            }

            panel.toggleClass('is-open', !!this.state.folderPanelOpen);
        }

        renderLoginPanelState() {
            const panel = this.$el.find('[data-role="login-panel"]');
            const spinner = this.$el.find('[data-role="login-spinner"]');
            const qrContainer = this.$el.find('[data-role="login-qr-container"]');
            const refreshButton = this.$el.find('[data-role="refresh-qr-button"]');

            if (!panel.length) {
                return;
            }

            panel.toggleClass('is-open', !!this.state.loginPanelOpen);

            if (spinner.length) {
                spinner.toggle(!!this.state.sessionStarting && !this.lastQrString);
            }

            if (qrContainer.length) {
                qrContainer.toggleClass('is-ready', !!this.lastQrString);
            }

            if (refreshButton.length) {
                refreshButton.toggle(!!this.state.loginPanelOpen);
            }
        }

        applyViewportHeight() {
            const screen = this.$el.find('[data-role="main-screen"]');

            if (!screen.length) {
                return;
            }

            const element = screen.get(0);
            const rect = element.getBoundingClientRect();
            const availableHeight = Math.max(420, Math.floor(window.innerHeight - rect.top - 16));

            screen.css({
                height: availableHeight + 'px',
                minHeight: availableHeight + 'px',
                maxHeight: availableHeight + 'px'
            });
        }

        openLoginPanel() {
            this.state.loginPanelOpen = true;
            this.renderLoginPanelState();
            this.ensureQrLib().catch(() => {});
            this.startLoginSession({preserveCurrentQr: true});
        }

        closeLoginPanel() {
            this.state.loginPanelOpen = false;
            this.renderLoginPanelState();
        }

        async logoutSession() {
            if (!window.confirm('Sei sicuro di voler disconnettere WhatsApp?')) {
                return;
            }

            try {
                await this.apiPost('WhatsApp/action/logout');
                this.state.isConnected = false;
                this.state.status = 'DISCONNECTED';
                this.state.chats = [];
                this.state.messages = [];
                this.state.conversations = [];
                this.state.chatContext = null;
                this.state.activeChatId = null;
                this.state.activeChatName = '';
                this.state.activeChatPhone = '';
                this.state.conversations = [];
                this.lastQrString = null;
                this.messageCacheByChat = {};
                this.chatsLoadedAt = 0;
                window.localStorage.removeItem(this.chatListCacheKey);
                this.closeLoginPanel();
                this.renderAll();
            } catch (e) {
                Espo.Ui.error('Unable to disconnect WhatsApp.');
            }
        }

        ensureQrLib() {
            if (window.QRCode) {
                return Promise.resolve(window.QRCode);
            }

            if (this.qrLibPromise) {
                return this.qrLibPromise;
            }

            this.qrLibPromise = new Promise((resolve, reject) => {
                const existing = document.querySelector('script[data-wa-qr-lib="true"]');

                if (existing) {
                    existing.addEventListener('load', () => resolve(window.QRCode), {once: true});
                    existing.addEventListener('error', reject, {once: true});
                    return;
                }

                const script = document.createElement('script');
                script.src = 'client/lib/qrcode.js';
                script.async = true;
                script.setAttribute('data-wa-qr-lib', 'true');
                script.onload = () => resolve(window.QRCode);
                script.onerror = reject;
                document.head.appendChild(script);
            }).finally(() => {
                this.qrLibPromise = null;
            });

            return this.qrLibPromise;
        }

        async renderQrValue(qrValue) {
            if (!qrValue) {
                return;
            }

            const QRCodeLib = await this.ensureQrLib();
            const container = this.$el.find('[data-role="login-qr-container"]');

            if (!container.length || !QRCodeLib) {
                return;
            }

            if (this.lastQrString === qrValue && container.attr('data-wa-qr-rendered') === 'true') {
                this.renderLoginPanelState();
                return;
            }

            container.html('<div id="wa-main-qr-generated"></div>');
            container.attr('data-wa-qr-rendered', 'true');
            this.lastQrString = qrValue;

            new QRCodeLib(document.getElementById('wa-main-qr-generated'), {
                text: qrValue,
                width: 196,
                height: 196
            });

            this.renderLoginPanelState();
        }

        async startLoginSession(options) {
            options = options || {};

            if (this.state.sessionStarting) {
                return;
            }

            const preserveCurrentQr = !!options.preserveCurrentQr && !!this.lastQrString;
            this.state.sessionStarting = !preserveCurrentQr;

            if (this.qrPollTimeout) {
                clearTimeout(this.qrPollTimeout);
                this.qrPollTimeout = null;
            }

            this.renderLoginPanelState();

            try {
                let qrValue = null;

                if (!options.forceStart) {
                    const qrResponse = await this.apiGet('WhatsApp/action/qrCode');

                    if (qrResponse && qrResponse.qr) {
                        qrValue = qrResponse.qr;
                    }
                }

                if (!qrValue) {
                    const response = await this.apiGet('WhatsApp/action/login');

                    qrValue = response && response.qrCode ? response.qrCode : null;
                }

                if (qrValue) {
                    await this.renderQrValue(qrValue);
                }

                this.state.sessionStarting = false;
                this.renderLoginPanelState();
                this.scheduleQrPoll(0);
            } catch (e) {
                this.state.sessionStarting = false;
                this.renderLoginPanelState();
                Espo.Ui.error('Unable to start WhatsApp login.');
            }
        }

        async refreshLoginQr() {
            if (!this.state.loginPanelOpen) {
                this.openLoginPanel();
                return;
            }

            await this.startLoginSession({preserveCurrentQr: true});
        }

        scheduleQrPoll(attempt) {
            if (this.qrPollTimeout) {
                clearTimeout(this.qrPollTimeout);
            }

            this.qrPollTimeout = setTimeout(() => {
                this.pollQr(attempt);
            }, attempt > 0 ? 3000 : 2000);
        }

        async pollQr(attempt) {
            if (!this.state.loginPanelOpen || attempt > 60) {
                this.state.sessionStarting = false;
                this.renderLoginPanelState();
                return;
            }

            try {
                const response = await this.apiGet('WhatsApp/action/qrCode');

                if (response && response.qr) {
                    await this.renderQrValue(response.qr);
                    this.scheduleQrPoll(attempt + 1);
                    return;
                }

                await this.loadStatus();

                if (this.state.isConnected) {
                    this.state.sessionStarting = false;
                    this.closeLoginPanel();
                    this.loadContacts(true);
                    this.loadChatFolders(true);
                    await this.loadChats(false, {forceRefresh: true, retryAttempt: 0});
                    return;
                }

                this.scheduleQrPoll(attempt + 1);
            } catch (e) {
                this.scheduleQrPoll(attempt + 1);
            }
        }

        renderChatList(showLoading) {
            const container = this.$el.find('[data-role="chat-list"]');
            const count = this.$el.find('[data-role="chat-count"]');

            if (!container.length) {
                return;
            }

            const list = this.getVisibleChats();

            if (count.length) {
                count.text(
                    this.state.chats.length
                        ? `${list.length}/${this.state.chats.length} chat`
                        : '0 chat'
                );
            }

            if (showLoading || this.state.loadingChats) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-comments"></span></div>Caricamento chat…</div>');
                return;
            }

            if (!list.length) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-comment-slash"></span></div>' + this.escape(this.t('noChatsInView', 'Nessuna chat disponibile in questa vista.')) + '</div>');
                return;
            }

            container.html('<div class="list-group wa-chat-list-group">' + list.map(chat => {
                const chatId = this.getChatId(chat);
                const name = this.getChatName(chat);
                const preview = this.getChatPreview(chat);
                const time = this.getLastMessageTimestamp(chat)
                    ? this.formatTime(this.getLastMessageTimestamp(chat))
                    : '';
                const activeClass = chatId === this.state.activeChatId ? ' is-active' : '';

                return `
<button type="button" class="list-group-item wa-chat-item${activeClass}" data-action="select-chat" data-chat-id="${this.escape(chatId)}" data-chat-name="${this.escape(name)}">
    <div class="wa-chat-item-top">
        <div class="wa-chat-item-name">${this.escape(name)}</div>
        <div class="wa-chat-item-time">${this.escape(time)}</div>
    </div>
    <div class="wa-chat-item-preview">${this.escape(preview)}</div>
</button>`;
            }).join('') + '</div>');
        }

        renderChatTabs() {
            const container = this.$el.find('[data-role="chat-tabs"]');

            if (!container.length) {
                return;
            }

            const tabList = [
                {id: 'all', label: this.t('chatTabAll', 'Tutte'), icon: 'layer-group'},
                {id: 'chats', label: this.t('chatTabChats', 'Chat'), icon: 'comment-dots'},
                {id: 'groups', label: this.t('chatTabGroups', 'Gruppi'), icon: 'users'}
            ].concat(
                (this.state.chatFolders || []).map(folder => ({
                    id: 'folder:' + folder.id,
                    label: folder.name,
                    count: this.getChatCountForFolder(folder),
                    isCustom: true,
                    icon: 'folder'
                }))
            );

            container.html('<div class="list-group wa-tab-list-group">' + tabList.map(tab => {
                const activeClass = tab.id === this.state.activeChatTab ? ' is-active' : '';
                const countHtml = tab.isCustom
                    ? `<span class="wa-chat-tab-count">${this.escape(String(tab.count || 0))}</span>`
                    : '';
                const iconHtml = tab.icon
                    ? `<span class="wa-chat-tab-icon fas fa-${this.escape(tab.icon)}"></span>`
                    : '';

                return `
<button type="button" class="list-group-item wa-chat-tab${activeClass}" data-action="select-chat-tab" data-tab-id="${this.escape(tab.id)}" title="${this.escape(tab.label)}">
    <span class="wa-chat-tab-main">
        ${iconHtml}
        <span class="wa-chat-tab-label">${this.escape(tab.label)}</span>
    </span>
    ${countHtml}
</button>`;
            }).join('') + '</div>');
        }

        renderFolderPanel() {
            const container = this.$el.find('[data-role="folder-list"]');

            if (!container.length) {
                return;
            }

            const folderList = Array.isArray(this.state.chatFolders) ? this.state.chatFolders : [];

            if (!folderList.length) {
                container.html(`
<div class="wa-main-empty">
    <div class="wa-main-empty-icon"><span class="fas fa-folder-open"></span></div>
    ${this.escape(this.t('noFolders', 'Nessuna cartella personalizzata.'))}
</div>`);
                return;
            }

            const hasActiveChat = !!this.state.activeChatId;

            container.html('<div class="list-group wa-folder-list-group">' + folderList.map(folder => {
                const chatIdList = Array.isArray(folder.chatIdList) ? folder.chatIdList : [];
                const checked = hasActiveChat && chatIdList.includes(this.state.activeChatId) ? 'checked' : '';
                const disabled = hasActiveChat ? '' : 'disabled';
                const activeClass = this.state.activeChatTab === 'folder:' + folder.id ? ' is-active' : '';

                return `
<div class="list-group-item wa-folder-row${activeClass}">
    <label class="wa-folder-row-main">
        <input type="checkbox" class="wa-folder-row-checkbox" data-action="toggle-folder-membership" data-folder-id="${this.escape(folder.id)}" ${checked} ${disabled}>
        <span class="wa-folder-row-meta">
            <span class="wa-folder-row-name">${this.escape(folder.name)}</span>
            <span class="wa-folder-row-count">${this.escape(String(this.getChatCountForFolder(folder)))} chat</span>
        </span>
    </label>
    <div class="wa-folder-row-actions">
        <button type="button" class="btn btn-default btn-xs action" data-action="activate-folder-tab" data-folder-id="${this.escape(folder.id)}">
            ${this.escape(this.t('openFolder', 'Apri'))}
        </button>
        <button type="button" class="btn btn-link btn-xs action" data-action="delete-chat-folder" data-folder-id="${this.escape(folder.id)}" title="${this.escape(this.t('deleteFolder', 'Elimina'))}">
            <span class="fas fa-trash"></span>
        </button>
    </div>
</div>`;
            }).join('') + '</div>');

            if (!hasActiveChat) {
                container.prepend(`
<div class="wa-folder-panel-empty-hint">
    ${this.escape(this.t('selectChatForFolders', "Seleziona una chat per gestire l'appartenenza alle cartelle."))}
</div>`);
            }
        }

        renderMessages() {
            const title = this.$el.find('[data-role="thread-title"]');
            const subtitle = this.$el.find('[data-role="thread-subtitle"]');
            const container = this.$el.find('[data-role="messages"]');

            if (!container.length) {
                return;
            }

            const context = this.state.chatContext || {};
            const isGroupChat = this.isGroupChat(this.state.activeChatId);
            const subtitleValue = isGroupChat
                ? ''
                : (
                    context.displayPhone
                    || this.formatPhoneForDisplay(this.state.activeChatPhone)
                    || this.state.activeChatId
                )
                || 'La cronologia viene caricata da WhatsApp e allineata con il layer locale.';

            title.text(this.state.activeChatName || this.t('selectChat', 'Seleziona una chat'));
            subtitle.text(subtitleValue);

            if (!this.state.activeChatId) {
                container.html('<div class="wa-thread-empty"><div class="wa-main-empty-icon"><span class="fas fa-comments"></span></div>' + this.escape(this.t('selectChat', 'Seleziona una chat')) + '</div>');
                return;
            }

            if (this.state.loadingMessages) {
                container.html('<div class="wa-thread-empty"><div class="wa-main-empty-icon"><span class="fas fa-spinner"></span></div>Caricamento messaggi…</div>');
                return;
            }

            if (!this.state.messages.length) {
                container.html('<div class="wa-thread-empty"><div class="wa-main-empty-icon"><span class="fas fa-inbox"></span></div>Nessun messaggio disponibile.</div>');
                return;
            }

            const list = this.state.messages.slice();

            container.html(`
<div class="wa-message-list">
    ${list.map(message => {
        const messageId = message.messageId || message.id || '';
        return `
        <div class="wa-message-row ${message.fromMe ? 'outgoing' : 'incoming'}" data-message-id="${this.escape(messageId)}">
            <div class="wa-message ${message.fromMe ? 'outgoing' : 'incoming'}">
                <div class="wa-message-text">${this.escape(message.body || message.bodyPreview || '')}</div>
                <div class="wa-message-time">${this.escape(this.formatTime(this.getMessageTimestamp(message)))}</div>
            </div>
        </div>`;
    }).join('')}
</div>`);

            if (this.pendingHighlightMessageId) {
                this.highlightMessage(this.pendingHighlightMessageId);
                this.pendingHighlightMessageId = null;
                return;
            }

            container.scrollTop(container.prop('scrollHeight'));
        }

        renderContext() {
            const container = this.$el.find('[data-role="chat-context"]');

            if (!container.length) {
                return;
            }

            if (!this.state.activeChatId) {
                container.html('<div class="wa-context-muted">Nessun contesto chat selezionato.</div>');
                return;
            }

            if (this.state.loadingContext) {
                container.html('<div class="wa-context-muted">Caricamento contesto…</div>');
                return;
            }

            const context = this.state.chatContext || {};
            const isGroupChat = this.isGroupChat(this.state.activeChatId);
            const phone = context.displayPhone || this.formatPhoneForDisplay(this.state.activeChatPhone) || '';
            const contextTitle = context.displayName
                || this.state.activeChatName
                || phone
                || context.participantWaId
                || this.state.activeChatId
                || '';

            if (isGroupChat) {
                container.html(`
<div class="wa-context-title">${this.escape(contextTitle)}</div>
<div class="wa-context-muted">Chat di gruppo. I numeri di telefono, il collegamento CRM diretto e la cronologia dialoghi puntuale non sono mostrati per questo tipo di chat.</div>`);
                return;
            }

            const candidateList = Array.isArray(context.candidateList) ? context.candidateList : [];
            const linkedHtml = context.isLinked
                ? `
<div class="wa-context-row"><strong>Record CRM:</strong> ${this.escape(context.linkedEntityType || '')} · ${this.escape(context.linkedEntityName || '')}</div>
<div class="wa-context-actions">
    <button type="button" class="btn btn-default btn-sm action" data-action="open-linked-record" data-entity-type="${this.escape(context.linkedEntityType || '')}" data-entity-id="${this.escape(context.linkedEntityId || '')}">
        Apri record
    </button>
</div>`
                : `
<div class="wa-context-muted">Nessun record CRM collegato.</div>
<div class="wa-context-actions">
    <button type="button" class="btn btn-primary btn-sm action" data-action="create-contact">Crea contatto CRM</button>
</div>`;
            const candidateHtml = !context.isLinked && candidateList.length
                ? `
<div class="wa-context-candidates">
    ${candidateList.map(item => `
        <button
            type="button"
            class="btn btn-default btn-sm action"
            data-action="open-linked-record"
            data-entity-type="${this.escape(item.entityType || '')}"
            data-entity-id="${this.escape(item.entityId || '')}"
        >
            ${this.escape((item.entityType || '') + ': ' + (item.entityName || ''))}
        </button>
    `).join('')}
</div>`
                : '';
            const ambiguityNote = context.isAmbiguous
                ? `<div class="wa-context-muted">Trovati più record CRM compatibili con questo numero.</div>`
                : '';

            container.html(`
<div class="wa-context-title">${this.escape(contextTitle)}</div>
<div class="wa-context-grid">
<div class="wa-context-row"><strong>WhatsApp ID:</strong> ${this.escape(context.participantWaId || this.state.activeChatId)}</div>
<div class="wa-context-row"><strong>Numero:</strong> ${this.escape(phone || 'N/D')}</div>
</div>
${linkedHtml}
${ambiguityNote}
${candidateHtml}`);
        }

        renderConversationHistory() {
            const container = this.$el.find('[data-role="conversation-history"]');

            if (!container.length) {
                return;
            }

            if (!this.state.activeChatId) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-history"></span></div>Seleziona una chat per vedere la cronologia dialoghi.</div>');
                return;
            }

            if (this.state.loadingHistory) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-spinner"></span></div>Caricamento dialoghi…</div>');
                return;
            }

            if (this.isGroupChat(this.state.activeChatId)) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-users"></span></div>La cronologia dialoghi con salto al messaggio iniziale non è disponibile per le chat di gruppo.</div>');
                return;
            }

            if (!this.state.conversations.length) {
                container.html('<div class="wa-main-empty"><div class="wa-main-empty-icon"><span class="fas fa-history"></span></div>Nessun dialogo tracciato per questa chat.</div>');
                return;
            }

            container.html('<div class="list-group wa-conversation-list-group">' + this.state.conversations.map(item => {
                const canJump = !!item.firstMessageMessageId;
                const badge = item.status === 'open'
                    ? '<span class="label label-success">Aperto</span>'
                    : '<span class="label label-default">Chiuso</span>';
                const conversationHeader = this.getConversationHeaderData(item);
                const tag = canJump ? 'button' : 'div';
                const disabledClass = canJump ? '' : ' is-disabled';
                const actionAttr = canJump ? 'jump-conversation' : '';
                const messageIdAttr = canJump ? (item.firstMessageMessageId || '') : '';

                return `
<${tag} ${canJump ? 'type="button"' : ''} class="list-group-item wa-conversation-item${disabledClass}" data-action="${actionAttr}" data-message-id="${this.escape(messageIdAttr)}">
    <div class="wa-conversation-top">
        <div class="wa-conversation-range">${this.escape(conversationHeader.timeRange)}</div>
        <div class="wa-conversation-date">${this.escape(conversationHeader.date)}</div>
    </div>
    <div class="wa-conversation-name">${this.escape(conversationHeader.name)}</div>
    ${this.renderConversationPreview(item.previewMessages || [])}
    <div class="wa-conversation-meta">${badge} · ${this.escape(String(item.messageCount || 0))} msg</div>
</${tag}>`;
            }).join('') + '</div>');
        }

        renderConversationPreview(previewMessages) {
            if (!Array.isArray(previewMessages) || !previewMessages.length) {
                return '';
            }

            return `
<div class="wa-conversation-preview">
    ${previewMessages.slice(0, 5).map(item => `
        <div class="wa-conversation-preview-line ${item.fromMe ? 'is-outgoing' : 'is-incoming'}">
            ${this.escape(item.body || item.bodyPreview || '')}
        </div>
    `).join('')}
</div>`;
        }

        async jumpToConversation(messageId) {
            if (!messageId) {
                return;
            }

            if (!this.hasMessageLoaded(messageId)) {
                await this.loadAdditionalMessagesForJump(messageId);
            }

            this.highlightMessage(messageId);
        }

        highlightMessage(messageId) {
            if (!messageId) {
                return;
            }

            const container = this.$el.find('[data-role="messages"]');
            const message = container.find('[data-message-id="' + CSS.escape(messageId) + '"]');

            if (!message.length) {
                this.pendingHighlightMessageId = messageId;
                Espo.Ui.notify('Messaggio iniziale non presente nella cronologia caricata.');
                return;
            }

            container.find('.wa-message-row').removeClass('is-highlighted');
            message.addClass('is-highlighted');
            message.get(0).scrollIntoView({behavior: 'smooth', block: 'center'});
            setTimeout(() => message.removeClass('is-highlighted'), 3000);
        }

        async loadAdditionalMessagesForJump(messageId) {
            if (!this.state.activeChatId) {
                return;
            }

            this.pendingHighlightMessageId = messageId;
            this.state.loadingMessages = true;
            this.renderMessages();

            try {
                const response = await this.apiGet('WhatsApp/action/getChatMessages', {
                    chatId: this.state.activeChatId,
                    limit: 1000,
                    mode: 'sync',
                    refresh: true,
                    sync: true
                });

                this.state.messages = Array.isArray(response.list) ? response.list.slice() : [];
            } catch (e) {
                Espo.Ui.error('Unable to load more WhatsApp messages for the selected dialogue.');
            }

            this.state.loadingMessages = false;
            this.renderMessages();
        }

        hasMessageLoaded(messageId) {
            return this.state.messages.some(message => {
                const id = message.messageId || message.id || '';

                return String(id) === String(messageId);
            });
        }

        getVisibleChats() {
            const query = String(this.$el.find('[data-name="chat-search"]').val() || '').trim().toLowerCase();

            return this.getOrderedChats(this.state.chats).filter(chat => {
                if (!this.matchesActiveChatTab(chat)) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [
                    this.getChatName(chat),
                    this.getChatPreview(chat),
                    this.getChatPhone(chat),
                ].join(' ').toLowerCase();

                return haystack.indexOf(query) !== -1;
            });
        }

        getOrderedChats(chatList) {
            return chatList.slice().sort((a, b) => this.getLastMessageTimestamp(b) - this.getLastMessageTimestamp(a));
        }

        matchesActiveChatTab(chat) {
            const tabId = this.state.activeChatTab || 'all';
            const chatId = this.getChatId(chat);

            if (tabId === 'all') {
                return true;
            }

            if (tabId === 'chats') {
                return !this.isGroupChat(chatId);
            }

            if (tabId === 'groups') {
                return this.isGroupChat(chatId);
            }

            if (tabId.indexOf('folder:') === 0) {
                const folder = this.getActiveCustomFolder();

                return !!folder && Array.isArray(folder.chatIdList) && folder.chatIdList.includes(chatId);
            }

            return true;
        }

        getActiveCustomFolder() {
            const tabId = this.state.activeChatTab || '';

            if (tabId.indexOf('folder:') !== 0) {
                return null;
            }

            const folderId = tabId.substring('folder:'.length);

            return (this.state.chatFolders || []).find(folder => folder.id === folderId) || null;
        }

        getChatCountForFolder(folder) {
            if (!folder || !Array.isArray(folder.chatIdList)) {
                return 0;
            }

            const chatIdSet = new Set((this.state.chats || []).map(chat => this.getChatId(chat)));

            return folder.chatIdList.filter(chatId => chatIdSet.has(chatId)).length;
        }

        findChatById(chatId) {
            return (this.state.chats || []).find(chat => this.getChatId(chat) === chatId) || null;
        }

        findContactByChatId(chatId) {
            return (this.state.contacts || []).find(contact => this.getContactId(contact) === chatId) || null;
        }

        getChatId(chat) {
            if (!chat) {
                return '';
            }

            if (typeof chat.id === 'string') {
                return chat.id;
            }

            if (chat.id && chat.id._serialized) {
                return chat.id._serialized;
            }

            return chat._serialized || '';
        }

        getContactId(contact) {
            if (!contact) {
                return '';
            }

            if (typeof contact.id === 'string') {
                return contact.id;
            }

            if (contact.id && contact.id._serialized) {
                return contact.id._serialized;
            }

            return contact._serialized || '';
        }

        getChatName(chat) {
            if (!chat) {
                return '';
            }

            const name = (chat.name || (chat.contact && chat.contact.pushname) || '').trim();

            if (name) {
                return String(name);
            }

            return String(this.formatPhoneForDisplay(this.getChatPhone(chat)) || this.extractPhoneNumber(this.getChatId(chat)) || '');
        }

        getChatPhone(chat) {
            if (!chat) {
                return '';
            }

            const chatId = this.getChatId(chat);
            const server = this.getChatServer(chatId);
            const contact = chat.contact || this.findContactByChatId(chatId) || null;
            const candidateList = server === 'lid'
                ? [
                    this.findMappedPhoneForLidChat(chat, contact),
                    chat.number,
                    chat.phoneNumber
                ]
                : [
                    chat.number,
                    chat.phoneNumber,
                    contact && contact.number,
                    contact && contact.phoneNumber,
                    contact && contact.id && contact.id.user
                ];

            for (const candidate of candidateList) {
                const digits = this.normalizePhoneDigits(candidate);

                if (digits) {
                    return digits;
                }
            }

            if (server === 'c.us' || server === 's.whatsapp.net') {
                return this.normalizePhoneDigits(chatId);
            }

            return '';
        }

        findMappedPhoneForLidChat(chat, directContact) {
            const labelList = this.getChatIdentityLabelList(chat, directContact);
            const contactList = Array.isArray(this.state.contacts) ? this.state.contacts : [];
            let best = null;
            let bestScore = -1;

            for (const item of contactList) {
                const contactId = this.getContactId(item);

                if (!contactId || this.getChatServer(contactId) !== 'c.us') {
                    continue;
                }

                const phone = this.normalizePhoneDigits(
                    item.number || item.phoneNumber || (item.id && item.id.user)
                );

                if (!phone) {
                    continue;
                }

                const names = this.getContactIdentityLabelList(item);
                const score = this.getIdentityMatchScore(labelList, names, item);

                if (score > bestScore) {
                    bestScore = score;
                    best = phone;
                }
            }

            return bestScore >= 100 ? best : '';
        }

        getChatIdentityLabelList(chat, directContact) {
            const values = [
                chat && chat.name,
                chat && chat.formattedTitle,
                directContact && directContact.name,
                directContact && directContact.pushname,
                directContact && directContact.shortName
            ];

            return this.normalizeIdentityLabelList(values);
        }

        getContactIdentityLabelList(contact) {
            return this.normalizeIdentityLabelList([
                contact && contact.name,
                contact && contact.pushname,
                contact && contact.shortName
            ]);
        }

        normalizeIdentityLabelList(values) {
            return Array.from(new Set(
                values
                    .map(value => this.normalizeIdentityLabel(value))
                    .filter(Boolean)
            ));
        }

        normalizeIdentityLabel(value) {
            return String(value || '')
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        getIdentityMatchScore(sourceLabels, candidateLabels, contact) {
            if (!sourceLabels.length || !candidateLabels.length) {
                return -1;
            }

            let score = -1;

            sourceLabels.forEach(source => {
                candidateLabels.forEach(candidate => {
                    if (source === candidate) {
                        score = Math.max(score, 100);
                    } else if (source && candidate && (source.includes(candidate) || candidate.includes(source))) {
                        score = Math.max(score, 60);
                    }
                });
            });

            if (score < 0) {
                return score;
            }

            if (contact && contact.isMyContact) {
                score += 10;
            }

            return score;
        }

        getChatServer(chatId) {
            const parts = String(chatId || '').split('@');

            return parts.length > 1 ? parts[1] : '';
        }

        isGroupChat(chatId) {
            return this.getChatServer(chatId) === 'g.us';
        }

        getChatPreview(chat) {
            const lastMessage = chat && chat.lastMessage ? chat.lastMessage : null;

            if (!lastMessage) {
                return 'Nessun messaggio';
            }

            return String(lastMessage.body || lastMessage.caption || '[' + (lastMessage.type || 'Message') + ']');
        }

        getLastMessageTimestamp(chat) {
            const lastMessage = chat && chat.lastMessage ? chat.lastMessage : null;

            return this.getMessageTimestamp(lastMessage);
        }

        getMessageTimestamp(message) {
            const value = message && message.timestamp ? message.timestamp : 0;

            return typeof value === 'number' ? value : (Date.parse(value) / 1000 || 0);
        }

        getMessageIdentity(message) {
            if (!message) {
                return '';
            }

            const value = message.messageId || message.id || '';

            if (value && typeof value === 'object') {
                return String(value._serialized || value.id || '');
            }

            return String(value);
        }

        getSortSequence(message) {
            if (!message) {
                return null;
            }

            if (message.sortSequence !== undefined && message.sortSequence !== null) {
                const value = Number(message.sortSequence);

                return isNaN(value) ? null : value;
            }

            if (message.payloadMeta && message.payloadMeta.sortSequence !== undefined && message.payloadMeta.sortSequence !== null) {
                const value = Number(message.payloadMeta.sortSequence);

                return isNaN(value) ? null : value;
            }

            return null;
        }

        compareMessages(a, b) {
            const timeDiff = this.getMessageTimestamp(a) - this.getMessageTimestamp(b);

            if (timeDiff !== 0) {
                return timeDiff;
            }

            const sequenceA = this.getSortSequence(a);
            const sequenceB = this.getSortSequence(b);

            if (sequenceA !== null && sequenceB !== null && sequenceA !== sequenceB) {
                return sequenceA - sequenceB;
            }

            const idA = this.getMessageIdentity(a);
            const idB = this.getMessageIdentity(b);

            if (idA && idB && idA !== idB) {
                return idA.localeCompare(idB);
            }

            return 0;
        }

        sortMessageList(list) {
            return (list || []).slice().sort((a, b) => this.compareMessages(a, b));
        }

        extractPhoneNumber(chatId) {
            return String(chatId || '').replace(/@.+$/, '').replace(/[^0-9+]/g, '') || 'WhatsApp';
        }

        normalizePhoneDigits(value) {
            const digits = String(value || '').replace(/[^0-9]/g, '');

            return digits.length >= 6 ? digits : '';
        }

        formatPhoneForDisplay(value) {
            const digits = this.normalizePhoneDigits(value);

            return digits ? ('+' + digits) : '';
        }

        formatTime(timestamp) {
            if (!timestamp) {
                return '';
            }

            return new Date(timestamp * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        formatDate(timestamp) {
            if (!timestamp) {
                return '';
            }

            const date = new Date(timestamp * 1000);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear());

            return `${day}-${month}-${year}`;
        }

        getConversationHeaderData(item) {
            const start = this.formatTime(item && item.startedAt);
            const end = this.formatTime(item && item.endedAt);
            const date = this.formatDate(item && item.startedAt);
            const rawName = String(item && (item.displayName || item.title) || '').trim();
            const name = rawName.includes(' | ')
                ? rawName.split(' | ').slice(-1)[0].trim()
                : rawName;
            const timeRange = end ? `${start} - ${end}` : start;

            return {
                timeRange,
                date,
                name
            };
        }

        t(key, fallback) {
            return this.translate(key, 'labels', 'WhatsApp') || fallback || key;
        }

        escape(value) {
            const element = document.createElement('div');
            element.textContent = String(value || '');

            return element.innerHTML;
        }
    };
});
