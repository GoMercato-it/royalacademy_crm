<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useWhatsAppStore } from '../stores/whatsapp';

const props = defineProps({
  chatId: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: '',
  },
});

const whatsappStore = useWhatsAppStore();
const rootRef = ref(null);
const loadStarted = ref(false);
const imageFailed = ref(false);
let observer = null;

const avatarUrl = computed(() => whatsappStore.avatarUrlByChat[props.chatId] || null);
const initial = computed(() => {
  const value = props.name || props.chatId || '?';

  return value.charAt(0).toUpperCase();
});

onMounted(() => {
  if (!rootRef.value) {
    loadAvatar();
    return;
  }

  if (!window.IntersectionObserver) {
    loadAvatar();
    return;
  }

  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      loadAvatar();
      disconnectObserver();
    }
  }, {
    rootMargin: '160px',
  });

  observer.observe(rootRef.value);
});

onBeforeUnmount(() => {
  disconnectObserver();
});

watch(() => props.chatId, () => {
  loadStarted.value = false;
  imageFailed.value = false;

  if (!observer) {
    loadAvatar();
  }
});

function loadAvatar() {
  if (loadStarted.value || !props.chatId) {
    return;
  }

  loadStarted.value = true;
  whatsappStore.loadAvatarUrl(props.chatId).catch(() => null);
}

function disconnectObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
</script>

<template>
  <span ref="rootRef" class="wa-chat-avatar">
    <img
      v-if="avatarUrl && !imageFailed"
      :src="avatarUrl"
      :alt="name || chatId"
      loading="lazy"
      @error="imageFailed = true"
    />
    <span v-else>{{ initial }}</span>
  </span>
</template>
