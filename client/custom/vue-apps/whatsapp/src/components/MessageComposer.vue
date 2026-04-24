<script setup>
import { nextTick, ref } from 'vue';

const props = defineProps({
  disabled: {
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
const textareaRef = ref(null);
const emojiOpen = ref(false);
const emojiList = ['👍', '🙏', '😊', '🔥', '❤️', '😂', '👌', '✅'];

function submit() {
  const text = draft.value.trim();

  if (!text || props.disabled || props.sending) {
    return;
  }

  emit('send', text);
  draft.value = '';
  resizeTextarea();
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emojiOpen.value = false;
    return;
  }

  if ((event.key === 'Enter' && event.ctrlKey) || (event.key === 'Enter' && !event.shiftKey)) {
    event.preventDefault();
    submit();
  }
}

function appendEmoji(emoji) {
  draft.value += emoji;
  emojiOpen.value = false;
  nextTick(() => {
    resizeTextarea();
    textareaRef.value && textareaRef.value.focus();
  });
}

function resizeTextarea() {
  nextTick(() => {
    const textarea = textareaRef.value;

    if (!textarea) {
      return;
    }

    textarea.style.height = '0';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 118)}px`;
  });
}
</script>

<template>
  <form class="wa-composer" @submit.prevent="submit">
    <div class="wa-composer-tools">
      <button
        type="button"
        class="wa-icon-button"
        title="Emoji"
        aria-label="Open emoji picker"
        :aria-expanded="emojiOpen"
        :disabled="disabled || sending"
        @click="emojiOpen = !emojiOpen"
      >
        <span class="far fa-smile"></span>
      </button>
      <div v-if="emojiOpen" class="wa-emoji-popover">
        <button
          v-for="emoji in emojiList"
          :key="emoji"
          type="button"
          class="wa-emoji-button"
          :aria-label="`Insert emoji ${emoji}`"
          @click="appendEmoji(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <textarea
      ref="textareaRef"
      v-model="draft"
      rows="1"
      autocomplete="off"
      placeholder="Type a message"
      aria-label="Message text"
      :disabled="disabled || sending"
      @input="resizeTextarea"
      @keydown="handleKeydown"
    ></textarea>

    <button type="submit" class="btn btn-primary wa-composer-send" aria-label="Send message" :disabled="disabled || sending || !draft.trim()">
      Send
    </button>
  </form>
</template>
