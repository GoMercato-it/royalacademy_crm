const DB_NAME = 'wa-vue-cache';
const DB_VERSION = 1;
const MESSAGE_STORE = 'messagesByChat';
const MAX_MESSAGES_PER_CHAT = 1000;
export const MESSAGE_CACHE_FRESH_MS = 30 * 1000;

let databasePromise = null;

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
        database.createObjectStore(MESSAGE_STORE, { keyPath: 'chatId' });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error || new Error('Unable to open IndexedDB.'));
  });

  return databasePromise;
}

function runTransaction(mode, callback) {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, mode);
    const store = transaction.objectStore(MESSAGE_STORE);
    const request = callback(store);

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error || new Error('IndexedDB transaction failed.'));
  }));
}

export async function readCachedMessages(chatId) {
  const entry = await readCachedMessagesEntry(chatId);

  return entry ? entry.messages : [];
}

export async function readCachedMessagesEntry(chatId, { maxAgeMs = null, allowStale = true } = {}) {
  if (!chatId) {
    return null;
  }

  try {
    const record = await runTransaction('readonly', store => store.get(chatId));
    const entry = normalizeCacheRecord(record, maxAgeMs ?? MESSAGE_CACHE_FRESH_MS);

    if (!entry) {
      return null;
    }

    if (!allowStale && !entry.fresh) {
      return null;
    }

    return entry;
  } catch (error) {
    return null;
  }
}

export async function writeCachedMessages(chatId, messages) {
  if (!chatId || !Array.isArray(messages)) {
    return;
  }

  const normalized = messages
    .slice()
    .sort((a, b) => getTimestamp(a) - getTimestamp(b))
    .slice(-MAX_MESSAGES_PER_CHAT);

  try {
    await runTransaction('readwrite', store => store.put({
      chatId,
      messages: normalized,
      savedAt: Date.now(),
      version: Date.now(),
      fresh: true,
    }));
  } catch (error) {}
}

export async function mergeCachedMessage(chatId, message) {
  if (!chatId || !message) {
    return [];
  }

  const current = await readCachedMessages(chatId);
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

  await writeCachedMessages(chatId, next);

  return next;
}

function getTimestamp(message) {
  if (!message || typeof message !== 'object') {
    return 0;
  }

  const raw = message.timestamp || message.createdAt || message.createdAtDate || 0;

  if (typeof raw === 'number') {
    return raw > 9999999999 ? raw / 1000 : raw;
  }

  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 9999999999 ? numeric / 1000 : numeric;
  }

  const parsed = Date.parse(String(raw));

  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

function normalizeCacheRecord(record, maxAgeMs) {
  if (!record || !Array.isArray(record.messages)) {
    return null;
  }

  const version = Number(record.version || record.savedAt || 0);
  const savedAt = Number(record.savedAt || version || 0);
  const age = savedAt > 0 ? Date.now() - savedAt : Number.POSITIVE_INFINITY;

  return {
    chatId: record.chatId,
    messages: record.messages,
    savedAt,
    version,
    age,
    fresh: age <= maxAgeMs,
  };
}
