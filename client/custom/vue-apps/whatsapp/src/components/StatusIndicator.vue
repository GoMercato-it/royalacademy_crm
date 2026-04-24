<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: {
    type: String,
    default: 'unknown',
  },
  isConnected: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['retry']);

const state = computed(() => {
  if (props.loading) {
    return 'syncing';
  }

  if (props.isConnected) {
    return 'connected';
  }

  return 'offline';
});

const label = computed(() => {
  if (state.value === 'syncing') {
    return 'Checking';
  }

  if (state.value === 'connected') {
    return 'Connected';
  }

  return props.status || 'Offline';
});
</script>

<template>
  <button
    type="button"
    class="wa-status-indicator"
    :class="`is-${state}`"
    :title="state === 'offline' ? 'Retry status check' : label"
    :aria-label="state === 'offline' ? 'Retry WhatsApp status check' : `WhatsApp status ${label}`"
    @click="state === 'offline' && emit('retry')"
  >
    <span class="wa-status-dot"></span>
    <span>{{ label }}</span>
  </button>
</template>
