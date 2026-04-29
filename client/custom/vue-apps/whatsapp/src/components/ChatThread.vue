<script setup>
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';

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

const emit = defineEmits(['load-more', 'retry-message', 'message-action']);
const listRef = ref(null);
const openMenuId = ref(null);
const emojiPickerMessageId = ref(null);
const expandedEmojiPickerMessageId = ref(null);
const editingMessageId = ref(null);
const editText = ref('');
const deletingMessageId = ref(null);
const editInputRef = ref(null);
let lastLoadMoreAt = 0;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EMOJI_REACTION_CHOICES = [
  '👍', '👎', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '😀', '😄', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩',
  '😮', '😯', '😲', '😳', '🥹', '😢', '😭', '😤', '😡', '🤯',
  '👏', '🙌', '🙏', '🤝', '💪', '👌', '✌️', '🤞', '🤟', '🤘',
  '🔥', '✨', '🎉', '🥳', '💯', '✅', '⭐', '🌟', '🚀', '👀',
  '☕', '🍕', '🍾', '🎁', '🏆', '📌', '💡', '🫡', '🤔', '🤗',
];

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
  openMenuId.value = null;
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  editingMessageId.value = null;
  deletingMessageId.value = null;
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

let skipNextOutsideClick = false;

function handleClickOutside(event) {
  if (skipNextOutsideClick) {
    skipNextOutsideClick = false;
    return;
  }

  const target = event.target;

  if (target.closest('.wa-msg-menu') || target.closest('.wa-msg-chevron') || target.closest('.wa-emoji-picker') || target.closest('.wa-inline-edit') || target.closest('.wa-delete-confirm')) {
    return;
  }

  openMenuId.value = null;
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  editingMessageId.value = null;
  deletingMessageId.value = null;
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
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

function getReactions(message) {
  if (!message) return {};
  const meta = message.payloadMeta || {};
  if (meta.reactions && Array.isArray(meta.reactions)) {
    return meta.reactions.reduce((acc, r) => {
      if (r.reaction) {
        acc[r.reaction] = (acc[r.reaction] || 0) + 1;
      }
      return acc;
    }, {});
  }
  return {};
}

function hasReactions(message) {
  const reactions = getReactions(message);
  return Object.keys(reactions).length > 0;
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

function canActOnMessage(message) {
  return !!getMessageIdentifier(message) && !message.pending && !message.queued;
}

function canEditMessage(message) {
  return canActOnMessage(message) && !!message.fromMe && !!getMessageBody(message);
}

function canDownloadMedia(message) {
  if (!canActOnMessage(message)) {
    return false;
  }

  const payloadMeta = message && message.payloadMeta && typeof message.payloadMeta === 'object' ? message.payloadMeta : {};
  const type = String(message.type || payloadMeta.type || '').toLowerCase();

  return !!message.hasMedia || ['image', 'video', 'audio', 'voice', 'document', 'sticker'].includes(type);
}

function isPollMessage(message) {
  const payloadMeta = message && message.payloadMeta && typeof message.payloadMeta === 'object' ? message.payloadMeta : {};
  const type = String(message.type || payloadMeta.type || '').toLowerCase();

  return type === 'poll' || !!message.pollName || !!payloadMeta.pollName;
}

function isStarred(message) {
  return !!(message && (message.isStarred || message.starred));
}

function toggleMenu(messageId) {
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;

  if (openMenuId.value === messageId) {
    openMenuId.value = null;
  } else {
    openMenuId.value = messageId;
  }
}

function toggleEmojiPicker(messageId) {
  openMenuId.value = null;
  expandedEmojiPickerMessageId.value = null;

  if (emojiPickerMessageId.value === messageId) {
    emojiPickerMessageId.value = null;
  } else {
    emojiPickerMessageId.value = messageId;
  }
}

function toggleExpandedEmojiPicker(messageId) {
  expandedEmojiPickerMessageId.value = expandedEmojiPickerMessageId.value === messageId ? null : messageId;
}

function selectReaction(reaction, message) {
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  emit('message-action', { action: 'react', message, reaction });
}

function startEdit(message) {
  skipNextOutsideClick = true;
  openMenuId.value = null;
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  editingMessageId.value = getMessageIdentifier(message);
  editText.value = getMessageBody(message);
  nextTick(() => {
    const el = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value;

    if (el) {
      el.focus();
      el.setSelectionRange(editText.value.length, editText.value.length);
    }
  });
}

function confirmEdit(message) {
  const text = editText.value.trim();
  editingMessageId.value = null;

  if (!text || text === getMessageBody(message)) {
    return;
  }

  emit('message-action', { action: 'edit', message, editedText: text });
}

function cancelEdit() {
  editingMessageId.value = null;
  editText.value = '';
}

function startDelete(message) {
  skipNextOutsideClick = true;
  openMenuId.value = null;
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  deletingMessageId.value = getMessageIdentifier(message);
}

function confirmDelete(message, everyone) {
  deletingMessageId.value = null;
  emit('message-action', { action: 'delete', message, everyone });
}

function cancelDelete() {
  deletingMessageId.value = null;
}

function emitMessageAction(action, message) {
  openMenuId.value = null;
  emojiPickerMessageId.value = null;
  expandedEmojiPickerMessageId.value = null;
  emit('message-action', { action, message });
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
                <!-- Inline edit mode -->
                <div v-if="editingMessageId === getMessageIdentifier(message)" class="wa-inline-edit">
                  <textarea
                    ref="editInputRef"
                    v-model="editText"
                    class="wa-inline-edit__input"
                    rows="2"
                    @keydown.enter.exact.prevent="confirmEdit(message)"
                    @keydown.escape="cancelEdit"
                  ></textarea>
                  <div class="wa-inline-edit__actions">
                    <button type="button" class="wa-inline-btn wa-inline-btn--save" @click="confirmEdit(message)">
                      <span class="fas fa-check"></span>
                    </button>
                    <button type="button" class="wa-inline-btn wa-inline-btn--cancel" @click="cancelEdit">
                      <span class="fas fa-xmark"></span>
                    </button>
                  </div>
                </div>

                <!-- Normal message body -->
                <p v-else>{{ getMessageBody(message) }}</p>

                <!-- Delete confirmation -->
                <Transition name="wa-menu-fade">
                  <div v-if="deletingMessageId === getMessageIdentifier(message)" class="wa-delete-confirm" @click.stop>
                    <span>Delete message?</span>
                    <button type="button" class="wa-inline-btn wa-inline-btn--danger" @click="confirmDelete(message, false)">
                      For me
                    </button>
                    <button v-if="message.fromMe" type="button" class="wa-inline-btn wa-inline-btn--danger" @click="confirmDelete(message, true)">
                      For everyone
                    </button>
                    <button type="button" class="wa-inline-btn wa-inline-btn--cancel" @click="cancelDelete">
                      Cancel
                    </button>
                  </div>
                </Transition>

                <div class="wa-message-meta">
                  <span v-if="isStarred(message)" class="wa-message-star" title="Starred">
                    <span class="fas fa-star"></span>
                  </span>
                  <time>{{ formatTime(message) }}</time>
                  <span v-if="getAckLabel(message)" class="wa-message-ack" :class="getAckClass(message)">
                    {{ getAckLabel(message) }}
                  </span>
                </div>

                <!-- Reactions display -->
                <div v-if="hasReactions(message)" class="wa-message-reactions">
                  <span v-for="(count, emoji) in getReactions(message)" :key="emoji" class="wa-reaction-badge">
                    {{ emoji }} <small v-if="count > 1">{{ count }}</small>
                  </span>
                </div>

                <!-- Retry for failed/queued -->
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

                <!-- Chevron trigger for action menu -->
                <button
                  v-if="canActOnMessage(message)"
                  type="button"
                  class="wa-msg-chevron"
                  :class="{ 'is-open': openMenuId === getMessageIdentifier(message) || emojiPickerMessageId === getMessageIdentifier(message) }"
                  :title="openMenuId === getMessageIdentifier(message) ? 'Close menu' : 'Message options'"
                  aria-label="Message options"
                  @click.stop="toggleMenu(getMessageIdentifier(message))"
                >
                  <span class="fas fa-chevron-down"></span>
                </button>

                <!-- Dropdown action menu -->
                <Transition name="wa-menu-fade">
                  <div
                    v-if="openMenuId === getMessageIdentifier(message)"
                    class="wa-msg-menu"
                    @click.stop
                  >
                    <button type="button" @click="toggleEmojiPicker(getMessageIdentifier(message))">
                      <span class="far fa-face-smile"></span> React
                    </button>
                    <button v-if="canEditMessage(message)" type="button" @click="startEdit(message)">
                      <span class="fas fa-pen"></span> Edit
                    </button>
                    <button type="button" @click="startDelete(message)">
                      <span class="fas fa-trash"></span> Delete
                    </button>
                    <button type="button" @click="emitMessageAction('forward', message)">
                      <span class="fas fa-share"></span> Forward
                    </button>
                    <button type="button" @click="emitMessageAction(isStarred(message) ? 'unstar' : 'star', message)">
                      <span :class="isStarred(message) ? 'fas fa-star' : 'far fa-star'"></span>
                      {{ isStarred(message) ? 'Unstar' : 'Star' }}
                    </button>
                    <button v-if="canDownloadMedia(message)" type="button" @click="emitMessageAction('download-media', message)">
                      <span class="fas fa-download"></span> Download
                    </button>
                    <button v-if="isPollMessage(message)" type="button" @click="emitMessageAction('poll-vote', message)">
                      <span class="fas fa-check-to-slot"></span> Vote
                    </button>
                  </div>
                </Transition>

                <!-- Emoji quick-reaction picker -->
                <Transition name="wa-menu-fade">
                  <div
                    v-if="emojiPickerMessageId === getMessageIdentifier(message)"
                    class="wa-emoji-picker"
                    :class="{ 'is-expanded': expandedEmojiPickerMessageId === getMessageIdentifier(message) }"
                    @click.stop
                  >
                    <div class="wa-emoji-picker__quick">
                      <button
                        v-for="emoji in QUICK_REACTIONS"
                        :key="emoji"
                        type="button"
                        class="wa-emoji-btn"
                        :title="emoji"
                        @click="selectReaction(emoji, message)"
                      >{{ emoji }}</button>
                      <button
                        type="button"
                        class="wa-emoji-btn wa-emoji-btn--more"
                        title="More reactions"
                        aria-label="More reactions"
                        @click="toggleExpandedEmojiPicker(getMessageIdentifier(message))"
                      >
                        <span class="far fa-face-smile"></span>
                      </button>
                      <button
                        type="button"
                        class="wa-emoji-btn wa-emoji-btn--remove"
                        title="Remove reaction"
                        aria-label="Remove reaction"
                        @click="selectReaction('', message)"
                      >
                        <span class="fas fa-xmark"></span>
                      </button>
                    </div>
                    <div v-if="expandedEmojiPickerMessageId === getMessageIdentifier(message)" class="wa-emoji-picker__grid">
                      <button
                        v-for="emoji in EMOJI_REACTION_CHOICES"
                        :key="emoji"
                        type="button"
                        class="wa-emoji-btn"
                        :title="emoji"
                        @click="selectReaction(emoji, message)"
                      >{{ emoji }}</button>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </TransitionGroup>
        </section>
      </template>
    </div>
  </section>
</template>
