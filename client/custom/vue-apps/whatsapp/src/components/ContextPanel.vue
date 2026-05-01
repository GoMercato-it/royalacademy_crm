<script setup>
import { computed, ref, watch } from 'vue';
import ChatAvatar from './ChatAvatar.vue';
import ConversationPreview from './ConversationPreview.vue';

const props = defineProps({
  activeChatId: {
    type: String,
    default: null,
  },
  activeChatName: {
    type: String,
    default: '',
  },
  activeChatPhone: {
    type: String,
    default: '',
  },
  context: {
    type: Object,
    default: null,
  },
  history: {
    type: Array,
    default: () => [],
  },
  loadingContext: {
    type: Boolean,
    default: false,
  },
  loadingHistory: {
    type: Boolean,
    default: false,
  },
  actionBusy: {
    type: Boolean,
    default: false,
  },
  activeChat: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits([
  'open-record',
  'create-contact',
  'jump-conversation',
  'chat-operation',
  'contact-operation',
  'load-context',
  'load-history',
]);

const detailsOpen = ref(false);
const chatActionsOpen = ref(false);
const contactActionsOpen = ref(false);
const historyOpen = ref(false);

const isGroupChat = computed(() => String(props.activeChatId || '').endsWith('@g.us'));
const hasContext = computed(() => !!props.context);
const isContextRefreshing = computed(() => !!props.activeChatId && props.loadingContext);
const isHistoryRefreshing = computed(() => !!props.activeChatId && props.loadingHistory);

const profileSubtitle = computed(() => {
  if (isGroupChat.value) {
    return 'Group chat';
  }

  return isLidChatId(props.activeChatId) ? 'WhatsApp contact' : 'Direct chat';
});

const chatIsArchived = computed(() => {
  const chat = props.activeChat;
  return !!(chat && (chat.archived || chat.isArchived));
});

const chatIsMuted = computed(() => {
  const chat = props.activeChat;
  return !!(chat && (chat.isMuted || chat.muteExpiration > 0));
});

const chatIsPinned = computed(() => {
  const chat = props.activeChat;
  return !!(chat && (chat.pinned || chat.isPinned));
});

const chatIsUnread = computed(() => {
  const chat = props.activeChat;
  if (!chat) return false;
  const unread = chat.unreadCount ?? chat.unread ?? 0;
  return Number(unread) > 0;
});

const title = computed(() => {
  const context = props.context || {};
  const participantWaId = context.participantWaId || props.activeChatId || '';
  const candidates = [
    context.displayName,
    props.activeChatName,
    props.activeChatPhone,
    participantWaId,
    props.activeChatId,
  ];

  for (const candidate of candidates) {
    const label = String(candidate || '').trim();

    if (!label) {
      continue;
    }

    if (shouldSkipPhoneLikeLabel(label, participantWaId)) {
      continue;
    }

    return label;
  }

  return isLidChatId(participantWaId) ? 'WhatsApp contact' : '';
});

const phone = computed(() => {
  const context = props.context || {};

  return formatPhone(context.displayPhone || props.activeChatPhone || '');
});

const identityLabel = computed(() => {
  const context = props.context || {};
  const raw = context.participantWaId || props.activeChatId || '';

  if (isLidChatId(raw)) {
    return '';
  }

  return raw;
});

const candidateList = computed(() => {
  const context = props.context || {};

  return Array.isArray(context.candidateList) ? context.candidateList : [];
});

watch(() => props.activeChatId, () => {
  detailsOpen.value = false;
  chatActionsOpen.value = false;
  contactActionsOpen.value = false;
  historyOpen.value = false;
});

function toggleDetails() {
  detailsOpen.value = !detailsOpen.value;

  if (detailsOpen.value && !props.context && !props.loadingContext) {
    emit('load-context');
  }
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value;

  if (historyOpen.value && !isGroupChat.value && !props.history.length && !props.loadingHistory) {
    emit('load-history');
  }
}

function openRecord(entityType, entityId) {
  if (entityType && entityId) {
    emit('open-record', { entityType, entityId });
  }
}

function formatRange(item) {
  const startedAt = parseTimestamp(item.startedAt || item.createdAt);
  const endedAt = parseTimestamp(item.endedAt || item.lastMessageAt);
  const started = formatTimestamp(startedAt);
  const ended = endedAt && (!startedAt || endedAt >= startedAt) ? formatTimestamp(endedAt) : '';

  if (started && ended && started !== ended) {
    return `${started} - ${ended}`;
  }

  return started || ended || '';
}

function formatTimestamp(value) {
  const timestamp = parseTimestamp(value);

  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value) {
  const timestamp = parseTimestamp(value);

  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleDateString();
}

function getConversationName(item) {
  const context = props.context || {};
  const participantWaId = item.participantWaId || item.chatId || context.participantWaId || props.activeChatId || '';
  const candidates = [
    item.linkedEntityName,
    item.displayName,
    item.participantName,
    title.value,
    item.displayPhone,
    phone.value,
  ];

  for (const candidate of candidates) {
    const label = String(candidate || '').trim();

    if (!label) {
      continue;
    }

    if (isGenericConversationName(label)) {
      continue;
    }

    if (label === participantWaId) {
      continue;
    }

    if (shouldSkipPhoneLikeLabel(label, participantWaId)) {
      continue;
    }

    return label;
  }

  return formatPhone(item.displayPhone || phone.value) || (isLidChatId(participantWaId) ? 'WhatsApp contact' : participantWaId);
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return normalizeTimestampNumber(value);
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return normalizeTimestampNumber(numeric);
  }

  const parsed = Date.parse(String(value));

  if (!Number.isFinite(parsed) || parsed < Date.UTC(2000, 0, 1)) {
    return null;
  }

  return parsed;
}

function normalizeTimestampNumber(value) {
  const timestamp = value > 9999999999 ? value : value * 1000;

  return timestamp >= Date.UTC(2000, 0, 1) ? timestamp : null;
}

function formatPhone(value) {
  const raw = String(value || '').trim();

  if (!raw || /@(lid|g\.us)$/iu.test(raw)) {
    return '';
  }

  const digits = raw.replace(/@.+$/u, '').replace(/[^0-9]/g, '');

  if (digits.length < 7) {
    return '';
  }

  return raw.startsWith('+') ? `+${digits}` : digits;
}

function isLidChatId(chatId) {
  return String(chatId || '').toLowerCase().trim().endsWith('@lid');
}

function isDirectContactChatId(chatId) {
  const value = String(chatId || '').toLowerCase().trim();

  return value.endsWith('@lid') || value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
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

function shouldSkipPhoneLikeLabel(label, chatId) {
  return isDirectContactChatId(chatId) &&
    looksLikePhoneLabel(label) &&
    digitsMatchChatId(label, chatId);
}

function isGenericConversationName(value) {
  return ['whatsapp contact', 'whatsapp'].includes(String(value || '').trim().toLowerCase());
}

function emitChatOperation(action) {
  emit('chat-operation', {
    action,
    chatId: props.activeChatId,
  });
}

function emitContactOperation(action) {
  emit('contact-operation', {
    action,
    contactId: props.activeChatId,
    phone: phone.value,
  });
}
</script>

<template>
  <aside class="wa-context-panel">
    <section class="wa-context-card">
      <div v-if="!activeChatId" class="wa-context-muted">
        Select a chat.
      </div>

      <template v-else>
        <div class="wa-context-profile">
          <ChatAvatar :chat-id="activeChatId" :name="title" />
          <div>
            <p class="wa-vue-kicker">Details</p>
            <h2>{{ title }}</h2>
            <span>{{ profileSubtitle }}</span>
          </div>
        </div>

        <div class="wa-context-section-list">
          <button
            type="button"
            class="wa-actions-toggle"
            :class="{ 'is-open': detailsOpen }"
            :aria-expanded="detailsOpen"
            aria-label="Toggle CRM details"
            @click="toggleDetails"
          >
            <span>CRM details</span>
            <span v-if="isContextRefreshing" class="wa-context-dot"></span>
            <span class="fas fa-chevron-down"></span>
          </button>

          <div v-if="detailsOpen" class="wa-context-section-body">
            <div v-if="isContextRefreshing" class="wa-context-refresh" aria-live="polite">
              Updating details...
            </div>

            <div v-if="isGroupChat" class="wa-context-muted">
              Group chat.
            </div>

            <template v-else>
              <div v-if="identityLabel" class="wa-context-row">
                <strong>WhatsApp ID</strong>
                <span>{{ identityLabel }}</span>
              </div>
              <div class="wa-context-row">
                <strong>Phone</strong>
                <span>{{ phone || 'N/D' }}</span>
              </div>

              <div v-if="loadingContext && !hasContext" class="wa-context-row is-loading">
                <strong>CRM</strong>
                <span>Updating...</span>
              </div>

              <div v-else-if="context && context.isLinked" class="wa-context-linked">
                <div class="wa-context-row">
                  <strong>CRM</strong>
                  <span>{{ context.linkedEntityType }} · {{ context.linkedEntityName }}</span>
                </div>
                <button
                  type="button"
                  class="btn btn-default btn-sm"
                  aria-label="Open linked CRM record"
                  @click="openRecord(context.linkedEntityType, context.linkedEntityId)"
                >
                  Open
                </button>
              </div>

              <div v-else-if="!loadingContext" class="wa-context-actions">
                <button type="button" class="btn btn-primary btn-sm" aria-label="Create CRM contact from WhatsApp chat" @click="emit('create-contact')">
                  Create CRM contact
                </button>
              </div>

              <div v-if="context && context.isAmbiguous" class="wa-context-muted">
                Multiple matching CRM records.
              </div>

              <div v-if="candidateList.length" class="wa-context-candidates">
                <button
                  v-for="candidate in candidateList"
                  :key="`${candidate.entityType}-${candidate.entityId}`"
                  type="button"
                  class="btn btn-default btn-sm"
                  :aria-label="`Open ${candidate.entityType} ${candidate.entityName}`"
                  @click="openRecord(candidate.entityType, candidate.entityId)"
                >
                  {{ candidate.entityType }}: {{ candidate.entityName }}
                </button>
              </div>
            </template>
          </div>

          <button
            type="button"
            class="wa-actions-toggle"
            :class="{ 'is-open': chatActionsOpen }"
            :aria-expanded="chatActionsOpen"
            aria-label="Toggle chat actions"
            @click="chatActionsOpen = !chatActionsOpen"
          >
            <span>Chat actions</span>
            <span class="fas fa-chevron-down"></span>
          </button>
          <div v-if="chatActionsOpen" class="wa-actions-dropdown is-open">
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitChatOperation(chatIsArchived ? 'unarchive' : 'archive')">
              <span class="fas" :class="chatIsArchived ? 'fa-box-open' : 'fa-box-archive'"></span>
              <span>{{ chatIsArchived ? 'Unarchive' : 'Archive' }}</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitChatOperation(chatIsMuted ? 'unmute' : 'mute')">
              <span class="fas" :class="chatIsMuted ? 'fa-bell' : 'fa-bell-slash'"></span>
              <span>{{ chatIsMuted ? 'Unmute' : 'Mute' }}</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitChatOperation(chatIsPinned ? 'unpin' : 'pin')">
              <span class="fas" :class="chatIsPinned ? 'fa-link-slash' : 'fa-thumbtack'"></span>
              <span>{{ chatIsPinned ? 'Unpin' : 'Pin' }}</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitChatOperation(chatIsUnread ? 'mark-read' : 'mark-unread')">
              <span class="fas" :class="chatIsUnread ? 'fa-envelope-open' : 'fa-envelope'"></span>
              <span>{{ chatIsUnread ? 'Mark read' : 'Mark unread' }}</span>
            </button>
            <hr class="wa-dropdown-divider" />
            <button type="button" class="wa-dropdown-item is-danger" :disabled="actionBusy" @click="emitChatOperation('clear')">
              <span class="fas fa-trash-can"></span>
              <span>Clear messages</span>
            </button>
          </div>

          <button
            v-if="!isGroupChat"
            type="button"
            class="wa-actions-toggle"
            :class="{ 'is-open': contactActionsOpen }"
            :aria-expanded="contactActionsOpen"
            aria-label="Toggle contact actions"
            @click="contactActionsOpen = !contactActionsOpen"
          >
            <span>Contact actions</span>
            <span class="fas fa-chevron-down"></span>
          </button>
          <div v-if="!isGroupChat && contactActionsOpen" class="wa-actions-dropdown is-open">
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitContactOperation('status')">
              <span class="fas fa-circle-info"></span>
              <span>Get status</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitContactOperation('profile-picture')">
              <span class="fas fa-address-card"></span>
              <span>Profile picture</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitContactOperation('check-number')">
              <span class="fas fa-phone-volume"></span>
              <span>Check number</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitContactOperation('blocked-contacts')">
              <span class="fas fa-list"></span>
              <span>Blocked contacts</span>
            </button>
            <hr class="wa-dropdown-divider" />
            <button type="button" class="wa-dropdown-item is-danger" :disabled="actionBusy" @click="emitContactOperation('block')">
              <span class="fas fa-ban"></span>
              <span>Block</span>
            </button>
            <button type="button" class="wa-dropdown-item" :disabled="actionBusy" @click="emitContactOperation('unblock')">
              <span class="fas fa-unlock"></span>
              <span>Unblock</span>
            </button>
          </div>
        </div>
      </template>
    </section>

    <section class="wa-history-card">
      <div v-if="!activeChatId" class="wa-context-muted">
        Select a chat.
      </div>

      <template v-else>
        <button
          type="button"
          class="wa-actions-toggle"
          :class="{ 'is-open': historyOpen }"
          :aria-expanded="historyOpen"
          aria-label="Toggle conversation history"
          @click="toggleHistory"
        >
          <span>History</span>
          <span v-if="isHistoryRefreshing" class="wa-context-dot"></span>
          <span class="fas fa-chevron-down"></span>
        </button>

        <div v-if="historyOpen" class="wa-context-section-body">
          <div v-if="isHistoryRefreshing" class="wa-context-refresh" aria-live="polite">
            Updating history...
          </div>

          <div v-if="isGroupChat" class="wa-context-muted">
            Not available for group chats.
          </div>

          <div v-else-if="isHistoryRefreshing && !history.length" class="wa-history-placeholder" aria-hidden="true">
            <div></div>
            <div></div>
            <div></div>
          </div>

          <div v-else-if="!history.length" class="wa-context-muted">
            No tracked conversations.
          </div>

          <div v-else class="wa-history-list">
            <ConversationPreview
              v-for="item in history"
              :key="item.id || item.firstMessageMessageId || item.startedAt"
              :conversation="item"
            >
              <button
                type="button"
                class="wa-history-item"
                :class="{ 'is-disabled': !item.firstMessageMessageId }"
                :aria-disabled="!item.firstMessageMessageId"
                :aria-label="`Open conversation from ${formatDate(item.startedAt || item.createdAt) || 'unknown date'}`"
                @click="emit('jump-conversation', item.firstMessageMessageId)"
              >
                <span class="wa-history-range">{{ formatRange(item) }}</span>
                <span class="wa-history-date">{{ formatDate(item.startedAt || item.createdAt) }}</span>
                <strong>{{ getConversationName(item) }}</strong>
                <span>{{ item.status || 'closed' }} · {{ item.messageCount || 0 }} msg</span>
              </button>
            </ConversationPreview>
          </div>
        </div>
      </template>
    </section>
  </aside>
</template>
