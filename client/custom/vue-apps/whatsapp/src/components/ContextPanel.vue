<script setup>
import { computed } from 'vue';

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
});

const emit = defineEmits(['open-record', 'create-contact', 'jump-conversation']);

const isGroupChat = computed(() => String(props.activeChatId || '').endsWith('@g.us'));

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

    if (isLidChatId(participantWaId) && looksLikePhoneLabel(label) && digitsMatchChatId(label, participantWaId)) {
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

    if (isLidChatId(participantWaId) && looksLikePhoneLabel(label) && digitsMatchChatId(label, participantWaId)) {
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

function isGenericConversationName(value) {
  return ['whatsapp contact', 'whatsapp'].includes(String(value || '').trim().toLowerCase());
}
</script>

<template>
  <aside class="wa-context-panel">
    <section class="wa-context-card">
      <p class="wa-vue-kicker">Details</p>

      <div v-if="!activeChatId" class="wa-context-muted">
        Select a chat.
      </div>

      <div v-else-if="loadingContext" class="wa-context-muted">
        Loading...
      </div>

      <template v-else>
        <h2>{{ title }}</h2>

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

          <div v-if="context && context.isLinked" class="wa-context-linked">
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

          <div v-else class="wa-context-actions">
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
      </template>
    </section>

    <section class="wa-history-card">
      <p class="wa-vue-kicker">History</p>

      <div v-if="!activeChatId" class="wa-context-muted">
        Select a chat.
      </div>

      <div v-else-if="loadingHistory" class="wa-context-muted">
        Loading...
      </div>

      <div v-else-if="isGroupChat" class="wa-context-muted">
        Not available for group chats.
      </div>

      <div v-else-if="!history.length" class="wa-context-muted">
        No tracked conversations.
      </div>

      <div v-else class="wa-history-list">
        <button
          v-for="item in history"
          :key="item.id || item.firstMessageMessageId || item.startedAt"
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
      </div>
    </section>
  </aside>
</template>
