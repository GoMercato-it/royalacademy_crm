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

  getChats({ refresh = false } = {}) {
    return this.get('WhatsApp/action/getChats', refresh ? { refresh: true } : {});
  }

  getChatMessages(chatId, { limit = 50, mode = 'stored', refresh = false } = {}) {
    return this.get('WhatsApp/action/getChatMessages', {
      chatId,
      limit,
      mode,
      refresh,
      sync: false,
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
