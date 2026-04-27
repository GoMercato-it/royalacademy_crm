<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChatList from './components/ChatList.vue';
import ChatThread from './components/ChatThread.vue';
import MessageComposer from './components/MessageComposer.vue';
import StatusIndicator from './components/StatusIndicator.vue';
import { useEspoTheme } from './composables/useEspoTheme';
import { useWhatsAppStore } from './stores/whatsapp';
import { useWebSocketStore } from './stores/websocket';

const ContextPanel = defineAsyncComponent(() => import('./components/ContextPanel.vue'));

const props = defineProps({
  espoContext: {
    type: Object,
    default: () => ({}),
  },
});

const whatsappStore = useWhatsAppStore();
const websocketStore = useWebSocketStore();
const { isDarkTheme, themeStyle, updateTheme } = useEspoTheme();
const shellRef = ref(null);
const toastMessage = ref('');
const targetMessageId = ref('');
let resizeObserver = null;
let toastTimer = null;

const currentError = computed(() => whatsappStore.lastError || websocketStore.lastError || null);
const showOfflineBanner = computed(() => whatsappStore.queuedCount > 0 || (whatsappStore.status !== 'unknown' && !whatsappStore.isConnected));
const offlineBannerText = computed(() => {
  const count = whatsappStore.queuedCount;

  if (!whatsappStore.isConnected && count) {
    return `Offline. ${count} message${count === 1 ? '' : 's'} queued.`;
  }

  if (!whatsappStore.isConnected) {
    return 'Offline. Messages will be queued.';
  }

  return `${count} queued message${count === 1 ? '' : 's'} sending.`;
});

watch(currentError, error => {
  if (error) {
    showToast(error.message || 'Unable to load WhatsApp data.');
  }
});

onMounted(() => {
  document.body.classList.add('wa-whatsapp-fixed');
  updateViewportHeight();
  window.addEventListener('resize', updateViewportHeight);

  if (window.ResizeObserver && shellRef.value) {
    resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(document.body);
  }

  updateTheme();

  whatsappStore.configure(props.espoContext);
  bootstrap().catch(() => {});
});

onBeforeUnmount(() => {
  document.body.classList.remove('wa-whatsapp-fixed');
  window.removeEventListener('resize', updateViewportHeight);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  clearToastTimer();
  websocketStore.disconnect();
});

async function bootstrap() {
  await whatsappStore.loadStatus().catch(() => null);
  await websocketStore.connect().catch(() => null);

  const chats = await whatsappStore.loadChats({ forceRefresh: true }).catch(() => []);
  const initialChat = resolveInitialChatTarget(chats);

  if (initialChat) {
    await openChat(initialChat);
    return;
  }

  if (!whatsappStore.activeChatId && chats.length) {
    await openChat(chats[0]);
  }
}

function updateViewportHeight() {
  const shell = shellRef.value;

  if (!shell) {
    return;
  }

  const top = shell.getBoundingClientRect().top;
  const bottomGap = 8;
  const height = Math.max(320, window.innerHeight - top - bottomGap);

  shell.style.setProperty('--wa-vue-height', `${height}px`);
}

function openChat(chat) {
  targetMessageId.value = '';
  return whatsappStore.openChat(chat)
    .then(() => Promise.allSettled([
      whatsappStore.loadChatContext(),
      whatsappStore.loadConversationHistory(),
    ]))
    .catch(() => null);
}

function hasInitialChatTarget() {
  return !!(
    props.espoContext &&
    (props.espoContext.initialChatId || props.espoContext.initialPhoneNumber)
  );
}

function resolveInitialChatTarget(chats) {
  const chatId = String((props.espoContext && props.espoContext.initialChatId) || '').trim();
  const phoneNumber = String((props.espoContext && props.espoContext.initialPhoneNumber) || '').trim();

  if (chatId) {
    return whatsappStore.findChatById(chatId) || chatId;
  }

  if (!phoneNumber) {
    return null;
  }

  return whatsappStore.findChatByPhone(phoneNumber) ||
    findChatByPhoneInList(chats, phoneNumber) ||
    whatsappStore.createChatFromPhone(phoneNumber);
}

function findChatByPhoneInList(chats, phoneNumber) {
  if (!Array.isArray(chats)) {
    return null;
  }

  const digits = String(phoneNumber || '').replace(/[^0-9]/g, '');

  if (!digits) {
    return null;
  }

  return chats.find(chat => {
    const contact = chat && typeof chat === 'object' && chat.contact && typeof chat.contact === 'object' ?
      chat.contact :
      {};
    const candidates = [
      chat && typeof chat === 'object' ? chat.id : chat,
      chat && typeof chat === 'object' ? chat._serialized : '',
      chat && typeof chat === 'object' ? chat.chatId : '',
      chat && typeof chat === 'object' ? chat.waPhoneNumber : '',
      chat && typeof chat === 'object' ? chat.phoneNumber : '',
      chat && typeof chat === 'object' ? chat.number : '',
      contact.waPhoneNumber,
      contact.phoneNumber,
      contact.number,
    ];

    return candidates.some(value => String(value || '').replace(/@.+$/u, '').replace(/[^0-9]/g, '') === digits);
  }) || null;
}

function refreshActiveChat() {
  whatsappStore.refreshActiveMessages().catch(() => {});
}

function refreshAll() {
  whatsappStore.loadStatus().catch(() => {});
  whatsappStore.loadChats({ forceRefresh: true }).catch(() => {});
  refreshActiveChat();
}

function sendMessage(body) {
  whatsappStore.sendMessage(body).catch(() => {});
}

function retryMessage(message) {
  whatsappStore.retryMessage(message).catch(() => {});
}

function flushQueuedMessages() {
  whatsappStore.flushQueuedMessages().catch(() => {});
}

function loadMoreMessages() {
  whatsappStore.loadMoreMessages().catch(() => {});
}

function createContact() {
  whatsappStore.createContactFromActiveChat().catch(() => {});
}

function openRecord({ entityType, entityId }) {
  const router = props.espoContext && props.espoContext.router;

  if (router && entityType && entityId) {
    router.navigate(`#${entityType}/view/${entityId}`, { trigger: true });
  }
}

async function jumpConversation(messageId) {
  if (!messageId) {
    return;
  }

  targetMessageId.value = String(messageId);

  for (let attempt = 0; attempt < 8; attempt++) {
    if (hasActiveMessage(messageId)) {
      await nextTick();
      targetMessageId.value = String(messageId);
      return;
    }

    const beforeCount = whatsappStore.activeMessages.length;
    await whatsappStore.loadMoreMessages().catch(() => []);

    if (whatsappStore.activeMessages.length <= beforeCount) {
      break;
    }
  }
}

function hasActiveMessage(messageId) {
  const id = String(messageId || '');

  return whatsappStore.activeMessages.some(message => String(message.messageId || message.id || '') === id);
}

function showToast(message) {
  toastMessage.value = message;
  clearToastTimer();

  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
    toastTimer = null;
  }, 5200);
}

function dismissToast() {
  toastMessage.value = '';
  clearToastTimer();
}

function clearToastTimer() {
  if (!toastTimer) {
    return;
  }

  window.clearTimeout(toastTimer);
  toastTimer = null;
}

</script>

<template>
  <section
    ref="shellRef"
    class="wa-vue-shell"
    :class="{ 'wa-is-dark': isDarkTheme }"
    :style="themeStyle"
    tabindex="-1"
    @keydown.esc="dismissToast"
  >
    <div class="wa-vue-topbar">
      <header class="wa-vue-header">
        <div>
          <h1>WhatsApp</h1>
        </div>
        <div class="wa-vue-header-actions">
          <button type="button" class="wa-icon-button" title="Refresh" aria-label="Refresh WhatsApp data" @click="refreshAll">
            <span class="fas fa-rotate-right"></span>
          </button>
          <button type="button" class="wa-icon-button" title="Settings" aria-label="Open WhatsApp integration settings" @click="props.espoContext.router && props.espoContext.router.dispatch('Admin', 'integrations', { name: 'WhatsApp' })">
            <span class="fas fa-sliders"></span>
          </button>
          <StatusIndicator
            :status="whatsappStore.status"
            :is-connected="whatsappStore.isConnected"
            :loading="whatsappStore.loadingStatus"
            @retry="whatsappStore.loadStatus().catch(() => {})"
          />
        </div>
      </header>

      <div v-if="showOfflineBanner" class="wa-offline-banner" role="status" aria-live="polite">
        <span class="fas fa-cloud-arrow-up"></span>
        <span>{{ offlineBannerText }}</span>
        <button v-if="whatsappStore.isConnected && whatsappStore.queuedCount" type="button" class="btn btn-default btn-sm" @click="flushQueuedMessages">
          Retry
        </button>
      </div>
    </div>

    <div class="wa-vue-workspace">
      <ChatList
        :chats="whatsappStore.chats"
        :active-chat-id="whatsappStore.activeChatId"
        :loading="whatsappStore.loadingChats"
        @open-chat="openChat"
        @refresh="whatsappStore.loadChats({ forceRefresh: true }).catch(() => {})"
      />

      <div class="wa-thread-stack">
        <ChatThread
          :active-chat-id="whatsappStore.activeChatId"
          :active-chat-name="whatsappStore.activeChatName"
          :messages="whatsappStore.activeMessages"
          :loading="whatsappStore.loadingMessages"
          :target-message-id="targetMessageId"
          @refresh="refreshActiveChat"
          @load-more="loadMoreMessages"
          @retry-message="retryMessage"
        />
        <MessageComposer
          :disabled="!whatsappStore.activeChatId"
          :sending="whatsappStore.sendingMessage"
          @send="sendMessage"
        />
      </div>

      <ContextPanel
        :active-chat-id="whatsappStore.activeChatId"
        :active-chat-name="whatsappStore.activeChatName"
        :active-chat-phone="whatsappStore.activeChatPhone"
        :context="whatsappStore.activeChatContext"
        :history="whatsappStore.activeConversationHistory"
        :loading-context="whatsappStore.loadingContext"
        :loading-history="whatsappStore.loadingHistory"
        @create-contact="createContact"
        @open-record="openRecord"
        @jump-conversation="jumpConversation"
      />
    </div>

    <Transition name="wa-toast">
      <div v-if="toastMessage" class="wa-toast" role="alert" aria-live="polite">
        <span class="fas fa-triangle-exclamation"></span>
        <span>{{ toastMessage }}</span>
        <button type="button" class="wa-toast-close" aria-label="Dismiss notification" @click="dismissToast">
          <span class="fas fa-xmark"></span>
        </button>
      </div>
    </Transition>
  </section>
</template>
