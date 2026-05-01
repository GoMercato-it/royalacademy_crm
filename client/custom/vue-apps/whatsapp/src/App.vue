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
const qrContainerRef = ref(null);
const profileFileRef = ref(null);
const toastMessage = ref('');
const targetMessageId = ref('');
const featureActionBusy = ref(false);
let resizeObserver = null;
let toastTimer = null;
let qrScriptPromise = null;
let renderedQrValue = '';

const currentError = computed(() => whatsappStore.lastError || websocketStore.lastError || null);
const showOfflineBanner = computed(() => whatsappStore.queuedCount > 0 || (whatsappStore.status !== 'unknown' && !whatsappStore.isConnected));
const showQrPanel = computed(() => !whatsappStore.isConnected && (whatsappStore.loadingQr || !!whatsappStore.qrCode));
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

watch([() => whatsappStore.qrCode, showQrPanel], ([qrCode, visible]) => {
  if (visible && qrCode) {
    renderQrCode(qrCode);
    return;
  }

  clearRenderedQrCode();
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

  const [chats, groups] = await Promise.all([
    whatsappStore.loadChats({ forceRefresh: true }).catch(() => []),
    whatsappStore.loadGroups({ forceRefresh: true }).catch(() => []),
  ]);
  const initialList = whatsappStore.chatList.length ? whatsappStore.chatList : [...chats, ...groups];
  const initialChat = resolveInitialChatTarget(initialList);

  if (initialChat) {
    await openChat(initialChat);
    return;
  }

  if (!whatsappStore.activeChatId && initialList.length) {
    await openChat(initialList[0]);
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

  const messagesPromise = whatsappStore.openChat(chat);
  const markReadPromise = Promise.resolve()
    .then(() => whatsappStore.runChatOperation('mark-read').catch(() => null));

  return Promise.allSettled([messagesPromise, markReadPromise])
    .catch(() => null);
}

function loadContextDetails() {
  return whatsappStore.loadChatContext().catch(() => null);
}

function loadConversationHistory() {
  return whatsappStore.loadConversationHistory().catch(() => []);
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

function sendMessage(body) {
  whatsappStore.sendMessage(body).catch(() => {});
}

function sendMedia(payload) {
  runFeatureAction(
    () => whatsappStore.sendMedia(payload),
    'Media message sent.'
  );
}

function sendLocation(payload) {
  runFeatureAction(
    () => whatsappStore.sendLocation(payload),
    'Location sent.'
  );
}

function sendContactCard(payload) {
  runFeatureAction(
    () => whatsappStore.sendContactCard(payload.contactId),
    'Contact card sent.'
  );
}

function createPoll(payload) {
  runFeatureAction(
    () => whatsappStore.createPoll(payload.question, payload.options),
    'Poll sent.'
  );
}

async function handleLogout() {
  if (!window.confirm('Are you sure you want to logout?')) {
    return;
  }

  try {
    await whatsappStore.logout();
    updateQrRoute();
    await nextTick();
    renderQrCode(whatsappStore.qrCode);
  } catch (error) {
    showToast(error.message || 'Logout failed. Please try again.');
  }
}

function startLogin() {
  whatsappStore.startLogin()
    .then(() => nextTick())
    .then(() => renderQrCode(whatsappStore.qrCode))
    .catch(error => {
      showToast(error.message || 'Unable to generate QR code.');
    });
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

function handleMessageAction({ action, message, reaction, editedText, everyone }) {
  if (action === 'react') {
    const emoji = reaction !== undefined ? reaction : '';

    runFeatureAction(
      () => whatsappStore.reactToMessage(message, emoji),
      emoji ? 'Reaction sent.' : 'Reaction removed.'
    );
    return;
  }

  if (action === 'edit') {
    if (!editedText || !editedText.trim()) {
      return;
    }

    runFeatureAction(
      () => whatsappStore.editMessage(message, editedText.trim()),
      'Message edited.'
    );
    return;
  }

  if (action === 'delete') {
    runFeatureAction(
      () => whatsappStore.deleteMessage(message, { everyone: !!everyone }),
      'Message deleted.'
    );
    return;
  }

  if (action === 'forward') {
    const destinationChatId = window.prompt('Forward to chat ID');

    if (!destinationChatId || !destinationChatId.trim()) {
      return;
    }

    runFeatureAction(
      () => whatsappStore.forwardMessage(message, destinationChatId.trim()),
      'Message forwarded.'
    );
    return;
  }

  if (action === 'star' || action === 'unstar') {
    runFeatureAction(
      () => whatsappStore.setMessageStarred(message, action === 'star'),
      action === 'star' ? 'Message starred.' : 'Message unstarred.'
    );
    return;
  }

  if (action === 'reactions') {
    runFeatureAction(
      () => whatsappStore.getMessageReactions(message),
      response => summarizeCount(response, 'reaction')
    );
    return;
  }

  if (action === 'download-media') {
    runFeatureAction(
      () => whatsappStore.downloadMedia(message),
      response => openMediaResult(response)
    );
    return;
  }

  if (action === 'poll-vote') {
    const selected = window.prompt('Poll option text');

    if (!selected || !selected.trim()) {
      return;
    }

    runFeatureAction(
      () => whatsappStore.voteInPoll(
        message,
        selected
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      ),
      'Poll vote sent.'
    );
    return;
  }

  if (action === 'poll-votes') {
    runFeatureAction(
      () => whatsappStore.getPollVotes(message),
      response => summarizeCount(response, 'poll vote')
    );
  }
}

function handleChatOperation({ action }) {
  if (action === 'clear' && !window.confirm('Clear all messages in this chat?')) {
    return;
  }

  const options = {};

  if (action === 'mute') {
    const minutes = window.prompt('Mute duration in minutes. Leave empty for indefinite mute.', '60');

    if (minutes === null) {
      return;
    }

    const duration = Number(minutes);

    if (Number.isFinite(duration) && duration > 0) {
      options.duration = Math.floor(duration * 60);
    }
  }

  runFeatureAction(
    () => whatsappStore.runChatOperation(action, options),
    formatActionLabel(action, 'Chat')
  );
}

function handleContactOperation({ action, contactId, phone }) {
  if (action === 'block' && !window.confirm('Block this contact?')) {
    return;
  }

  if (action === 'unblock' && !window.confirm('Unblock this contact?')) {
    return;
  }

  if (action === 'status') {
    runFeatureAction(
      () => whatsappStore.getContactStatus(contactId),
      response => extractStatusText(response) || 'Contact status loaded.'
    );
    return;
  }

  if (action === 'profile-picture') {
    runFeatureAction(
      () => whatsappStore.getContactProfilePicture(contactId),
      response => openProfilePicture(response)
    );
    return;
  }

  if (action === 'check-number') {
    runFeatureAction(
      () => whatsappStore.checkNumberOnWhatsApp(phone || contactId),
      response => response && (response.isRegisteredUser || response.registered || response.exists)
        ? 'Number is registered on WhatsApp.'
        : 'Number check completed.'
    );
    return;
  }

  if (action === 'blocked-contacts') {
    runFeatureAction(
      () => whatsappStore.getBlockedContacts(),
      response => summarizeCount(response, 'blocked contact')
    );
    return;
  }

  if (action === 'block') {
    runFeatureAction(
      () => whatsappStore.blockUser(contactId),
      'Contact blocked.'
    );
    return;
  }

  if (action === 'unblock') {
    runFeatureAction(
      () => whatsappStore.unblockUser(contactId),
      'Contact unblocked.'
    );
  }
}

function setAccountStatus() {
  const value = window.prompt('Set WhatsApp status');

  if (!value || !value.trim()) {
    return;
  }

  runFeatureAction(
    () => whatsappStore.setAccountStatus(value.trim()),
    'Status updated.'
  );
}

function chooseProfilePicture() {
  if (profileFileRef.value) {
    profileFileRef.value.value = '';
    profileFileRef.value.click();
  }
}

async function updateProfilePicture(event) {
  const file = event.target && event.target.files ? event.target.files[0] : null;

  if (!file) {
    return;
  }

  runFeatureAction(async () => {
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = String(dataUrl).split(',')[1] || '';

    return whatsappStore.updateProfilePicture(file.type, base64);
  }, 'Profile picture updated.');
}

async function runFeatureAction(callback, successMessage) {
  featureActionBusy.value = true;

  try {
    const response = await callback();
    const message = typeof successMessage === 'function' ? successMessage(response) : successMessage;

    if (message) {
      showToast(message);
    }

    return response;
  } catch (error) {
    showToast(error.message || 'Action failed.');
    return null;
  } finally {
    featureActionBusy.value = false;
  }
}

function getMessageText(message) {
  return String((message && (message.body || message.bodyPreview || message.caption)) || '');
}

function summarizeCount(response, label) {
  const list = extractList(response);
  const count = list ? list.length : Number(response && (response.count || response.total || 0));
  const value = Number.isFinite(count) ? count : 0;

  return `${value} ${label}${value === 1 ? '' : 's'} loaded.`;
}

function extractList(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && Array.isArray(response.list)) {
    return response.list;
  }

  if (response && Array.isArray(response.data)) {
    return response.data;
  }

  if (response && response.data && Array.isArray(response.data.list)) {
    return response.data.list;
  }

  return null;
}

function extractStatusText(response) {
  const data = response && response.data && typeof response.data === 'object' ? response.data : response || {};

  return data.about || data.status || data.body || '';
}

function openProfilePicture(response) {
  const url = extractUrl(response);

  if (url) {
    window.open(url, '_blank', 'noopener');
    return 'Profile picture opened.';
  }

  return 'Profile picture URL not available.';
}

function openMediaResult(response) {
  const url = extractUrl(response);

  if (url) {
    window.open(url, '_blank', 'noopener');
    return 'Media opened.';
  }

  const data = response && response.data && typeof response.data === 'object' ? response.data : response || {};
  const base64 = data.data || data.mediaData || data.body;
  const mimetype = data.mimetype || data.mimeType;

  if (base64 && mimetype) {
    window.open(`data:${mimetype};base64,${base64}`, '_blank', 'noopener');
    return 'Media opened.';
  }

  return 'Media downloaded.';
}

function extractUrl(response) {
  const data = response && response.data && typeof response.data === 'object' ? response.data : response || {};

  return data.url || data.profilePicUrl || data.profilePictureUrl || data.mediaUrl || '';
}

function formatActionLabel(action, prefix) {
  const label = String(action || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return `${prefix} ${label.toLowerCase()} done.`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result || '');
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
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

function updateQrRoute() {
  const router = props.espoContext && props.espoContext.router;

  if (router && typeof router.navigate === 'function') {
    router.navigate('#WhatsApp?screen=qr', { trigger: false });
    return;
  }

  window.location.hash = '#WhatsApp?screen=qr';
}

function renderQrCode(qrCode) {
  const value = String(qrCode || '').trim();

  if (!value) {
    clearRenderedQrCode();
    return;
  }

  nextTick(() => {
    const container = qrContainerRef.value;

    if (!container) {
      return;
    }

    if (renderedQrValue === value && container.dataset.rendered === 'true') {
      return;
    }

    ensureQrLib()
      .then(QRCodeLib => {
        if (!QRCodeLib || !qrContainerRef.value) {
          return;
        }

        qrContainerRef.value.innerHTML = '';
        qrContainerRef.value.dataset.rendered = 'true';
        renderedQrValue = value;

        new QRCodeLib(qrContainerRef.value, {
          text: value,
          width: 184,
          height: 184,
        });
      })
      .catch(error => {
        showToast(error.message || 'Unable to render QR code.');
      });
  });
}

function clearRenderedQrCode() {
  renderedQrValue = '';

  if (qrContainerRef.value) {
    qrContainerRef.value.innerHTML = '';
    delete qrContainerRef.value.dataset.rendered;
  }
}

function ensureQrLib() {
  if (window.QRCode) {
    return Promise.resolve(window.QRCode);
  }

  if (qrScriptPromise) {
    return qrScriptPromise;
  }

  qrScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wa-qr-lib="true"]');

    if (existing) {
      existing.addEventListener('load', () => resolve(window.QRCode), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load QR renderer.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'client/lib/qrcode.js';
    script.async = true;
    script.dataset.waQrLib = 'true';
    script.onload = () => resolve(window.QRCode);
    script.onerror = () => reject(new Error('Failed to load QR renderer.'));
    document.head.appendChild(script);
  }).finally(() => {
    qrScriptPromise = null;
  });

  return qrScriptPromise;
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
          <button type="button" class="wa-icon-button" title="Settings" aria-label="Open WhatsApp integration settings" @click="props.espoContext.router && props.espoContext.router.dispatch('Admin', 'integrations', { name: 'WhatsApp' })">
            <span class="fas fa-sliders"></span>
          </button>
          <button
            v-if="whatsappStore.isConnected"
            type="button"
            class="wa-icon-button"
            title="Set WhatsApp status"
            aria-label="Set WhatsApp status"
            :disabled="featureActionBusy"
            @click="setAccountStatus"
          >
            <span class="fas fa-pen-to-square"></span>
          </button>
          <button
            v-if="whatsappStore.isConnected"
            type="button"
            class="wa-icon-button"
            title="Update profile picture"
            aria-label="Update profile picture"
            :disabled="featureActionBusy"
            @click="chooseProfilePicture"
          >
            <span class="fas fa-image"></span>
          </button>
          <input
            ref="profileFileRef"
            type="file"
            class="wa-hidden-file-input"
            accept="image/*"
            tabindex="-1"
            aria-hidden="true"
            @change="updateProfilePicture"
          />
          <button
            v-if="whatsappStore.isConnected"
            type="button"
            class="wa-icon-button"
            title="Logout"
            aria-label="Logout from WhatsApp"
            @click="handleLogout"
          >
            <span class="fas fa-right-from-bracket"></span>
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

    <div v-if="showQrPanel" class="wa-login-panel">
      <section class="wa-login-card">
        <p class="wa-vue-kicker">Connect WhatsApp</p>
        <h2>Scan QR code</h2>
        <p>Generate a QR code and scan it with your phone to connect this WhatsApp session.</p>

        <div class="wa-qr-box">
          <div v-if="whatsappStore.loadingQr" class="wa-context-muted">
            Loading...
          </div>
          <div v-show="!whatsappStore.loadingQr" ref="qrContainerRef" class="wa-qr-generated"></div>
        </div>

        <button type="button" class="btn btn-primary" :disabled="whatsappStore.loadingQr" @click="startLogin">
          Generate QR Code
        </button>
      </section>
    </div>

    <div v-else class="wa-vue-workspace">
      <ChatList
        :chats="whatsappStore.chatList"
        :active-chat-id="whatsappStore.activeChatId"
        :loading="whatsappStore.loadingChats || whatsappStore.loadingGroups"
        @open-chat="openChat"
      />

      <div class="wa-thread-stack">
        <ChatThread
          :active-chat-id="whatsappStore.activeChatId"
          :active-chat-name="whatsappStore.activeChatName"
          :messages="whatsappStore.activeMessages"
          :loading="whatsappStore.loadingMessages"
          :target-message-id="targetMessageId"
          @load-more="loadMoreMessages"
          @retry-message="retryMessage"
          @message-action="handleMessageAction"
        />
        <MessageComposer
          :disabled="!whatsappStore.activeChatId"
          :sending="whatsappStore.sendingMessage"
          @send="sendMessage"
          @send-media="sendMedia"
          @send-location="sendLocation"
          @send-contact-card="sendContactCard"
          @create-poll="createPoll"
        />
      </div>

      <ContextPanel
        :active-chat-id="whatsappStore.activeChatId"
        :active-chat-name="whatsappStore.activeChatName"
        :active-chat-phone="whatsappStore.activeChatPhone"
        :active-chat="whatsappStore.activeChat"
        :context="whatsappStore.activeChatContext"
        :history="whatsappStore.activeConversationHistory"
        :loading-context="whatsappStore.loadingContext"
        :loading-history="whatsappStore.loadingHistory"
        :action-busy="featureActionBusy"
        @create-contact="createContact"
        @open-record="openRecord"
        @jump-conversation="jumpConversation"
        @chat-operation="handleChatOperation"
        @contact-operation="handleContactOperation"
        @load-context="loadContextDetails"
        @load-history="loadConversationHistory"
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
