<script setup>
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import { computed, ref, watch } from 'vue';
import ChatAvatar from './ChatAvatar.vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

const CHAT_RENDER_CHUNK = 50;

const props = defineProps({
  chats: {
    type: Array,
    default: () => [],
  },
  activeChatId: {
    type: String,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['open-chat', 'refresh']);

const search = ref('');
const debouncedSearch = ref('');
const visibleLimit = ref(CHAT_RENDER_CHUNK);
let debounceTimer = null;

watch(search, value => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debouncedSearch.value = String(value || '').trim().toLowerCase();
    visibleLimit.value = CHAT_RENDER_CHUNK;
  }, 300);
});

const filteredChats = computed(() => {
  const query = debouncedSearch.value;

  return props.chats
    .slice()
    .sort((a, b) => getTimestamp(b) - getTimestamp(a))
    .filter(chat => {
      if (!query) {
        return true;
      }

      return [
        getChatName(chat),
        getChatPreview(chat),
        getChatPhone(chat),
      ].join(' ').toLowerCase().includes(query);
    })
    .map((chat, index) => {
      const base = chat && typeof chat === 'object' ? chat : { id: getChatId(chat) };

      return {
        ...base,
        _waKey: getChatId(chat) || `chat-${index}`,
      };
    });
});

const visibleChats = computed(() => filteredChats.value.slice(0, visibleLimit.value));

function handleScrollerUpdate(startIndex, endIndex) {
  if (endIndex >= visibleChats.value.length - 10) {
    visibleLimit.value = Math.min(visibleLimit.value + CHAT_RENDER_CHUNK, filteredChats.value.length);
  }
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

function getChatName(chat) {
  if (!chat || typeof chat === 'string') {
    return getChatId(chat);
  }

  const contact = chat.contact && typeof chat.contact === 'object' ? chat.contact : {};
  const chatId = getChatId(chat);
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

  return getChatPhone(chat) || (isLidChatId(chatId) ? 'WhatsApp contact' : chatId);
}

function getChatPhone(chat) {
  const id = getChatId(chat);

  if (!isPhoneBasedChatId(id)) {
    return '';
  }

  return id.replace(/@.+$/u, '');
}

function getChatPreview(chat) {
  if (!chat || typeof chat === 'string') {
    return '';
  }

  const lastMessage = normalizeMessage(chat.lastMessage || chat.lastMessageData);

  return chat.lastMessageBody ||
    chat.bodyPreview ||
    lastMessage.bodyPreview ||
    lastMessage.body ||
    lastMessage.caption ||
    getMediaPreview(lastMessage.type, lastMessage.hasMedia) ||
    '';
}

function getTimestamp(chat) {
  if (!chat || typeof chat === 'string') {
    return 0;
  }

  const lastMessage = normalizeMessage(chat.lastMessage || chat.lastMessageData);
  const raw = chat.timestamp || chat.t || chat.lastMessageTimestamp || lastMessage.timestamp || 0;
  const numeric = Number(raw);

  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeMessage(message) {
  if (!message) {
    return {};
  }

  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message);

      return parsed && typeof parsed === 'object' ? parsed : { body: message };
    } catch (error) {
      return { body: message };
    }
  }

  return typeof message === 'object' ? message : {};
}

function getMediaPreview(type, hasMedia) {
  if (type && type !== 'chat') {
    return `[${type}]`;
  }

  return hasMedia ? '[Media]' : '';
}

function getUnreadCount(chat) {
  if (!chat || typeof chat === 'string') {
    return 0;
  }

  const count = Number(chat.unreadCount || chat.unread || 0);

  return Number.isFinite(count) && count > 0 ? count : 0;
}

function formatTime(chat) {
  const timestamp = getTimestamp(chat);

  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now - date;

  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString();
}

function isPhoneBasedChatId(chatId) {
  const value = String(chatId || '').toLowerCase().trim();

  return value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net');
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
</script>

<template>
  <section class="wa-chat-list">
    <header class="wa-chat-list__header">
      <div>
        <p class="wa-vue-kicker">Chats</p>
        <h2>Inbox</h2>
      </div>
      <button type="button" class="wa-icon-button" title="Refresh chats" aria-label="Refresh chats" @click="emit('refresh')">
        <span class="fas fa-rotate-right"></span>
      </button>
    </header>

    <label class="wa-chat-search">
      <span class="fas fa-search"></span>
      <input v-model="search" type="search" placeholder="Search chats" aria-label="Search chats" />
    </label>

    <div v-if="loading && !visibleChats.length" class="wa-chat-skeleton-list">
      <div v-for="item in 8" :key="item" class="wa-chat-skeleton"></div>
    </div>

    <div v-else-if="!visibleChats.length" class="wa-chat-empty">
      <span class="fas fa-comments"></span>
      <p>No chats loaded yet.</p>
    </div>

    <DynamicScroller
      v-else
      class="wa-chat-scroller"
      :items="visibleChats"
      :min-item-size="72"
      key-field="_waKey"
      @update="handleScrollerUpdate"
    >
      <template #default="{ item, active }">
        <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[getChatPreview(item)]">
          <button
            type="button"
            class="wa-chat-item"
            :class="{ 'is-active': getChatId(item) === activeChatId }"
            :aria-label="`Open chat ${getChatName(item)}`"
            :aria-current="getChatId(item) === activeChatId ? 'true' : undefined"
            @click="emit('open-chat', item)"
          >
            <ChatAvatar :chat-id="getChatId(item)" :name="getChatName(item)" />
            <span class="wa-chat-main">
              <span class="wa-chat-title-row">
                <strong>{{ getChatName(item) }}</strong>
                <time>{{ formatTime(item) }}</time>
              </span>
              <span class="wa-chat-preview">{{ getChatPreview(item) || getChatPhone(item) }}</span>
            </span>
            <span v-if="getUnreadCount(item)" class="wa-chat-badge">{{ getUnreadCount(item) }}</span>
          </button>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </section>
</template>
