const DEFAULT_RETRY_OPTIONS = {
  retries: 2,
  retryDelay: 350,
};

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').replace(/^\/+/, '');
}

function toQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    query.set(key, String(value));
  });

  const serialized = query.toString();

  return serialized ? `?${serialized}` : '';
}

function getEspoAjax(context = {}) {
  return context.ajax || (window.Espo && window.Espo.Ajax) || null;
}

export class EspoApiClient {
  constructor(context = {}, retryOptions = {}) {
    this.context = context;
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...retryOptions,
    };
  }

  async get(endpoint, params = {}, options = {}) {
    return this.request('GET', endpoint, { params, ...options });
  }

  async post(endpoint, body = {}, options = {}) {
    return this.request('POST', endpoint, { body, ...options });
  }

  async request(method, endpoint, options = {}) {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const retries = options.retries ?? this.retryOptions.retries;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.requestOnce(method, normalizedEndpoint, options);
      } catch (error) {
        lastError = error;

        if (attempt >= retries || !this.shouldRetry(error)) {
          break;
        }

        await wait(this.retryOptions.retryDelay * (attempt + 1));
      }
    }

    throw lastError;
  }

  async requestOnce(method, endpoint, options = {}) {
    const ajax = getEspoAjax(this.context);

    if (ajax) {
      if (method === 'GET') {
        return ajax.getRequest(endpoint, options.params || {});
      }

      return ajax.postRequest(endpoint, options.body || {});
    }

    return this.fetchRequest(method, endpoint, options);
  }

  async fetchRequest(method, endpoint, options = {}) {
    const basePath = this.context.basePath || '';
    const url = `${basePath}api/v1/${endpoint}${method === 'GET' ? toQuery(options.params) : ''}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.context.auth) {
      headers.Authorization = `Basic ${this.context.auth}`;
      headers['Espo-Authorization'] = this.context.auth;
      headers['Espo-Authorization-By-Token'] = 'true';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
    });

    if (!response.ok) {
      const error = new Error(`Espo API request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  shouldRetry(error) {
    const status = error && (error.status || (error.response && error.response.status));

    return !status || status === 0 || status >= 500;
  }

  getStatus() {
    return this.get('WhatsApp/action/status');
  }

  login() {
    return this.get('WhatsApp/action/login');
  }

  logout() {
    return this.post('WhatsApp/action/logout');
  }

  getChats({ refresh = false } = {}) {
    return this.get('WhatsApp/action/getChats', refresh ? { refresh: true } : {});
  }

  getGroups({ forceRefresh = false } = {}) {
    return this.get('WhatsApp/action/getChatFolders', forceRefresh ? { forceRefresh: true } : {});
  }

  getGroupDetails(groupId) {
    return this.get('WhatsApp/action/getGroupDetails', {
      groupId,
    });
  }

  createGroup(name, participants) {
    return this.post('WhatsApp/action/createGroup', {
      name,
      participants,
    });
  }

  leaveGroup(groupId) {
    return this.post('WhatsApp/action/leaveGroup', {
      groupId,
    });
  }

  addGroupParticipants(groupId, participants) {
    return this.post('WhatsApp/action/addGroupParticipants', {
      groupId,
      participants,
    });
  }

  updateGroupSetting(groupId, setting) {
    return this.post('WhatsApp/action/updateGroupSetting', {
      groupId,
      setting,
    });
  }

  getChatMessages(chatId, { limit = 50 } = {}) {
    return this.get('WhatsApp/action/getChatMessages', {
      chatId,
      limit,
    });
  }

  getChatContext(chatId, phoneNumber = '') {
    return this.get('WhatsApp/action/getChatContext', {
      chatId,
      phoneNumber,
    });
  }

  getConversationHistory(chatId, { limit = 20 } = {}) {
    return this.get('WhatsApp/action/getConversationHistory', {
      chatId,
      limit,
    });
  }

  getConversationPreview(conversationId, { limit = 5 } = {}) {
    return this.get('WhatsApp/action/conversationPreview', {
      conversationId,
      limit,
    });
  }

  getProfilePic(chatId) {
    return this.get('WhatsApp/action/getProfilePic', {
      id: chatId,
    });
  }

  sendMessage(chatId, message) {
    return this.post('WhatsApp/action/sendMessage', {
      chatId,
      message,
    });
  }

  sendLocation(chatId, latitude, longitude, description = '') {
    return this.post('WhatsApp/action/sendLocation', {
      chatId,
      latitude,
      longitude,
      description,
    });
  }

  sendContactCard(chatId, contactId) {
    return this.post('WhatsApp/action/sendContactCard', {
      chatId,
      contactId,
    });
  }

  sendImage(chatId, imageUrl, caption = '') {
    return this.post('WhatsApp/action/sendImage', {
      chatId,
      imageUrl,
      caption,
    });
  }

  sendVideo(chatId, videoUrl, caption = '') {
    return this.post('WhatsApp/action/sendVideo', {
      chatId,
      videoUrl,
      caption,
    });
  }

  sendAudio(chatId, audioUrl, { asVoice = false } = {}) {
    return this.post('WhatsApp/action/sendAudio', {
      chatId,
      audioUrl,
      asVoice,
    });
  }

  sendVoiceNote(chatId, audioUrl) {
    return this.post('WhatsApp/action/sendVoiceNote', {
      chatId,
      audioUrl,
    });
  }

  sendDocument(chatId, documentUrl, filename, caption = '') {
    return this.post('WhatsApp/action/sendDocument', {
      chatId,
      documentUrl,
      filename,
      caption,
    });
  }

  sendSticker(chatId, stickerUrl) {
    return this.post('WhatsApp/action/sendSticker', {
      chatId,
      stickerUrl,
    });
  }

  downloadMedia(chatId, messageId) {
    return this.post('WhatsApp/action/downloadMedia', {
      chatId,
      messageId,
    });
  }

  editMessage(chatId, messageId, content) {
    return this.post('WhatsApp/action/editMessage', {
      chatId,
      messageId,
      content,
    });
  }

  deleteMessage(chatId, messageId, { everyone = false, clearMedia = false } = {}) {
    return this.post('WhatsApp/action/deleteMessage', {
      chatId,
      messageId,
      everyone,
      clearMedia,
    });
  }

  reactToMessage(chatId, messageId, reaction) {
    return this.post('WhatsApp/action/reactToMessage', {
      chatId,
      messageId,
      reaction,
    });
  }

  forwardMessage(chatId, messageId, destinationChatId) {
    return this.post('WhatsApp/action/forwardMessage', {
      chatId,
      messageId,
      destinationChatId,
    });
  }

  starMessage(chatId, messageId) {
    return this.post('WhatsApp/action/starMessage', {
      chatId,
      messageId,
    });
  }

  unstarMessage(chatId, messageId) {
    return this.post('WhatsApp/action/unstarMessage', {
      chatId,
      messageId,
    });
  }

  getMessageReactions(chatId, messageId) {
    return this.post('WhatsApp/action/getMessageReactions', {
      chatId,
      messageId,
    });
  }

  createPoll(chatId, question, pollOptions, config = {}) {
    return this.post('WhatsApp/action/createPoll', {
      chatId,
      question,
      pollOptions,
      config,
    });
  }

  getPollVotes(chatId, messageId) {
    return this.post('WhatsApp/action/getPollVotes', {
      chatId,
      messageId,
    });
  }

  voteInPoll(chatId, messageId, selectedOptions) {
    return this.post('WhatsApp/action/voteInPoll', {
      chatId,
      messageId,
      selectedOptions,
    });
  }

  setStatus(status) {
    return this.post('WhatsApp/action/setStatus', {
      status,
    });
  }

  getContactStatus(contactId) {
    return this.get('WhatsApp/action/getContactStatus', {
      contactId,
    });
  }

  updateProfilePicture(pictureMimetype, pictureData) {
    return this.post('WhatsApp/action/updateProfilePicture', {
      pictureMimetype,
      pictureData,
    });
  }

  getContactProfilePicture(contactId) {
    return this.get('WhatsApp/action/getContactProfilePicture', {
      contactId,
    });
  }

  blockUser(contactId) {
    return this.post('WhatsApp/action/blockUser', {
      contactId,
    });
  }

  unblockUser(contactId) {
    return this.post('WhatsApp/action/unblockUser', {
      contactId,
    });
  }

  checkNumberOnWhatsApp(number) {
    return this.post('WhatsApp/action/checkNumberOnWhatsApp', {
      number,
    });
  }

  getBlockedContacts() {
    return this.get('WhatsApp/action/getBlockedContacts');
  }

  archiveChat(chatId) {
    return this.post('WhatsApp/action/archiveChat', {
      chatId,
    });
  }

  unarchiveChat(chatId) {
    return this.post('WhatsApp/action/unarchiveChat', {
      chatId,
    });
  }

  muteChat(chatId, { unmuteDate = null, duration = null } = {}) {
    return this.post('WhatsApp/action/muteChat', {
      chatId,
      unmuteDate,
      duration,
    });
  }

  unmuteChat(chatId) {
    return this.post('WhatsApp/action/unmuteChat', {
      chatId,
    });
  }

  pinChat(chatId) {
    return this.post('WhatsApp/action/pinChat', {
      chatId,
    });
  }

  unpinChat(chatId) {
    return this.post('WhatsApp/action/unpinChat', {
      chatId,
    });
  }

  markChatRead(chatId) {
    return this.post('WhatsApp/action/markChatRead', {
      chatId,
    });
  }

  markChatUnread(chatId) {
    return this.post('WhatsApp/action/markChatUnread', {
      chatId,
    });
  }

  clearChatMessages(chatId) {
    return this.post('WhatsApp/action/clearChatMessages', {
      chatId,
    });
  }

  createContactFromChat(chatId, { displayName = '', phoneNumber = '' } = {}) {
    return this.post('WhatsApp/action/createContactFromChat', {
      chatId,
      displayName,
      phoneNumber,
    });
  }
}

export function createEspoApiClient(context, retryOptions) {
  return new EspoApiClient(context, retryOptions);
}
