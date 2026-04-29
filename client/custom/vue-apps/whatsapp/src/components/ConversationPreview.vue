<script setup>
import { computed, ref } from 'vue';
import { useWhatsAppStore } from '../stores/whatsapp';

const TOOLTIP_WIDTH = 340;
const VIEWPORT_GAP = 8;

const props = defineProps({
  conversation: {
    type: Object,
    required: true,
  },
});

const whatsappStore = useWhatsAppStore();
const wrapperRef = ref(null);
const showPreview = ref(false);
const loading = ref(false);
const messages = ref([]);
const tooltipStyle = ref({
  top: '0px',
  left: '0px',
});

const conversationId = computed(() => String(props.conversation?.id || '').trim());

async function loadPreview(event) {
  positionTooltip(event);
  seedMessagesFromConversation();
  showPreview.value = true;

  if (!conversationId.value || loading.value) {
    return;
  }

  loading.value = true;

  try {
    const list = await whatsappStore.loadConversationPreview(conversationId.value);
    messages.value = Array.isArray(list) ? list : [];
  } catch (error) {
    if (!messages.value.length) {
      messages.value = [];
    }
  } finally {
    loading.value = false;
  }
}

function hidePreview() {
  showPreview.value = false;
}

function seedMessagesFromConversation() {
  if (messages.value.length) {
    return;
  }

  const previewMessages = Array.isArray(props.conversation?.previewMessages) ?
    props.conversation.previewMessages :
    [];

  messages.value = previewMessages.map(normalizePreviewMessage).filter(message => message.body);
}

function positionTooltip(event) {
  const element = event?.currentTarget || wrapperRef.value;

  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return;
  }

  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || TOOLTIP_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240;
  const placeRight = rect.right + VIEWPORT_GAP + TOOLTIP_WIDTH <= viewportWidth;
  const left = placeRight ?
    rect.right + VIEWPORT_GAP :
    Math.max(VIEWPORT_GAP, rect.left - TOOLTIP_WIDTH - VIEWPORT_GAP);
  const top = Math.min(
    Math.max(VIEWPORT_GAP, rect.top),
    Math.max(VIEWPORT_GAP, viewportHeight - 220)
  );

  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.min(TOOLTIP_WIDTH, viewportWidth - (VIEWPORT_GAP * 2))}px`,
  };
}

function normalizePreviewMessage(message) {
  if (!message || typeof message !== 'object') {
    return {
      id: '',
      body: '',
      author: '',
      fromMe: false,
      timestamp: null,
    };
  }

  return {
    id: String(message.id || message.messageId || ''),
    body: String(message.body || message.bodyPreview || ''),
    author: String(message.author || message.from || ''),
    fromMe: !!message.fromMe,
    timestamp: message.timestamp || null,
  };
}

function getAuthor(message) {
  if (message.fromMe) {
    return 'You';
  }

  return message.author || 'Contact';
}

function truncate(text, length = 60) {
  const value = String(text || '').trim();

  return value.length > length ? `${value.slice(0, length)}...` : value;
}
</script>

<template>
  <div
    ref="wrapperRef"
    class="wa-conversation-preview"
    @mouseenter="loadPreview"
    @mouseleave="hidePreview"
    @focusin="loadPreview"
    @focusout="hidePreview"
  >
    <slot />

    <Teleport to="body">
      <div
        v-if="showPreview"
        class="wa-preview-tooltip"
        :style="tooltipStyle"
        role="tooltip"
      >
        <div v-if="loading && !messages.length" class="wa-preview-muted">
          Loading...
        </div>

        <template v-else-if="messages.length">
          <div
            v-for="message in messages.slice(0, 5)"
            :key="message.id || `${message.timestamp}-${message.body}`"
            class="wa-preview-message"
          >
            <span class="wa-preview-author">{{ getAuthor(message) }}</span>
            <span class="wa-preview-text">{{ truncate(message.body) }}</span>
          </div>
        </template>

        <div v-else class="wa-preview-muted">
          No messages in this conversation.
        </div>
      </div>
    </Teleport>
  </div>
</template>
