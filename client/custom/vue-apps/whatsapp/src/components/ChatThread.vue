<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  activeChatId: {
    type: String,
    default: null,
  },
  activeChatName: {
    type: String,
    default: '',
  },
  messages: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  targetMessageId: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['load-more', 'refresh', 'retry-message']);
const listRef = ref(null);
let lastLoadMoreAt = 0;

const title = computed(() => props.activeChatName || (isLidChatId(props.activeChatId) ? 'WhatsApp contact' : formatChatId(props.activeChatId)));
const subtitle = computed(() => formatChatId(props.activeChatId));

const orderedMessages = computed(() => props.messages
  .slice()
  .sort((a, b) => getTimestamp(a) - getTimestamp(b)));

const groupedMessages = computed(() => {
  const groups = [];
  let current = null;

  orderedMessages.value.forEach(message => {
    const dateKey = formatDateKey(message);

    if (!current || current.key !== dateKey) {
      current = {
        key: dateKey,
        label: formatDateLabel(message),
        messages: [],
      };
      groups.push(current);
    }

    current.messages.push(message);
  });

  return groups;
});

watch(() => props.activeChatId, () => {
  scrollToBottom();
});

watch(() => orderedMessages.value.length, (count, previousCount) => {
  if (count >= previousCount && shouldStickToBottom()) {
    scrollToBottom();
  }

  if (props.targetMessageId) {
    scrollToMessage(props.targetMessageId);
  }
});

watch(() => props.targetMessageId, messageId => {
  if (messageId) {
    scrollToMessage(messageId);
  }
});

function handleScroll() {
  const element = listRef.value;
  const now = Date.now();

  if (!element || props.loading || !props.activeChatId) {
    return;
  }

  if (element.scrollTop < 72 && now - lastLoadMoreAt > 100) {
    lastLoadMoreAt = now;
    emit('load-more');
  }
}

function shouldStickToBottom() {
  const element = listRef.value;

  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 140;
}

function scrollToBottom() {
  nextTick(() => {
    const element = listRef.value;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  });
}

function scrollToMessage(messageId) {
  nextTick(() => {
    const element = listRef.value;

    if (!element || !messageId) {
      return;
    }

    const target = element.querySelector(`[data-message-id="${escapeAttribute(messageId)}"]`);

    if (!target) {
      return;
    }

    target.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  });
}

function getMessageIdentifier(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  return String(message.messageId || message.id || '');
}

function isTargetMessage(message) {
  const messageId = getMessageIdentifier(message);

  return messageId !== '' && messageId === props.targetMessageId;
}

function escapeAttribute(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getMessageBody(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }

  return message.body ||
    message.bodyPreview ||
    message.caption ||
    (message.type && message.type !== 'chat' ? `[${message.type}]` : '') ||
    (message.hasMedia ? '[Media]' : '');
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

function formatTime(message) {
  const timestamp = getTimestamp(message);

  if (!timestamp) {
    return '';
  }

  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateKey(message) {
  const timestamp = getTimestamp(message);

  if (!timestamp) {
    return 'unknown';
  }

  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function formatDateLabel(message) {
  const timestamp = getTimestamp(message);

  if (!timestamp) {
    return 'No date';
  }

  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getAckLabel(message) {
  if (!message || !message.fromMe) {
    return '';
  }

  const ack = Number(message.ack ?? 0);

  if (message.failed) {
    return '!';
  }

  if (message.queued) {
    return 'queued';
  }

  if (message.pending) {
    return '...';
  }

  if (ack >= 3 || message.status === 'read') {
    return '✓✓';
  }

  if (ack >= 2 || message.status === 'delivered') {
    return '✓✓';
  }

  return '✓';
}

function getAckClass(message) {
  if (!message || !message.fromMe) {
    return '';
  }

  if (Number(message.ack ?? 0) >= 3 || message.status === 'read') {
    return 'is-read';
  }

  return '';
}

function isRetryableMessage(message) {
  return !!(message && message.fromMe && (message.failed || message.queued));
}

function formatChatId(chatId) {
  if (isLidChatId(chatId)) {
    return '';
  }

  return String(chatId || '').replace(/@c\.us|@g\.us/g, '');
}

function isLidChatId(chatId) {
  return String(chatId || '').toLowerCase().trim().endsWith('@lid');
}
</script>

<template>
  <section class="wa-thread-panel">
    <div v-if="activeChatId" class="wa-thread-panel__header">
      <div>
        <p class="wa-vue-kicker">Chat</p>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <button type="button" class="wa-icon-button" title="Refresh messages" aria-label="Refresh messages" @click="emit('refresh')">
        <span class="fas fa-rotate-right"></span>
      </button>
    </div>

    <div v-if="!activeChatId" class="wa-thread-empty">
      <span class="fas fa-comments"></span>
      <h2>Select a chat</h2>
    </div>

    <div v-else ref="listRef" class="wa-message-list" @scroll.passive="handleScroll">
      <div v-if="loading && !orderedMessages.length" class="wa-thread-loading">
        <div v-for="item in 8" :key="item" class="wa-message-skeleton"></div>
      </div>

      <div v-else-if="!orderedMessages.length" class="wa-thread-empty is-compact">
        <span class="fas fa-comment-slash"></span>
        <p>No stored messages yet.</p>
      </div>

      <template v-else>
        <div v-if="loading" class="wa-thread-loading is-inline">
          <div class="wa-message-skeleton"></div>
        </div>

        <section v-for="group in groupedMessages" :key="group.key" class="wa-message-date-group">
          <div class="wa-message-date-chip">{{ group.label }}</div>

          <TransitionGroup name="wa-message" tag="div" class="wa-message-date-group__messages">
            <div
              v-for="message in group.messages"
              :key="message.messageId || message.id || `${message.timestamp}-${message.bodyPreview}`"
              :data-message-id="getMessageIdentifier(message)"
              class="wa-message-row"
              :class="{ 'is-outgoing': message.fromMe, 'is-target': isTargetMessage(message) }"
            >
              <div class="wa-message-bubble" :class="{ 'is-pending': message.pending, 'is-failed': message.failed }">
                <p>{{ getMessageBody(message) }}</p>
                <time>
                  {{ formatTime(message) }}
                  <span v-if="getAckLabel(message)" class="wa-message-ack" :class="getAckClass(message)">
                    {{ getAckLabel(message) }}
                  </span>
                </time>
                <button
                  v-if="isRetryableMessage(message)"
                  type="button"
                  class="wa-message-retry"
                  title="Retry send"
                  aria-label="Retry send"
                  @click="emit('retry-message', message)"
                >
                  <span class="fas fa-rotate-right"></span>
                  <span>Retry</span>
                </button>
              </div>
            </div>
          </TransitionGroup>
        </section>
      </template>
    </div>
  </section>
</template>
