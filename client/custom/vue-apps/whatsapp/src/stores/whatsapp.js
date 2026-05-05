import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { createEspoApiClient } from '../utils/api';
import {
  mergeCachedMessage,
} from '../utils/messageCache';

const CHAT_READ_STATE_KEY = 'wa-vue-chat-read-state-v2';
const AVATAR_CACHE_KEY = 'wa-vue-avatar-cache-v1';
const AVATAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_CACHE_KEY = 'wa-vue-outbox-v1';
const OUTBOX_MAX = 100;
const LOCAL_REACTION_SENDER = '__crm_user__';
const OUTGOING_ECHO_WINDOW_SECONDS = 180;

function clearLegacyChatCaches() {
  try {
    window.localStorage.removeItem('wa-vue-chat-list-cache-v6');
    window.localStorage.removeItem('wa-vue-chat-list-cache-v7');
    window.localStorage.removeItem('wa-vue-chat-list-cache-v8');
  } catch (error) {}
}

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

function readChatReadState() {
  try {
    const raw = window.localStorage.getItem(CHAT_READ_STATE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
        .map(([chatId, value]) => [chatId, Number(value)])
    );
  } catch (error) {
    return {};
  }
}

function writeChatReadState(map) {
  try {
    window.localStorage.setItem(CHAT_READ_STATE_KEY, JSON.stringify(map || {}));
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

clearLegacyChatCaches();

export const useWhatsAppStore = defineStore('whatsapp', () => {
  const api = ref(null);
  const status = ref('unknown');
  const isConnected = ref(false);
  const qrCode = ref('');
  const chats = ref([]);
  const groups = ref([]);
  const localReadStateByChat = ref(readChatReadState());
  const activeChatId = ref(null);
  const activeChatName = ref('');
  const messagesByChat = ref({});
  const messageLimitByChat = ref({});
  const contextByChat = ref({});
  const historyByChat = ref({});
  const conversationPreviewById = ref({});
  const avatarUrlByChat = ref(readAvatarCache());
  const loadingStatus = ref(false);
  const loadingQr = ref(false);
  const loadingChats = ref(false);
  const loadingGroups = ref(false);
  const loadingMessages = ref(false);
  const loadingContext = ref(false);
  const loadingHistory = ref(false);
  const sendingMessage = ref(false);
  const lastError = ref(null);
  const lastMessageLoadError = ref(null);
  const queuedMessages = ref(readOutbox());
  const avatarRequests = new Map();
  const conversationPreviewRequests = new Map();
  let flushingQueue = false;
  let messageLoadRequestId = 0;

  const activeMessages = computed(() => {
    if (!activeChatId.value) {
      return [];
    }

    return messagesByChat.value[activeChatId.value] || [];
  });

  const chatList = computed(() => mergeChatAndGroupLists(chats.value, groups.value));

  const activeChat = computed(() => {
    if (!activeChatId.value) {
      return null;
    }

    return chatList.value.find(chat => getChatId(chat) === activeChatId.value) || null;
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

    return chatList.value.find(chat => getChatId(chat) === id) || null;
  }

  function findChatByPhone(phoneNumber) {
    const digits = normalizePhoneValue(phoneNumber);

    if (!digits) {
      return null;
    }

    return chatList.value.find(chat => chatMatchesPhone(chat, digits)) || null;
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

  async function startLogin() {
    loadingQr.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().login();

      qrCode.value = response.qrCode || '';

      if (qrCode.value) {
        status.value = 'qr_ready';
        isConnected.value = false;
      }

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingQr.value = false;
    }
  }

  async function logout() {
    lastError.value = null;

    try {
      const response = await ensureApi().logout();

      clearSessionState();
      await startLogin().catch(error => {
        lastError.value = error;
      });

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    }
  }

  function clearSessionState() {
    status.value = 'disconnected';
    isConnected.value = false;
    chats.value = [];
    groups.value = [];
    activeChatId.value = null;
    activeChatName.value = '';
    messagesByChat.value = {};
    messageLimitByChat.value = {};
    contextByChat.value = {};
    historyByChat.value = {};
    conversationPreviewById.value = {};
    avatarUrlByChat.value = {};
    lastMessageLoadError.value = null;
  }

  function setMessagesForChat(chatId, list) {
    if (!chatId) {
      return;
    }

    messagesByChat.value[chatId] = Array.isArray(list) ? list : [];
  }

  function removeMessageFromChat(chatId, messageId) {
    if (!chatId || !messageId) {
      return;
    }

    const current = messagesByChat.value[chatId] || [];
    const next = current.filter(item => String(item.messageId || item.id || '') !== String(messageId));

    if (next.length !== current.length) {
      setMessagesForChat(chatId, next);
    }
  }

  function patchMessageLimit(chatId, limit) {
    if (!chatId || !Number.isFinite(Number(limit))) {
      return;
    }

    const normalizedLimit = Number(limit);

    if (messageLimitByChat.value[chatId] === normalizedLimit) {
      return;
    }

    messageLimitByChat.value[chatId] = normalizedLimit;
  }

  async function loadChats({ forceRefresh = false } = {}) {
    if (loadingChats.value) {
      return chats.value;
    }

    loadingChats.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getChats({ refresh: forceRefresh });
      const list = mergeIncomingChats(Array.isArray(response.list) ? response.list : []);

      chats.value = list;

      return list;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingChats.value = false;
    }
  }

  async function loadGroups({ forceRefresh = false } = {}) {
    if (loadingGroups.value) {
      return groups.value;
    }

    loadingGroups.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().getGroups({ forceRefresh });
      const list = sanitizeGroupList(Array.isArray(response.list) ? response.list : []);

      groups.value = list;

      return list;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      loadingGroups.value = false;
    }
  }

  async function openChat(chat, options = {}) {
    const chatId = getChatId(chat);
    const limit = options.limit || 50;
    const previousChatId = activeChatId.value;

    if (!chatId) {
      return [];
    }

    activeChatId.value = chatId;
    activeChatName.value = typeof chat === 'object' ? getSafeChatName(chat) : '';
    lastMessageLoadError.value = null;
    markChatAsRead(chatId);

    if (!messageLimitByChat.value[chatId]) {
      patchMessageLimit(chatId, limit);
    }

    if (previousChatId !== chatId) {
      setMessagesForChat(chatId, []);
    }

    return loadMessages(chatId, { limit });
  }

  async function loadMessages(chatId, { limit = 50 } = {}) {
    const requestId = ++messageLoadRequestId;

    loadingMessages.value = true;
    lastError.value = null;
    lastMessageLoadError.value = null;

    try {
      const response = await ensureApi().getChatMessages(chatId, {
        limit,
      });

      if (response && response.success === false) {
        const error = new Error(response.message || response.error || 'Unable to load messages from WhatsApp Web.');
        error.code = response.error || 'WA_WEB_FETCH_FAILED';
        throw error;
      }

      const list = appendQueuedMessages(chatId, Array.isArray(response.list) ? response.list : []);

      setMessagesForChat(chatId, list);
      syncChatSummaryFromMessages(chatId, list, {
        markRead: chatId === activeChatId.value,
      });
      patchMessageLimit(chatId, Number(response.limit) || limit);

      return list;
    } catch (error) {
      if (requestId === messageLoadRequestId && activeChatId.value === chatId) {
        lastError.value = error;
        lastMessageLoadError.value = error;
      }

      throw error;
    } finally {
      if (requestId === messageLoadRequestId) {
        loadingMessages.value = false;
      }
    }
  }

  async function loadMoreMessages(chatId = activeChatId.value) {
    if (!chatId || loadingMessages.value) {
      return [];
    }

    const currentLimit = messageLimitByChat.value[chatId] || 50;
    const nextLimit = Math.min(currentLimit + 50, 200);

    return nextLimit > currentLimit ? loadMessages(chatId, { limit: nextLimit }) : activeMessages.value;
  }

  async function refreshActiveMessages() {
    if (!activeChatId.value) {
      return [];
    }

    return loadMessages(activeChatId.value, {
      limit: messageLimitByChat.value[activeChatId.value] || 50,
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

  async function loadConversationPreview(conversationId, { limit = 5 } = {}) {
    const id = String(conversationId || '').trim();

    if (!id) {
      return [];
    }

    if (Object.prototype.hasOwnProperty.call(conversationPreviewById.value, id)) {
      return conversationPreviewById.value[id];
    }

    if (conversationPreviewRequests.has(id)) {
      return conversationPreviewRequests.get(id);
    }

    const request = ensureApi().getConversationPreview(id, { limit })
      .then(response => {
        const list = Array.isArray(response.messages) ? sanitizeConversationPreview(response.messages) : [];

        conversationPreviewById.value = {
          ...conversationPreviewById.value,
          [id]: list,
        };
        conversationPreviewRequests.delete(id);

        return list;
      })
      .catch(error => {
        conversationPreviewRequests.delete(id);
        throw error;
      });

    conversationPreviewRequests.set(id, request);

    return request;
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

  async function sendMedia(payload = {}) {
    const chatId = payload.chatId || activeChatId.value;
    const type = String(payload.type || '').trim();

    if (!chatId || !type) {
      return null;
    }

    sendingMessage.value = true;
    lastError.value = null;

    try {
      const response = await callMediaApi(chatId, type, payload);

      await refreshActiveMessages().catch(() => []);

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      sendingMessage.value = false;
    }
  }

  async function sendLocation(payload = {}) {
    const chatId = payload.chatId || activeChatId.value;
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);

    if (!chatId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    sendingMessage.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().sendLocation(chatId, latitude, longitude, payload.description || '');

      await refreshActiveMessages().catch(() => []);

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      sendingMessage.value = false;
    }
  }

  async function sendContactCard(contactId, options = {}) {
    const chatId = options.chatId || activeChatId.value;
    const id = String(contactId || '').trim();

    if (!chatId || !id) {
      return null;
    }

    sendingMessage.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().sendContactCard(chatId, id);

      await refreshActiveMessages().catch(() => []);

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      sendingMessage.value = false;
    }
  }

  async function callMediaApi(chatId, type, payload) {
    const apiClient = ensureApi();

    if (type === 'image') {
      return apiClient.sendImage(chatId, payload.url, payload.caption || '');
    }

    if (type === 'video') {
      return apiClient.sendVideo(chatId, payload.url, payload.caption || '');
    }

    if (type === 'audio') {
      return apiClient.sendAudio(chatId, payload.url, { asVoice: !!payload.asVoice });
    }

    if (type === 'voice') {
      return apiClient.sendVoiceNote(chatId, payload.url);
    }

    if (type === 'document') {
      return apiClient.sendDocument(chatId, payload.url, payload.filename, payload.caption || '');
    }

    if (type === 'sticker') {
      return apiClient.sendSticker(chatId, payload.url);
    }

    throw new Error('Unsupported media type.');
  }

  async function createPoll(question, pollOptions, config = {}) {
    const chatId = activeChatId.value;
    const options = Array.isArray(pollOptions) ? pollOptions.filter(Boolean) : [];

    if (!chatId || !String(question || '').trim() || options.length < 2) {
      return null;
    }

    sendingMessage.value = true;
    lastError.value = null;

    try {
      const response = await ensureApi().createPoll(chatId, String(question).trim(), options, config);

      await refreshActiveMessages().catch(() => []);

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    } finally {
      sendingMessage.value = false;
    }
  }

  async function editMessage(message, content) {
    const target = resolveMessageTarget(message);

    if (!target || !String(content || '').trim()) {
      return null;
    }

    const response = await runMessageOperation(() => ensureApi().editMessage(target.chatId, target.messageId, content));

    mergeMessage(target.chatId, {
      ...message,
      body: content,
      bodyPreview: content,
      edited: true,
    });

    return response;
  }

  async function deleteMessage(message, options = {}) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    const response = await runMessageOperation(() => ensureApi().deleteMessage(target.chatId, target.messageId, options));
    removeMessageFromChat(target.chatId, target.messageId);

    return response;
  }

  async function reactToMessage(message, reaction) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    lastError.value = null;

    try {
      const response = await ensureApi().reactToMessage(target.chatId, target.messageId, reaction || '');

      mergeMessage(target.chatId, withLocalReaction(message, reaction));

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    }
  }

  async function forwardMessage(message, destinationChatId) {
    const target = resolveMessageTarget(message);
    const destination = String(destinationChatId || '').trim();

    if (!target || !destination) {
      return null;
    }

    return runMessageOperation(() => ensureApi().forwardMessage(target.chatId, target.messageId, destination));
  }

  async function setMessageStarred(message, starred) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    const response = await runMessageOperation(() => starred ?
      ensureApi().starMessage(target.chatId, target.messageId) :
      ensureApi().unstarMessage(target.chatId, target.messageId)
    );

    mergeMessage(target.chatId, {
      ...message,
      isStarred: starred,
      starred,
    });

    return response;
  }

  async function getMessageReactions(message) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    return runMessageOperation(() => ensureApi().getMessageReactions(target.chatId, target.messageId));
  }

  async function downloadMedia(message) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    return runMessageOperation(() => ensureApi().downloadMedia(target.chatId, target.messageId));
  }

  async function getPollVotes(message) {
    const target = resolveMessageTarget(message);

    if (!target) {
      return null;
    }

    return runMessageOperation(() => ensureApi().getPollVotes(target.chatId, target.messageId));
  }

  async function voteInPoll(message, selectedOptions) {
    const target = resolveMessageTarget(message);
    const options = Array.isArray(selectedOptions) ? selectedOptions.filter(Boolean) : [];

    if (!target || !options.length) {
      return null;
    }

    return runMessageOperation(() => ensureApi().voteInPoll(target.chatId, target.messageId, options));
  }

  async function runMessageOperation(callback) {
    lastError.value = null;

    try {
      const response = await callback();

      await refreshActiveMessages().catch(() => []);

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    }
  }

  function resolveMessageTarget(message) {
    const chatId = String((message && message.chatId) || activeChatId.value || '').trim();
    const messageId = String((message && (message.messageId || message.id)) || '').trim();

    if (!chatId || !messageId) {
      return null;
    }

    return {
      chatId,
      messageId,
    };
  }

  function withLocalReaction(message, reaction) {
    const payloadMeta = message && message.payloadMeta && typeof message.payloadMeta === 'object' ?
      { ...message.payloadMeta } :
      {};
    const reactions = normalizeReactionList(payloadMeta.reactions)
      .filter(item => !isCurrentUserReaction(item));
    const reactionValue = String(reaction || '').trim();

    if (reactionValue) {
      reactions.push({
        senderId: LOCAL_REACTION_SENDER,
        reaction: reactionValue,
        timestamp: Math.floor(Date.now() / 1000),
        fromMe: true,
        optimistic: true,
      });
    }

    return {
      ...message,
      payloadMeta: {
        ...payloadMeta,
        reactions,
      },
    };
  }

  function normalizeReactionList(reactions) {
    const list = Array.isArray(reactions) ?
      reactions :
      (reactions && typeof reactions === 'object' ? Object.values(reactions) : []);

    return list
      .filter(item => item && typeof item === 'object' && String(item.reaction || '').trim())
      .map(item => {
        const isMine = isCurrentUserReaction(item);

        return {
          ...item,
          senderId: isMine ? LOCAL_REACTION_SENDER : getReactionSenderId(item),
          reaction: String(item.reaction || '').trim(),
          fromMe: isMine || isTruthyFlag(item.fromMe),
        };
      });
  }

  function isCurrentUserReaction(reaction) {
    if (!reaction || typeof reaction !== 'object') {
      return false;
    }

    return reaction.senderId === LOCAL_REACTION_SENDER ||
      isTruthyFlag(reaction.optimistic) ||
      isTruthyFlag(reaction.fromMe) ||
      isLocalReactionId(reaction.id);
  }

  function getReactionSenderId(reaction) {
    return String(
      reaction.senderId ||
      reaction.author ||
      reaction.participant ||
      reaction.from ||
      readReactionObjectValue(reaction.id, 'participant') ||
      readReactionObjectValue(reaction.id, 'author') ||
      readReactionObjectValue(reaction.id, 'from') ||
      readReactionObjectValue(reaction.id, '_serialized') ||
      readReactionObjectValue(reaction.id, 'id') ||
      ''
    );
  }

  function isLocalReactionId(id) {
    const value = typeof id === 'string' ?
      id :
      readReactionObjectValue(id, '_serialized') || readReactionObjectValue(id, 'id');

    return String(value || '').startsWith('true_');
  }

  function isLocalMessageId(id) {
    const value = typeof id === 'string' ?
      id :
      readReactionObjectValue(id, '_serialized') || readReactionObjectValue(id, 'id');

    return String(value || '').startsWith('true_');
  }

  function readReactionObjectValue(value, key) {
    if (!value || typeof value !== 'object') {
      return '';
    }

    return value[key] || '';
  }

  function isTruthyFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  async function setAccountStatus(value) {
    const text = String(value || '').trim();

    if (!text) {
      return null;
    }

    return runAccountOperation(() => ensureApi().setStatus(text));
  }

  async function updateProfilePicture(pictureMimetype, pictureData) {
    const mimetype = String(pictureMimetype || '').trim();
    const data = String(pictureData || '').trim();

    if (!mimetype || !data) {
      return null;
    }

    return runAccountOperation(() => ensureApi().updateProfilePicture(mimetype, data));
  }

  async function getContactStatus(contactId = activeChatId.value) {
    const id = String(contactId || '').trim();

    if (!id) {
      return null;
    }

    return runAccountOperation(() => ensureApi().getContactStatus(id));
  }

  async function getContactProfilePicture(contactId = activeChatId.value) {
    const id = String(contactId || '').trim();

    if (!id) {
      return null;
    }

    return runAccountOperation(() => ensureApi().getContactProfilePicture(id));
  }

  async function blockUser(contactId = activeChatId.value) {
    const id = String(contactId || '').trim();

    if (!id) {
      return null;
    }

    return runAccountOperation(() => ensureApi().blockUser(id));
  }

  async function unblockUser(contactId = activeChatId.value) {
    const id = String(contactId || '').trim();

    if (!id) {
      return null;
    }

    return runAccountOperation(() => ensureApi().unblockUser(id));
  }

  async function checkNumberOnWhatsApp(number = activeChatPhone.value) {
    const value = String(number || '').trim();

    if (!value) {
      return null;
    }

    return runAccountOperation(() => ensureApi().checkNumberOnWhatsApp(value));
  }

  async function getBlockedContacts() {
    return runAccountOperation(() => ensureApi().getBlockedContacts());
  }

  async function runAccountOperation(callback) {
    lastError.value = null;

    try {
      return await callback();
    } catch (error) {
      lastError.value = error;
      throw error;
    }
  }

  async function runChatOperation(action, options = {}) {
    const chatId = String(options.chatId || activeChatId.value || '').trim();

    if (!chatId) {
      return null;
    }

    lastError.value = null;

    try {
      const response = await callChatOperationApi(chatId, action, options);

      if (action === 'mark-read') {
        markChatAsRead(chatId);
      }

      if (action === 'clear') {
        setMessagesForChat(chatId, []);
      }

      if (action !== 'mark-read') {
        await Promise.allSettled([
          loadChats({ forceRefresh: true }),
          loadGroups({ forceRefresh: true }),
        ]);
      }

      return response;
    } catch (error) {
      lastError.value = error;
      throw error;
    }
  }

  function callChatOperationApi(chatId, action, options) {
    const apiClient = ensureApi();

    if (action === 'archive') {
      return apiClient.archiveChat(chatId);
    }

    if (action === 'unarchive') {
      return apiClient.unarchiveChat(chatId);
    }

    if (action === 'mute') {
      return apiClient.muteChat(chatId, {
        duration: options.duration || null,
        unmuteDate: options.unmuteDate || null,
      });
    }

    if (action === 'unmute') {
      return apiClient.unmuteChat(chatId);
    }

    if (action === 'pin') {
      return apiClient.pinChat(chatId);
    }

    if (action === 'unpin') {
      return apiClient.unpinChat(chatId);
    }

    if (action === 'mark-read') {
      return apiClient.markChatRead(chatId);
    }

    if (action === 'mark-unread') {
      return apiClient.markChatUnread(chatId);
    }

    if (action === 'clear') {
      return apiClient.clearChatMessages(chatId);
    }

    throw new Error('Unsupported chat operation.');
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

    const current = messagesByChat.value[chatId];

    if (!Array.isArray(current)) {
      setMessagesForChat(chatId, [message]);
      mergeCachedMessage(chatId, message);
      return;
    }

    const messageId = message.messageId || message.id;
    const existingIndex = findMessageIndexByIdentifier(current, messageId);
    const echoIndex = existingIndex >= 0 ? -1 : findOutgoingEchoMessageIndex(current, message);
    const targetIndex = existingIndex >= 0 ? existingIndex : echoIndex;

    if (targetIndex >= 0) {
      Object.assign(current[targetIndex], message);
      dedupeMessageInstances(current, targetIndex);
      mergeCachedMessage(chatId, current[targetIndex]);
    } else {
      current.push(message);
      mergeCachedMessage(chatId, message);
    }
  }

  function replaceMessage(chatId, oldMessageId, message) {
    if (!chatId || !message) {
      return;
    }

    const current = messagesByChat.value[chatId];

    if (!Array.isArray(current)) {
      mergeMessage(chatId, message);
      return;
    }

    const existingIndex = findMessageIndexByIdentifier(current, oldMessageId);
    const messageIndex = existingIndex >= 0 ? existingIndex : findMessageIndexByIdentifier(current, message.messageId || message.id);
    const echoIndex = messageIndex >= 0 ? -1 : findOutgoingEchoMessageIndex(current, message);
    const targetIndex = messageIndex >= 0 ? messageIndex : echoIndex;

    if (targetIndex < 0) {
      mergeMessage(chatId, message);
      return;
    }

    Object.assign(current[targetIndex], message);
    dedupeMessageInstances(current, targetIndex);

    mergeCachedMessage(chatId, current[targetIndex]);
  }

  function findMessageIndexByIdentifier(list, messageId) {
    const id = String(messageId || '').trim();

    if (!id || !Array.isArray(list)) {
      return -1;
    }

    return list.findIndex(item => String((item && (item.messageId || item.id)) || '').trim() === id);
  }

  function findOutgoingEchoMessageIndex(list, message) {
    if (!Array.isArray(list) || !isOutgoingMessage(message)) {
      return -1;
    }

    const signature = getOutgoingEchoSignature(message);

    if (!signature) {
      return -1;
    }

    for (let index = list.length - 1; index >= 0; index--) {
      const item = list[index];

      if (!isOutgoingMessage(item) || getOutgoingEchoSignature(item) !== signature) {
        continue;
      }

      if (!areMessageTimesClose(item, message)) {
        continue;
      }

      if (isLocalEchoMessage(item) || isLocalEchoMessage(message) || hasComplementaryOutgoingSource(item, message)) {
        return index;
      }
    }

    return -1;
  }

  function isOutgoingMessage(message) {
    return !!(
      message &&
      typeof message === 'object' &&
      (
        isTruthyFlag(message.fromMe) ||
        isLocalMessageId(message.id || message.messageId)
      )
    );
  }

  function isLocalEchoMessage(message) {
    const id = String((message && (message.id || message.messageId)) || '');

    return !!(
      message &&
      typeof message === 'object' &&
      (
        isTruthyFlag(message.pending) ||
        isTruthyFlag(message.queued) ||
        id.startsWith('local-') ||
        id.startsWith('queued-')
      )
    );
  }

  function hasComplementaryOutgoingSource(first, second) {
    const firstSource = getMessageSource(first);
    const secondSource = getMessageSource(second);

    return (firstSource === 'sendmessage' && secondSource === 'webhook') ||
      (firstSource === 'webhook' && secondSource === 'sendmessage');
  }

  function getMessageSource(message) {
    const meta = message && message.payloadMeta && typeof message.payloadMeta === 'object' ? message.payloadMeta : {};

    return String(meta.source || message.source || '').trim().toLowerCase();
  }

  function getOutgoingEchoSignature(message) {
    if (!message || typeof message !== 'object') {
      return '';
    }

    const body = String(message.body || message.bodyPreview || message.caption || '').trim();

    if (!body) {
      return '';
    }

    return [
      String(message.type || 'chat').trim().toLowerCase(),
      body,
    ].join('|');
  }

  function areMessageTimesClose(first, second) {
    const firstTime = toUnixTimestamp(first && first.timestamp, 0);
    const secondTime = toUnixTimestamp(second && second.timestamp, 0);

    if (!firstTime || !secondTime) {
      return isLocalEchoMessage(first) || isLocalEchoMessage(second);
    }

    return Math.abs(firstTime - secondTime) <= OUTGOING_ECHO_WINDOW_SECONDS;
  }

  function dedupeMessageInstances(list, keeperIndex) {
    if (!Array.isArray(list) || keeperIndex < 0 || keeperIndex >= list.length) {
      return;
    }

    const keeper = list[keeperIndex];
    const keeperId = String((keeper && (keeper.messageId || keeper.id)) || '').trim();

    if (!keeperId) {
      return;
    }

    for (let index = list.length - 1; index >= 0; index--) {
      if (index === keeperIndex) {
        continue;
      }

      const itemId = String((list[index] && (list[index].messageId || list[index].id)) || '').trim();

      if (itemId === keeperId) {
        list.splice(index, 1);

        if (index < keeperIndex) {
          keeperIndex--;
        }
      }
    }
  }

  function handleRealtimeEvent(payload) {
    payload = normalizeRealtimePayload(payload);

    if (!payload) {
      return;
    }

    const action = payload.action || payload.type;
    const data = payload.data || payload;
    const rawMessage = data.message || data;
    const rawChatId = payload.chatId || data.chatId || getChatId(data.chat) || (rawMessage && rawMessage.chatId) || '';
    const chatId = resolveRealtimeChatId(rawChatId, rawMessage);
    const message = withRealtimeChatId(chatId, rawMessage);

    if (isMessageRealtimeAction(action) && chatId) {
      mergeMessage(chatId, message);
      touchChatPreview(chatId, message);
    }

    if (isMessageAckRealtimeAction(action) && chatId) {
      mergeMessage(chatId, message);
    }

    if (isConversationRealtimeAction(action)) {
      const conversationChatId = String(data.chatId || payload.chatId || '').trim();

      if (conversationChatId && conversationChatId === activeChatId.value && !isGroupChatId(conversationChatId)) {
        loadConversationHistory(conversationChatId).catch(() => []);
      }
    }

    if (action === 'lifecycle') {
      status.value = data.status || data.state || status.value;
      isConnected.value = data.isConnected ?? isConnected.value;

      if (isConnected.value) {
        flushQueuedMessages().catch(() => {});
      }
    }
  }

  function normalizeRealtimePayload(payload) {
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (error) {
        return null;
      }
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if (typeof payload.data === 'string') {
      try {
        payload = {
          ...payload,
          data: JSON.parse(payload.data),
        };
      } catch (error) {}
    }

    return payload;
  }

  function isMessageRealtimeAction(action) {
    return ['message', 'message.new', 'message_new', 'new_message'].includes(String(action || ''));
  }

  function isMessageAckRealtimeAction(action) {
    return ['message_ack', 'message.ack', 'message_acknowledgement'].includes(String(action || ''));
  }

  function isConversationRealtimeAction(action) {
    return String(action || '') === 'conversation';
  }

  function withRealtimeChatId(chatId, message) {
    if (!message || typeof message !== 'object') {
      return {
        id: `ws-${Date.now()}`,
        chatId,
        body: String(message || ''),
        bodyPreview: String(message || ''),
        timestamp: Math.floor(Date.now() / 1000),
      };
    }

    return {
      ...message,
      chatId: chatId || message.chatId || '',
    };
  }

  function resolveRealtimeChatId(chatId, message) {
    const match = findChatByRealtimeIdentity(chatId, message);

    if (match) {
      return getChatId(match);
    }

    return String(chatId || (message && message.chatId) || '').trim();
  }

  function findChatByRealtimeIdentity(chatId, message) {
    const candidates = getRealtimeChatIdCandidates(chatId, message);

    for (const candidate of candidates) {
      const exact = findChatById(candidate);

      if (exact) {
        return exact;
      }
    }

    const phoneDigits = resolveRealtimePhoneDigits(chatId, message);

    if (!phoneDigits) {
      return null;
    }

    return chatList.value.find(chat => chatMatchesPhone(chat, phoneDigits)) || null;
  }

  function getRealtimeChatIdCandidates(chatId, message) {
    const payloadMeta = message && message.payloadMeta && typeof message.payloadMeta === 'object' ? message.payloadMeta : {};
    const isOutgoing = isOutgoingMessage(message);
    const candidates = [
      chatId,
      message && message.chatId,
      payloadMeta.canonicalChatId,
      payloadMeta.remote,
      message && getChatId(message.chat),
      message && message.participantWaId,
      message && message.waPhoneNumber,
      message && message.phoneNumber,
      message && message.number,
    ];
    const primary = candidates.find(candidate => String(candidate || '').trim());

    if (!isGroupChatId(primary || '')) {
      candidates.push(
        isOutgoing ? (message && message.to) : (message && message.from),
        isOutgoing ? payloadMeta.to : payloadMeta.from,
        isOutgoing ? null : (message && message.author),
        isOutgoing ? null : payloadMeta.author
      );
    }

    return candidates
      .map(candidate => getChatId(candidate))
      .map(candidate => String(candidate || '').trim())
      .filter(Boolean);
  }

  function resolveRealtimePhoneDigits(chatId, message) {
    for (const candidate of getRealtimeChatIdCandidates(chatId, message)) {
      if (isGroupChatId(candidate)) {
        continue;
      }

      const digits = normalizePhoneValue(candidate);

      if (digits) {
        return digits;
      }
    }

    return '';
  }

  function touchChatPreview(chatId, message) {
    if (!chatId || !message) {
      return;
    }

    const messageTimestamp = toUnixTimestamp(
      message.timestamp || Date.now(),
      Math.floor(Date.now() / 1000)
    );
    const isActiveChat = isActiveRealtimeChat(chatId, message);
    const isOutgoing = isOutgoingMessage(message);
    const targetChat = findChatByRealtimeIdentity(chatId, message);
    const targetChatId = targetChat ? getChatId(targetChat) : String(chatId || '').trim();

    if (isActiveChat) {
      rememberChatRead(chatId, messageTimestamp);
    }

    let updated = false;

    chats.value = chats.value.map(chat => {
      if (getChatId(chat) !== targetChatId) {
        return chat;
      }

      updated = true;

      if (shouldIgnoreStalePreview(chat, message, messageTimestamp)) {
        return chat;
      }

      return {
        ...chat,
        lastMessage: {
          ...(chat.lastMessage && typeof chat.lastMessage === 'object' ? chat.lastMessage : {}),
          ...message,
        },
        lastMessageBody: String(
          message.bodyPreview ||
          message.body ||
          message.caption ||
          chat.lastMessageBody ||
          ''
        ).trim(),
        bodyPreview: String(
          message.bodyPreview ||
          message.body ||
          message.caption ||
          chat.bodyPreview ||
          ''
        ).trim(),
        lastMessageTimestamp: messageTimestamp,
        timestamp: messageTimestamp,
        t: messageTimestamp,
        unreadCount: isActiveChat
          ? 0
          : (isOutgoing ? Number(chat.unreadCount || 0) : Number(chat.unreadCount || 0) + 1),
        unread: isActiveChat
          ? 0
          : (isOutgoing ? Number(chat.unread || 0) : Number(chat.unread || 0) + 1),
      };
    });

    if (!updated) {
      const chat = createChatFromRealtimeMessage(targetChatId || chatId, message, messageTimestamp, isActiveChat);

      if (chat) {
        chats.value = [
          chat,
          ...chats.value,
        ];
      }
    }
  }

  function isActiveRealtimeChat(chatId, message) {
    if (!activeChatId.value) {
      return false;
    }

    if (activeChatId.value === chatId) {
      return true;
    }

    const active = findChatById(activeChatId.value);

    return !!(active && matchesRealtimeChatIdentity(active, chatId, message));
  }

  function matchesRealtimeChatIdentity(chat, chatId, message) {
    if (!chat || typeof chat !== 'object') {
      return false;
    }

    const currentChatId = getChatId(chat);

    if (currentChatId && currentChatId === chatId) {
      return true;
    }

    const phoneDigits = resolveRealtimePhoneDigits(chatId, message);

    return !!(phoneDigits && chatMatchesPhone(chat, phoneDigits));
  }

  function shouldIgnoreStalePreview(chat, message, messageTimestamp) {
    const currentTimestamp = resolveComparableChatTimestamp(chat);

    if (!currentTimestamp || !messageTimestamp || messageTimestamp >= currentTimestamp) {
      return false;
    }

    const currentId = getMessageIdentity(chat.lastMessage || chat.lastMessageData);
    const incomingId = getMessageIdentity(message);

    return !incomingId || incomingId !== currentId;
  }

  function getMessageIdentity(message) {
    if (!message || typeof message !== 'object') {
      return '';
    }

    return String(message.messageId || message.id || '');
  }

  function createChatFromRealtimeMessage(chatId, message, messageTimestamp, isActiveChat) {
    const id = String(chatId || (message && message.chatId) || '').trim();

    if (!id) {
      return null;
    }

    const phoneDigits = resolveRealtimePhoneDigits(id, message);
    const phone = extractChatPhoneValue({
      id,
      phoneNumber: message.phoneNumber,
      waPhoneNumber: message.waPhoneNumber,
      number: message.number,
    }, id) || (phoneDigits ? `+${phoneDigits}` : '');
    const displayName = String(
      message.chatName ||
      message.displayName ||
      message.senderName ||
      message.notifyName ||
      message.pushname ||
      ''
    ).trim();
    const preview = getRealtimeMessagePreview(message);
    const unreadCount = isActiveChat || isOutgoingMessage(message) ? 0 : 1;

    return {
      id,
      displayName: displayName || null,
      name: displayName || phone || (isLidChatId(id) ? 'WhatsApp contact' : id),
      phoneNumber: phone,
      waPhoneNumber: phone,
      unreadCount,
      unread: unreadCount,
      timestamp: messageTimestamp,
      t: messageTimestamp,
      lastMessageTimestamp: messageTimestamp,
      lastMessageBody: preview,
      bodyPreview: preview,
      contact: phone ? {
        phoneNumber: phone,
        waPhoneNumber: phone,
        number: phone,
      } : null,
      lastMessage: {
        ...message,
        chatId: id,
        timestamp: messageTimestamp,
        bodyPreview: preview,
      },
    };
  }

  function getRealtimeMessagePreview(message) {
    return String(
      message.bodyPreview ||
      message.body ||
      message.caption ||
      (message.type && message.type !== 'chat' ? `[${message.type}]` : '') ||
      (message.hasMedia ? '[Media]' : '') ||
      ''
    ).trim();
  }

  function markChatAsRead(chatId) {
    if (!chatId) {
      return;
    }

    rememberChatRead(chatId, resolveChatActivityTimestamp(chatId));

    let updated = false;
    const nextChats = chats.value.map(chat => {
      if (getChatId(chat) !== chatId || !chat || typeof chat !== 'object') {
        return chat;
      }

      if (Number(chat.unreadCount || 0) === 0 && Number(chat.unread || 0) === 0) {
        return chat;
      }

      updated = true;

      return {
        ...chat,
        unreadCount: 0,
        unread: 0,
      };
    });

    if (updated) {
      chats.value = nextChats;
    }
  }

  function syncChatSummaryFromMessages(chatId, list, { markRead = false } = {}) {
    if (!chatId || !Array.isArray(list) || !list.length) {
      if (markRead) {
        markChatAsRead(chatId);
      }

      return;
    }

    const message = list
      .slice()
      .sort((a, b) => {
        const timeDiff = normalizeTimestamp(a.timestamp || 0) - normalizeTimestamp(b.timestamp || 0);

        if (timeDiff !== 0) {
          return timeDiff;
        }

        return String(a.messageId || a.id || '').localeCompare(String(b.messageId || b.id || ''));
      })
      .at(-1);

    if (!message) {
      if (markRead) {
        markChatAsRead(chatId);
      }

      return;
    }

    const summaryTimestamp = toUnixTimestamp(message.timestamp || 0, 0);
    let updated = false;

    const nextChats = chats.value.map(chat => {
      if (getChatId(chat) !== chatId || !chat || typeof chat !== 'object') {
        return chat;
      }

      const nextChat = {
        ...chat,
        lastMessage: {
          ...(chat.lastMessage && typeof chat.lastMessage === 'object' ? chat.lastMessage : {}),
          ...message,
        },
        lastMessageBody: String(
          message.bodyPreview ||
          message.body ||
          message.caption ||
          chat.lastMessageBody ||
          ''
        ).trim(),
        bodyPreview: String(
          message.bodyPreview ||
          message.body ||
          message.caption ||
          chat.bodyPreview ||
          ''
        ).trim(),
        lastMessageTimestamp: summaryTimestamp || toUnixTimestamp(chat.lastMessageTimestamp || 0, 0),
        timestamp: summaryTimestamp || toUnixTimestamp(chat.timestamp || Date.now(), Math.floor(Date.now() / 1000)),
        t: summaryTimestamp || toUnixTimestamp(chat.t || chat.timestamp || Date.now(), Math.floor(Date.now() / 1000)),
        unreadCount: markRead ? 0 : Number(chat.unreadCount || 0),
        unread: markRead ? 0 : Number(chat.unread || 0),
      };

      if (hasSameChatSummary(chat, nextChat)) {
        return chat;
      }

      updated = true;

      return nextChat;
    });

    if (markRead) {
      rememberChatRead(chatId, summaryTimestamp);
    }

    if (updated) {
      chats.value = nextChats;
    }
  }

  function hasSameChatSummary(current, next) {
    return String(current.lastMessageBody || '') === String(next.lastMessageBody || '') &&
      String(current.bodyPreview || '') === String(next.bodyPreview || '') &&
      toUnixTimestamp(current.lastMessageTimestamp || 0, 0) === toUnixTimestamp(next.lastMessageTimestamp || 0, 0) &&
      toUnixTimestamp(current.timestamp || 0, 0) === toUnixTimestamp(next.timestamp || 0, 0) &&
      toUnixTimestamp(current.t || 0, 0) === toUnixTimestamp(next.t || 0, 0) &&
      Number(current.unreadCount || 0) === Number(next.unreadCount || 0) &&
      Number(current.unread || 0) === Number(next.unread || 0) &&
      getMessageSignature(current.lastMessage) === getMessageSignature(next.lastMessage);
  }

  function getMessageSignature(message) {
    if (!message || typeof message !== 'object') {
      return '';
    }

    return [
      message.messageId || message.id || '',
      message.timestamp || '',
      message.bodyPreview || '',
      message.body || '',
      message.caption || '',
      message.type || '',
      message.status || '',
      message.ack ?? '',
    ].join('|');
  }

  function rememberChatRead(chatId, timestamp) {
    const normalizedTimestamp = toUnixTimestamp(timestamp || 0, 0);

    if (!chatId || !normalizedTimestamp) {
      return false;
    }

    const currentTimestamp = Number(localReadStateByChat.value[chatId] || 0);

    if (currentTimestamp >= normalizedTimestamp) {
      return false;
    }

    localReadStateByChat.value = {
      ...localReadStateByChat.value,
      [chatId]: normalizedTimestamp,
    };
    writeChatReadState(localReadStateByChat.value);

    return true;
  }

  function resolveChatActivityTimestamp(chatId) {
    const activeList = messagesByChat.value[chatId] || [];
    const lastKnownMessage = activeList.length ? activeList[activeList.length - 1] : null;
    const currentChat = findChatById(chatId);

    return toUnixTimestamp(
      (lastKnownMessage && lastKnownMessage.timestamp) ||
      (currentChat && currentChat.timestamp) ||
      (currentChat && currentChat.lastMessage && currentChat.lastMessage.timestamp) ||
      Date.now(),
      Math.floor(Date.now() / 1000)
    );
  }

  function sanitizeGroupList(list) {
    return list
      .filter(item => item && typeof item === 'object')
      .map(group => {
        const id = getChatId(group);

        return applyLocalReadState({
          ...group,
          id,
          chatId: id,
          isGroup: true,
        });
      })
      .filter(group => getChatId(group));
  }

  function mergeChatAndGroupLists(chatListValue, groupListValue) {
    const byId = new Map();

    chatListValue
      .filter(chat => chat && typeof chat === 'object')
      .forEach(chat => {
        const id = getChatId(chat);

        if (id) {
          byId.set(id, chat);
        }
      });

    groupListValue
      .filter(group => group && typeof group === 'object')
      .forEach(group => {
        const id = getChatId(group);

        if (!id) {
          return;
        }

        byId.set(id, mergeNativeGroupIntoChat(byId.get(id), group));
      });

    return Array.from(byId.values())
      .sort((a, b) => resolveComparableChatTimestamp(b) - resolveComparableChatTimestamp(a));
  }

  function mergeNativeGroupIntoChat(chat, group) {
    const base = chat && typeof chat === 'object' ? chat : {};
    const groupTimestamp = resolveComparableChatTimestamp(group);
    const baseTimestamp = resolveComparableChatTimestamp(base);
    const next = {
      ...base,
      ...group,
      id: getChatId(group) || getChatId(base),
      isGroup: true,
    };

    if (!group.lastMessage && base.lastMessage) {
      next.lastMessage = base.lastMessage;
    }

    if (!group.lastMessageBody && base.lastMessageBody) {
      next.lastMessageBody = base.lastMessageBody;
    }

    if (!group.bodyPreview && base.bodyPreview) {
      next.bodyPreview = base.bodyPreview;
    }

    if (baseTimestamp > groupTimestamp) {
      next.timestamp = base.timestamp || base.t || next.timestamp;
      next.t = base.t || base.timestamp || next.t;
      next.lastMessageTimestamp = base.lastMessageTimestamp || next.lastMessageTimestamp;
    }

    return applyLocalReadState(next);
  }

  function mergeIncomingChats(list) {
    const currentChatById = new Map(
      chats.value.map(chat => [getChatId(chat), chat])
    );

    return list.map(chat => mergeIncomingChat(chat, currentChatById.get(getChatId(chat))));
  }

  function mergeIncomingChat(chat, currentChat) {
    if (!chat || typeof chat !== 'object') {
      return chat;
    }

    const chatId = getChatId(chat);
    let next = {
      ...chat,
    };

    if (currentChat && typeof currentChat === 'object') {
      const currentTimestamp = resolveComparableChatTimestamp(currentChat);
      const incomingTimestamp = resolveComparableChatTimestamp(chat);
      const currentContact = currentChat.contact && typeof currentChat.contact === 'object' ? currentChat.contact : {};
      const nextContact = next.contact && typeof next.contact === 'object' ? { ...next.contact } : {};

      if (currentChat.displayName && !next.displayName) {
        next.displayName = currentChat.displayName;
      }

      if (currentChat.linkedEntityName && !next.linkedEntityName) {
        next.linkedEntityName = currentChat.linkedEntityName;
      }

      if (shouldReplaceDisplayLabel(next.name, chatId) && !shouldReplaceDisplayLabel(currentChat.name, chatId)) {
        next.name = currentChat.name;
      }

      if (
        shouldReplaceDisplayLabel(next.formattedTitle, chatId) &&
        !shouldReplaceDisplayLabel(currentChat.formattedTitle, chatId)
      ) {
        next.formattedTitle = currentChat.formattedTitle;
      }

      if (shouldReplaceDisplayLabel(nextContact.name, chatId) && !shouldReplaceDisplayLabel(currentContact.name, chatId)) {
        nextContact.name = currentContact.name;
      }

      if (
        shouldReplaceDisplayLabel(nextContact.pushname, chatId) &&
        !shouldReplaceDisplayLabel(currentContact.pushname, chatId)
      ) {
        nextContact.pushname = currentContact.pushname;
      }

      if (
        shouldReplaceDisplayLabel(nextContact.shortName, chatId) &&
        !shouldReplaceDisplayLabel(currentContact.shortName, chatId)
      ) {
        nextContact.shortName = currentContact.shortName;
      }

      if (Object.keys(nextContact).length) {
        next.contact = nextContact;
      }

      if (currentTimestamp > incomingTimestamp) {
        next = {
          ...next,
          lastMessage: currentChat.lastMessage || next.lastMessage,
          lastMessageBody: currentChat.lastMessageBody || next.lastMessageBody,
          bodyPreview: currentChat.bodyPreview || next.bodyPreview,
          lastMessageTimestamp: currentChat.lastMessageTimestamp || next.lastMessageTimestamp,
          timestamp: currentChat.timestamp || next.timestamp,
          t: currentChat.t || currentChat.timestamp || next.t,
          unreadCount: currentChat.unreadCount ?? next.unreadCount,
          unread: currentChat.unread ?? next.unread,
        };
      }
    }

    return applyLocalReadState(next);
  }

  function applyLocalReadState(chat) {
    if (!chat || typeof chat !== 'object') {
      return chat;
    }

    const chatId = getChatId(chat);
    const readAt = Number(localReadStateByChat.value[chatId] || 0);

    if (!readAt) {
      return chat;
    }

    const chatTimestamp = resolveComparableChatTimestamp(chat);

    if (!chatTimestamp || chatTimestamp > readAt || Number(chat.unreadCount || 0) <= 0) {
      return chat;
    }

    return {
      ...chat,
      unreadCount: 0,
      unread: 0,
    };
  }

  function resolveComparableChatTimestamp(chat) {
    if (!chat || typeof chat !== 'object') {
      return 0;
    }

    return toUnixTimestamp(
      chat.timestamp ||
      chat.t ||
      chat.lastMessageTimestamp ||
      (chat.lastMessage && chat.lastMessage.timestamp) ||
      (chat.lastMessageData && chat.lastMessageData.timestamp) ||
      0,
      0
    );
  }

  function toUnixTimestamp(value, fallback = 0) {
    if (typeof value === 'number') {
      return value > 9999999999 ? Math.floor(value / 1000) : Math.floor(value);
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 9999999999 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }

    const parsed = Date.parse(String(value || ''));

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed / 1000);
    }

    return fallback;
  }

  function syncChatIdentity(chatId, context) {
    if (!chatId || !context || typeof context !== 'object') {
      return;
    }

    const displayName = String(context.linkedEntityName || context.displayName || '').trim();

    if (!displayName) {
      return;
    }

    let updated = false;
    const nextChats = chats.value.map(chat => {
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

      if (hasSameChatIdentity(chat, next)) {
        return chat;
      }

      updated = true;

      return next;
    });

    if (updated) {
      chats.value = nextChats;
    }

    if (activeChatId.value === chatId) {
      const chat = (updated ? nextChats : chats.value).find(item => getChatId(item) === chatId) || null;
      const nextName = chat ? getSafeChatName(chat) : displayName;

      if (activeChatName.value !== nextName) {
        activeChatName.value = nextName;
      }
    }
  }

  function hasSameChatIdentity(current, next) {
    const currentContact = current.contact && typeof current.contact === 'object' ? current.contact : {};
    const nextContact = next.contact && typeof next.contact === 'object' ? next.contact : {};

    return String(current.displayName || '') === String(next.displayName || '') &&
      String(current.linkedEntityName || '') === String(next.linkedEntityName || '') &&
      String(current.name || '') === String(next.name || '') &&
      String(current.formattedTitle || '') === String(next.formattedTitle || '') &&
      String(currentContact.name || '') === String(nextContact.name || '') &&
      String(currentContact.pushname || '') === String(nextContact.pushname || '') &&
      String(currentContact.shortName || '') === String(nextContact.shortName || '');
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

  function sanitizeConversationPreview(list) {
    return list
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        id: String(item.id || item.messageId || ''),
        messageId: String(item.messageId || item.id || ''),
        body: String(item.body || item.bodyPreview || ''),
        author: String(item.author || item.from || ''),
        fromMe: !!item.fromMe,
        timestamp: normalizeHistoryTimestamp(item.timestamp),
      }))
      .filter(item => item.body);
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
    qrCode,
    chats,
    groups,
    chatList,
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
    conversationPreviewById,
    loadingStatus,
    loadingQr,
    loadingChats,
    loadingGroups,
    loadingMessages,
    loadingContext,
    loadingHistory,
    sendingMessage,
    queuedMessages,
    queuedCount,
    lastError,
    lastMessageLoadError,
    configure,
    findChatById,
    findChatByPhone,
    createChatFromPhone,
    loadStatus,
    startLogin,
    logout,
    loadChats,
    loadGroups,
    openChat,
    loadMessages,
    loadMoreMessages,
    refreshActiveMessages,
    loadChatContext,
    loadConversationHistory,
    loadConversationPreview,
    createContactFromActiveChat,
    loadAvatarUrl,
    sendMessage,
    sendMedia,
    sendLocation,
    sendContactCard,
    createPoll,
    editMessage,
    deleteMessage,
    reactToMessage,
    forwardMessage,
    setMessageStarred,
    getMessageReactions,
    downloadMedia,
    getPollVotes,
    voteInPoll,
    setAccountStatus,
    updateProfilePicture,
    getContactStatus,
    getContactProfilePicture,
    blockUser,
    unblockUser,
    checkNumberOnWhatsApp,
    getBlockedContacts,
    runChatOperation,
    retryMessage,
    flushQueuedMessages,
    handleRealtimeEvent,
  };
});
