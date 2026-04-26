import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { createEspoApiClient } from '../utils/api';
import { mergeCachedMessage, readCachedMessages, writeCachedMessages } from '../utils/messageCache';

const CHAT_CACHE_KEY = 'wa-vue-chat-list-cache-v7';
const CHAT_CACHE_TTL = 12 * 60 * 60 * 1000;
const AVATAR_CACHE_KEY = 'wa-vue-avatar-cache-v1';
const AVATAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_CACHE_KEY = 'wa-vue-outbox-v1';
const OUTBOX_MAX = 100;

function getChatId(chat) {
  if (!chat) {
    return '';
  }

  if (typeof chat === 'string') {
    return chat;
  }

  if (chat._serialized) {
    return chat._serialized;
  }

  if (typeof chat.id === 'string') {
    return chat.id;
  }

  if (chat.id && chat.id._serialized) {
    return chat.id._serialized;
  }

  return chat.chatId || '';
}

function readChatCache() {
  try {
    const raw = window.localStorage.getItem(CHAT_CACHE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.list)) {
      return [];
    }

    if (!parsed.savedAt || Date.now() - parsed.savedAt > CHAT_CACHE_TTL) {
      window.localStorage.removeItem(CHAT_CACHE_KEY);
      return [];
    }

    return parsed.list;
  } catch (error) {
    return [];
  }
}

function writeChatCache(list) {
  try {
    window.localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      list,
    }));
  } catch (error) {}
}

function readAvatarCache() {
  try {
    const raw = window.localStorage.getItem(AVATAR_CACHE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.map || Date.now() - Number(parsed.savedAt || 0) > AVATAR_CACHE_TTL) {
      window.localStorage.removeItem(AVATAR_CACHE_KEY);
      return {};
    }

    return parsed.map;
  } catch (error) {
    return {};
  }
}

function writeAvatarCache(map) {
  try {
    window.localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      map,
    }));
  } catch (error) {}
}

function readOutbox() {
  try {
    const raw = window.localStorage.getItem(OUTBOX_CACHE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(item => item && item.chatId && item.body) : [];
  } catch (error) {
    return [];
  }
}

function writeOutbox(list) {
  try {
    window.localStorage.setItem(OUTBOX_CACHE_KEY, JSON.stringify(list.slice(-OUTBOX_MAX)));
  } catch (error) {}
}

export const useWhatsAppStore = defineStore('whatsapp', () => {
  const api = ref(null);
  const status = ref('unknown');
  const isConnected = ref(false);
  const chats = ref(readChatCache());
  const activeChatId = ref(null);
  const activeChatName = ref('');
  const messagesByChat = ref({});
  const messageLimitByChat = ref({});
  const contextByChat = ref({});
  const historyByChat = ref({});
  const avatarUrlByChat = ref(readAvatarCache());
  const loadingStatus = ref(false);
  const loadingChats = ref(false);
  const loadingMessages = ref(false);
  const loadingContext = ref(false);
  const loadingHistory = ref(false);
  const sendingMessage = ref(false);
  const lastError = ref(null);
  const lastChatsLoadedAt = ref(chats.value.length ? Date.now() : 0);
  const queuedMessages = ref(readOutbox());
  const avatarRequests = new Map();
  let flushingQueue = false;

  const activeMessages = computed(() => {
    if (!activeChatId.value) {
      return [];
    }

    return messagesByChat.value[activeChatId.value] || [];
  });

  const activeChat = computed(() => {
    if (!activeChatId.value) {
      return null;
    }

    return chats.value.find(chat => getChatId(chat) === activeChatId.value) || null;
  });

  const activeChatContext = computed(() => {
    if (!activeChatId.value) {
      return null;
    }

    return contextByChat.value[activeChatId.value] || null;
  });

  const activeConversationHistory = computed(() => {
    if (!activeChatId.value) {
      return [];
    }

    return historyByChat.value[activeChatId.value] || [];
  });

  const activeChatPhone = computed(() => {
    return extractChatPhoneValue(activeChat.value, activeChatId.value);
  });

  const queuedCount = computed(() => queuedMessages.value.length);

  function findChatById(chatId) {
    const id = String(chatId || '').trim();

    if (!id) {
      return null;
    }

    return chats.value.find(chat => getChatId(chat) === id) || null;
  }

  function findChatByPhone(phoneNumber) {
    const digits = normalizePhoneValue(phoneNumber);

    if (!digits) {
      return null;
    }

    return chats.value.find(chat => chatMatchesPhone(chat, digits)) || null;
  }

  function createChatFromPhone(phoneNumber) {
    const digits = normalizePhoneValue(phoneNumber);

    if (!digits) {
      return null;
    }

    const formattedPhone = formatPhoneLabel(phoneNumber, digits);

    return {
      id: `${digits}@c.us`,
      name: formattedPhone,
      phoneNumber: formattedPhone,
      waPhoneNumber: formattedPhone,
      unreadCount: 0,
      lastMessage: null,
    };
  }

  function configure(context = {}) {
    api.value = createEspoApiClient(context);
  }

  function ensureApi() {
    if (!api.value) {
      configure({});
    }

    return api.value;
  }

  async function loadStatus() {
    loadingStatus.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getStatus();
      status.value = response.status || 'unknown';
      isConnected.value = !!response.isConnected;

      if (isConnected.value) {
        flushQueuedMessages().catch(() => {});
      }

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingStatus.value = false;
    }
  }

  async function loadChats({ forceRefresh = false } = {}) {
    if (loadingChats.value) {
      return chats.value;
    }

    if (!forceRefresh && chats.value.length && Date.now() - lastChatsLoadedAt.value < CHAT_CACHE_TTL) {
      return chats.value;
    }

    loadingChats.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getChats({ refresh: forceRefresh });
      const list = Array.isArray(response.list) ? response.list : [];

      chats.value = list;
      lastChatsLoadedAt.value = Date.now();
      writeChatCache(list);

      return list;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingChats.value = false;
    }
  }

  async function openChat(chat, options = {}) {
    const chatId = getChatId(chat);

    if (!chatId) {
      return [];
    }

    activeChatId.value = chatId;
    activeChatName.value = typeof chat === 'object' ? getSafeChatName(chat) : '';

    if (!messageLimitByChat.value[chatId]) {
      messageLimitByChat.value = {
        ...messageLimitByChat.value,
        [chatId]: options.limit || 50,
      };
    }

    const cachedMessages = await readCachedMessages(chatId);

    if (cachedMessages.length && !messagesByChat.value[chatId]) {
      messagesByChat.value = {
        ...messagesByChat.value,
        [chatId]: cachedMessages.slice(-(options.limit || 50)),
      };
    }

    return loadMessages(chatId, {
      limit: options.limit || 50,
      mode: options.mode || 'stored',
    });
  }

  async function loadMessages(chatId, { limit = 50, mode = 'stored', refresh = false } = {}) {
    loadingMessages.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getChatMessages(chatId, {
        limit,
        mode,
        refresh,
      });
      const list = appendQueuedMessages(chatId, Array.isArray(response.list) ? response.list : []);

      messagesByChat.value = {
        ...messagesByChat.value,
        [chatId]: list,
      };
      messageLimitByChat.value = {
        ...messageLimitByChat.value,
        [chatId]: limit,
      };
      writeCachedMessages(chatId, list);

      return list;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadMoreMessages(chatId = activeChatId.value) {
    if (!chatId || loadingMessages.value) {
      return [];
    }

    const currentLimit = messageLimitByChat.value[chatId] || 50;

    return loadMessages(chatId, {
      limit: Math.min(currentLimit + 50, 1000),
      mode: 'stored',
      refresh: false,
    });
  }

  async function refreshActiveMessages() {
    if (!activeChatId.value) {
      return [];
    }

    return loadMessages(activeChatId.value, {
      limit: messageLimitByChat.value[activeChatId.value] || 50,
      mode: 'auto',
      refresh: true,
    });
  }

  async function loadChatContext(chatId = activeChatId.value) {
    if (!chatId) {
      return null;
    }

    loadingContext.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getChatContext(chatId, activeChatPhone.value);
      const context = sanitizeChatContext(chatId, response.data || null, activeChatPhone.value);

      contextByChat.value = {
        ...contextByChat.value,
        [chatId]: context,
      };

      syncChatIdentity(chatId, context);

      return context;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingContext.value = false;
    }
  }

  async function loadConversationHistory(chatId = activeChatId.value, { limit = 20 } = {}) {
    if (!chatId || isGroupChatId(chatId)) {
      historyByChat.value = {
        ...historyByChat.value,
        [chatId]: [],
      };

      return [];
    }

    loadingHistory.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getConversationHistory(chatId, { limit });
      const list = Array.isArray(response.list) ? sanitizeConversationHistory(response.list) : [];

      historyByChat.value = {
        ...historyByChat.value,
        [chatId]: list,
      };

      return list;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingHistory.value = false;
    }
  }

  async function createContactFromActiveChat() {
    const chatId = activeChatId.value;

    if (!chatId) {
      return null;
    }

    const response = await ensureApi().createContactFromChat(chatId, {
      displayName: activeChatName.value,
      phoneNumber: activeChatPhone.value,
    });

    await loadChatContext(chatId).catch(() => null);
    await loadConversationHistory(chatId).catch(() => []);

    return response;
  }

  async function loadAvatarUrl(chatId) {
    if (!chatId) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(avatarUrlByChat.value, chatId)) {
      return avatarUrlByChat.value[chatId] || null;
    }

    if (avatarRequests.has(chatId)) {
      return avatarRequests.get(chatId);
    }

    const request = ensureApi().getProfilePic(chatId)
      .then(response => {
        const url = response && response.url ? response.url : null;
        const next = {
          ...avatarUrlByChat.value,
          [chatId]: url,
        };

        avatarUrlByChat.value = next;
        writeAvatarCache(next);
        avatarRequests.delete(chatId);

        return url;
      })
      .catch(() => {
        const next = {
          ...avatarUrlByChat.value,
          [chatId]: null,
        };

        avatarUrlByChat.value = next;
        writeAvatarCache(next);
        avatarRequests.delete(chatId);

        return null;
      });

    avatarRequests.set(chatId, request);

    return request;
  }

  async function sendMessage(body, options = {}) {
    const chatId = options.chatId || activeChatId.value;
    const text = String(body || '').trim();

    if (!chatId || !text) {
      return null;
    }

    if (!isConnected.value && !options.force) {
      return queueMessage(chatId, text);
    }

    const optimisticMessage = {
      ...(options.message && typeof options.message === 'object' ? options.message : {}),
      id: (options.message && options.message.id) || `local-${Date.now()}`,
      chatId,
      body: text,
      fromMe: true,
      timestamp: (options.message && options.message.timestamp) || Math.floor(Date.now() / 1000),
      pending: true,
      queued: false,
      failed: false,
    };

    mergeMessage(chatId, optimisticMessage);
    sendingMessage.value = true;

    try {
      const response = await ensureApi().sendMessage(chatId, text);
      const deliveredMessage = {
        ...optimisticMessage,
        ...(response && response.message ? response.message : {}),
        pending: false,
        queued: false,
        failed: false,
      };

      if (options.message && options.message.id) {
        removeQueuedMessage(options.message.id);
      }

      replaceMessage(chatId, optimisticMessage.id, deliveredMessage);

      return response;
    } catch (error) {
      const failedMessage = {
        ...optimisticMessage,
        pending: false,
        failed: true,
        queued: !!(options.message && options.message.queued),
        errorMessage: error.message || 'Unable to send message.',
      };

      lastError.value = error;
      mergeMessage(chatId, failedMessage);
      throw error;
    } finally {
      sendingMessage.value = false;
    }
  }

  function queueMessage(chatId, body) {
    const message = {
      id: `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      chatId,
      body,
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      pending: true,
      queued: true,
      failed: false,
      status: 'queued',
    };

    const nextQueue = [
      ...queuedMessages.value.filter(item => item.id !== message.id),
      {
        id: message.id,
        chatId,
        body,
        createdAt: message.timestamp,
      },
    ].slice(-OUTBOX_MAX);

    queuedMessages.value = nextQueue;
    writeOutbox(nextQueue);
    mergeMessage(chatId, message);

    return {
      queued: true,
      message,
    };
  }

  async function retryMessage(message) {
    const chatId = message && (message.chatId || activeChatId.value);
    const text = message && String(message.body || message.bodyPreview || '').trim();

    if (!chatId || !text) {
      return null;
    }

    if (!isConnected.value) {
      const alreadyQueued = queuedMessages.value.some(item => item.id === message.id);

      if (!alreadyQueued) {
        const nextQueue = [
          ...queuedMessages.value,
          {
            id: message.id || `queued-${Date.now()}`,
            chatId,
            body: text,
            createdAt: normalizeTimestamp(message.timestamp || Date.now()),
          },
        ].slice(-OUTBOX_MAX);

        queuedMessages.value = nextQueue;
        writeOutbox(nextQueue);
      }

      mergeMessage(chatId, {
        ...message,
        pending: true,
        queued: true,
        failed: false,
      });

      return {
        queued: true,
      };
    }

    return sendMessage(text, {
      chatId,
      force: true,
      message: {
        ...message,
        chatId,
        body: text,
      },
    });
  }

  async function flushQueuedMessages() {
    if (flushingQueue || !isConnected.value || !queuedMessages.value.length) {
      return [];
    }

    flushingQueue = true;
    const sent = [];

    try {
      const items = queuedMessages.value.slice();

      for (const item of items) {
        if (!queuedMessages.value.some(queued => queued.id === item.id)) {
          continue;
        }

        await sendMessage(item.body, {
          chatId: item.chatId,
          force: true,
          message: {
            id: item.id,
            chatId: item.chatId,
            body: item.body,
            timestamp: item.createdAt || Math.floor(Date.now() / 1000),
            fromMe: true,
            queued: true,
          },
        });
        sent.push(item.id);
      }
    } finally {
      flushingQueue = false;
    }

    return sent;
  }

  function removeQueuedMessage(messageId) {
    if (!messageId) {
      return;
    }

    const nextQueue = queuedMessages.value.filter(item => String(item.id) !== String(messageId));

    if (nextQueue.length === queuedMessages.value.length) {
      return;
    }

    queuedMessages.value = nextQueue;
    writeOutbox(nextQueue);
  }

  function appendQueuedMessages(chatId, list) {
    const queuedForChat = queuedMessages.value
      .filter(item => item.chatId === chatId)
      .map(item => ({
        id: item.id,
        chatId: item.chatId,
        body: item.body,
        fromMe: true,
        timestamp: item.createdAt || Math.floor(Date.now() / 1000),
        pending: true,
        queued: true,
        failed: false,
        status: 'queued',
      }));

    if (!queuedForChat.length) {
      return list;
    }

    const ids = new Set(list.map(item => String(item.messageId || item.id || '')));
    const missing = queuedForChat.filter(item => !ids.has(String(item.id)));

    return missing.length ? [...list, ...missing] : list;
  }

  function mergeMessage(chatId, message) {
    if (!chatId || !message) {
      return;
    }

    const current = messagesByChat.value[chatId] || [];
    const messageId = message.messageId || message.id;
    const existingIndex = messageId
      ? current.findIndex(item => String(item.messageId || item.id) === String(messageId))
      : -1;
    const next = current.slice();

    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        ...message,
      };
    } else {
      next.push(message);
    }

    messagesByChat.value = {
      ...messagesByChat.value,
      [chatId]: next,
    };

    mergeCachedMessage(chatId, message);
  }

  function replaceMessage(chatId, oldMessageId, message) {
    if (!chatId || !message) {
      return;
    }

    const current = messagesByChat.value[chatId] || [];
    const existingIndex = oldMessageId
      ? current.findIndex(item => String(item.messageId || item.id) === String(oldMessageId))
      : -1;

    if (existingIndex < 0) {
      mergeMessage(chatId, message);
      return;
    }

    const next = current.slice();
    next[existingIndex] = {
      ...next[existingIndex],
      ...message,
    };

    messagesByChat.value = {
      ...messagesByChat.value,
      [chatId]: next,
    };

    mergeCachedMessage(chatId, next[existingIndex]);
  }

  function handleRealtimeEvent(payload) {
    if (!payload) {
      return;
    }

    const action = payload.action || payload.type;
    const data = payload.data || payload;
    const chatId = payload.chatId || data.chatId || getChatId(data.chat);

    if (action === 'message' && chatId) {
      mergeMessage(chatId, data.message || data);
      touchChatPreview(chatId, data.message || data);
    }

    if (action === 'message_ack' && chatId) {
      mergeMessage(chatId, data.message || data);
    }

    if (action === 'lifecycle') {
      status.value = data.status || data.state || status.value;
      isConnected.value = data.isConnected ?? isConnected.value;

      if (isConnected.value) {
        flushQueuedMessages().catch(() => {});
      }
    }
  }

  function touchChatPreview(chatId, message) {
    if (!chatId || !message) {
      return;
    }

    chats.value = chats.value.map(chat => {
      if (getChatId(chat) !== chatId || !chat || typeof chat !== 'object') {
        return chat;
      }

      return {
        ...chat,
        lastMessage: {
          ...(chat.lastMessage && typeof chat.lastMessage === 'object' ? chat.lastMessage : {}),
          ...message,
        },
        timestamp: normalizeTimestamp(message.timestamp || Date.now()),
        unreadCount: message.fromMe ? chat.unreadCount || 0 : Number(chat.unreadCount || 0) + 1,
      };
    });

    writeChatCache(chats.value);
  }

  function syncChatIdentity(chatId, context) {
    if (!chatId || !context || typeof context !== 'object') {
      return;
    }

    const displayName = String(context.linkedEntityName || context.displayName || '').trim();

    if (!displayName) {
      return;
    }

    chats.value = chats.value.map(chat => {
      if (getChatId(chat) !== chatId || !chat || typeof chat !== 'object') {
        return chat;
      }

      const contact = chat.contact && typeof chat.contact === 'object' ? chat.contact : {};
      const next = {
        ...chat,
        displayName,
        linkedEntityName: String(context.linkedEntityName || '').trim() || null,
      };

      if (shouldReplaceDisplayLabel(next.name, chatId)) {
        next.name = displayName;
      }

      if (shouldReplaceDisplayLabel(next.formattedTitle, chatId)) {
        next.formattedTitle = displayName;
      }

      next.contact = {
        ...contact,
      };

      if (shouldReplaceDisplayLabel(next.contact.name, chatId)) {
        next.contact.name = displayName;
      }

      if (shouldReplaceDisplayLabel(next.contact.pushname, chatId)) {
        next.contact.pushname = displayName;
      }

      if (shouldReplaceDisplayLabel(next.contact.shortName, chatId)) {
        next.contact.shortName = displayName;
      }

      return next;
    });

    writeChatCache(chats.value);

    if (activeChatId.value === chatId) {
      const chat = findChatById(chatId);
      activeChatName.value = chat ? getSafeChatName(chat) : displayName;
    }
  }

  function normalizeTimestamp(value) {
    if (typeof value === 'number') {
      return value > 9999999999 ? Math.floor(value / 1000) : Math.floor(value);
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 9999999999 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }

    return Math.floor(Date.now() / 1000);
  }

  function normalizePhone(chatId) {
    const value = String(chatId || '').trim();

    if (!isPhoneBasedChatId(value)) {
      return '';
    }

    return normalizePhoneValue(value.replace(/@.+$/u, ''));
  }

  function sanitizePhoneCandidate(value) {
    const raw = String(value || '').trim();

    if (!raw || /@(lid|g\.us)$/iu.test(raw)) {
      return '';
    }

    const normalized = raw.replace(/@.+$/u, '').trim();
    const digits = normalized.replace(/[^0-9]/g, '');

    if (digits.length < 7) {
      return '';
    }

    return normalized.charAt(0) === '+' ? `+${digits}` : normalized;
  }

  function normalizePhoneValue(value) {
    const raw = String(value || '').trim();

    if (!raw || /@(lid|g\.us)$/iu.test(raw)) {
      return '';
    }

    const digits = raw.replace(/@.+$/u, '').replace(/[^0-9]/g, '');

    return digits.length >= 7 ? digits : '';
  }

  function extractChatPhoneValue(chat, fallbackChatId = '') {
    if (!chat || typeof chat !== 'object') {
      const candidate = sanitizePhoneCandidate(chat);

      if (candidate) {
        return candidate;
      }

      const digits = normalizePhone(fallbackChatId || chat);

      return digits ? `+${digits}` : '';
    }

    const contact = chat.contact && typeof chat.contact === 'object' ? chat.contact : {};
    const candidates = [
      chat.waPhoneNumber,
      chat.phoneNumber,
      chat.number,
      contact.waPhoneNumber,
      contact.phoneNumber,
      contact.number,
      getChatId(chat),
    ];

    for (const value of candidates) {
      const candidate = sanitizePhoneCandidate(value);

      if (candidate) {
        return candidate;
      }
    }

    const digits = normalizePhone(fallbackChatId || getChatId(chat));

    return digits ? `+${digits}` : '';
  }

  function getSafeChatName(chat) {
    if (!chat || typeof chat !== 'object') {
      return '';
    }

    const chatId = getChatId(chat);
    const contact = chat.contact && typeof chat.contact === 'object' ? chat.contact : {};
    const candidates = [
      chat.linkedEntityName,
      chat.displayName,
      chat.name,
      chat.formattedTitle,
      chat.pushname,
      contact.name,
      contact.pushname,
      contact.shortName,
    ];

    for (const candidate of candidates) {
      const label = String(candidate || '').trim();

      if (!label) {
        continue;
      }

      if (shouldSkipPhoneLikeLabel(label, chatId)) {
        continue;
      }

      return label;
    }

    return '';
  }

  function looksLikePhoneLabel(value) {
    const label = String(value || '').trim();

    if (!label) {
      return false;
    }

    const digits = label.replace(/[^0-9]/g, '');

    return digits.length >= 7 && /^[+0-9 ().-]+$/u.test(label);
  }

  function digitsMatchChatId(value, chatId) {
    const valueDigits = String(value || '').replace(/@.+$/u, '').replace(/[^0-9]/g, '');
    const chatDigits = String(chatId || '').replace(/@.+$/u, '').replace(/[^0-9]/g, '');

    return valueDigits !== '' && chatDigits !== '' && valueDigits === chatDigits;
  }

  function isDirectContactChatId(chatId) {
    const value = String(chatId || '').toLowerCase().trim();

    return value.endsWith('@lid') || value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
  }

  function shouldSkipPhoneLikeLabel(label, chatId) {
    return isDirectContactChatId(chatId) &&
      looksLikePhoneLabel(label) &&
      digitsMatchChatId(label, chatId);
  }

  function shouldReplaceDisplayLabel(value, chatId) {
    const label = String(value || '').trim();

    return !label || label === chatId || shouldSkipPhoneLikeLabel(label, chatId);
  }

  function chatMatchesPhone(chat, phoneDigits) {
    if (!chat || typeof chat !== 'object') {
      return normalizePhoneValue(chat) === phoneDigits;
    }

    const contact = chat.contact && typeof chat.contact === 'object' ? chat.contact : {};
    const candidates = [
      getChatId(chat),
      chat.waPhoneNumber,
      chat.phoneNumber,
      chat.number,
      contact.waPhoneNumber,
      contact.phoneNumber,
      contact.number,
    ];

    return candidates.some(value => normalizePhoneValue(value) === phoneDigits);
  }

  function formatPhoneLabel(value, fallbackDigits) {
    const raw = String(value || '').trim();
    const digits = fallbackDigits || normalizePhoneValue(raw);

    if (raw.charAt(0) === '+' && digits) {
      return '+' + digits;
    }

    return digits || raw;
  }

  function sanitizeChatContext(chatId, context, knownPhone = '') {
    if (!context || typeof context !== 'object') {
      return context;
    }

    const participantWaId = String(context.participantWaId || chatId || '');
    const idDigits = participantWaId.replace(/@.+$/u, '').replace(/[^0-9]/g, '');
    const knownDigits = normalizePhoneValue(knownPhone);
    const normalizedDigits = normalizePhoneValue(context.normalizedPhone);
    const displayDigits = normalizePhoneValue(context.displayPhone);

    if (
      !isPhoneBasedChatId(participantWaId) &&
      !knownDigits &&
      idDigits &&
      (normalizedDigits === idDigits || displayDigits === idDigits)
    ) {
      const next = {
        ...context,
        normalizedPhone: '',
        displayPhone: '',
      };

      if (normalizePhoneValue(next.displayName) === idDigits) {
        next.displayName = null;
      }

      return next;
    }

    return context;
  }

  function sanitizeConversationHistory(list) {
    return list
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        ...item,
        startedAt: normalizeHistoryTimestamp(item.startedAt),
        endedAt: normalizeHistoryTimestamp(item.endedAt),
        timeoutAt: normalizeHistoryTimestamp(item.timeoutAt),
      }));
  }

  function normalizeHistoryTimestamp(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      const timestamp = value > 9999999999 ? Math.floor(value / 1000) : Math.floor(value);

      return timestamp >= 946684800 ? timestamp : null;
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
      const timestamp = numeric > 9999999999 ? Math.floor(numeric / 1000) : Math.floor(numeric);

      return timestamp >= 946684800 ? timestamp : null;
    }

    const parsed = Date.parse(String(value));

    if (!Number.isFinite(parsed)) {
      return null;
    }

    const timestamp = Math.floor(parsed / 1000);

    return timestamp >= 946684800 ? timestamp : null;
  }

  function isPhoneBasedChatId(chatId) {
    const value = String(chatId || '').toLowerCase().trim();

    return value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
  }

  function isLidChatId(chatId) {
    return String(chatId || '').toLowerCase().trim().endsWith('@lid');
  }

  function isGroupChatId(chatId) {
    return String(chatId || '').endsWith('@g.us');
  }

  return {
    status,
    isConnected,
    chats,
    activeChat,
    activeChatId,
    activeChatName,
    activeChatPhone,
    activeMessages,
    activeChatContext,
    activeConversationHistory,
    avatarUrlByChat,
    messagesByChat,
    contextByChat,
    historyByChat,
    loadingStatus,
    loadingChats,
    loadingMessages,
    loadingContext,
    loadingHistory,
    sendingMessage,
    queuedMessages,
    queuedCount,
    lastError,
    configure,
    findChatById,
    findChatByPhone,
    createChatFromPhone,
    loadStatus,
    loadChats,
    openChat,
    loadMessages,
    loadMoreMessages,
    refreshActiveMessages,
    loadChatContext,
    loadConversationHistory,
    createContactFromActiveChat,
    loadAvatarUrl,
    sendMessage,
    retryMessage,
    flushQueuedMessages,
    handleRealtimeEvent,
  };
});
