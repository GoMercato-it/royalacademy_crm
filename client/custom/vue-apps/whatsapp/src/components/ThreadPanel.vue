<script setup>
import { computed, ref, watch } from 'vue';

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
  sending: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['send']);
const draft = ref('');

const title = computed(() => props.activeChatName || formatChatId(props.activeChatId));

const orderedMessages = computed(() => props.messages
  .slice()
  .sort((a, b) => getTimestamp(a) - getTimestamp(b)));

watch(() => props.activeChatId, () => {
  draft.value = '';
});

function submit() {
  const text = draft.value.trim();

  if (!text || props.sending) {
    return;
  }

  emit('send', text);
  draft.value = '';
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

function formatChatId(chatId) {
  return String(chatId || '').replace(/@c\.us|@g\.us/g, '');
}
</script>

<template>
  <section class="wa-thread-panel">
    <div v-if="activeChatId" class="wa-thread-panel__header">
      <div>
        <p class="wa-vue-kicker">Chat</p>
        <h2>{{ title }}</h2>
        <p>{{ formatChatId(activeChatId) }}</p>
      </div>
    </div>

    <div v-if="!activeChatId" class="wa-thread-empty">
      <span class="fas fa-comments"></span>
      <h2>Select a chat</h2>
    </div>

    <div v-else-if="loading && !orderedMessages.length" class="wa-thread-loading">
      <div v-for="item in 8" :key="item" class="wa-message-skeleton"></div>
    </div>

    <div v-else class="wa-message-list">
      <div v-if="!orderedMessages.length" class="wa-thread-empty is-compact">
        <span class="fas fa-comment-slash"></span>
        <p>No stored messages yet.</p>
      </div>

      <template v-else>
        <div
          v-for="message in orderedMessages"
          :key="message.messageId || message.id || `${message.timestamp}-${message.bodyPreview}`"
          class="wa-message-row"
          :class="{ 'is-outgoing': message.fromMe }"
        >
          <div class="wa-message-bubble" :class="{ 'is-pending': message.pending, 'is-failed': message.failed }">
            <p>{{ getMessageBody(message) }}</p>
            <time>{{ formatTime(message) }}</time>
          </div>
        </div>
      </template>
    </div>

    <form v-if="activeChatId" class="wa-composer" @submit.prevent="submit">
      <input
        v-model="draft"
        type="text"
        autocomplete="off"
        placeholder="Type a message"
        :disabled="sending"
      />
      <button type="submit" class="btn btn-primary" :disabled="sending || !draft.trim()">
        Send
      </button>
    </form>
  </section>
</template>
