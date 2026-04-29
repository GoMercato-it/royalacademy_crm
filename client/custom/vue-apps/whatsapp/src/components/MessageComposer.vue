<script setup>
import { Transition, computed, nextTick, ref } from 'vue';

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

const emit = defineEmits(['send', 'send-media', 'send-location', 'send-contact-card', 'create-poll']);
const draft = ref('');
const textareaRef = ref(null);
const emojiOpen = ref(false);
const attachOpen = ref(false);
const advancedOpen = ref(false);
const advancedMode = ref('');
const mediaType = ref('image');
const mediaUrl = ref('');
const mediaCaption = ref('');
const mediaFilename = ref('');
const locationLatitude = ref('');
const locationLongitude = ref('');
const locationDescription = ref('');
const contactCardId = ref('');
const pollQuestion = ref('');
const pollOptionsText = ref('');
const emojiList = ['👍', '🙏', '😊', '🔥', '❤️', '😂', '👌', '✅'];
const mediaTypes = [
  { value: 'image', label: 'Image', icon: 'fa-image' },
  { value: 'video', label: 'Video', icon: 'fa-video' },
  { value: 'audio', label: 'Audio', icon: 'fa-music' },
  { value: 'voice', label: 'Voice', icon: 'fa-microphone' },
  { value: 'document', label: 'Document', icon: 'fa-file-lines' },
  { value: 'sticker', label: 'Sticker', icon: 'fa-note-sticky' },
];

const attachMenuItems = [
  { mode: 'media', label: 'Image', icon: 'fa-image', mediaPreset: 'image' },
  { mode: 'media', label: 'Video', icon: 'fa-video', mediaPreset: 'video' },
  { mode: 'media', label: 'Audio', icon: 'fa-music', mediaPreset: 'audio' },
  { mode: 'media', label: 'Document', icon: 'fa-file-lines', mediaPreset: 'document' },
  { mode: 'media', label: 'Sticker', icon: 'fa-note-sticky', mediaPreset: 'sticker' },
  { mode: 'poll', label: 'Poll', icon: 'fa-square-poll-horizontal' },
  { mode: 'location', label: 'Location', icon: 'fa-location-dot' },
  { mode: 'contact', label: 'Contact card', icon: 'fa-address-card' },
];

const advancedLabel = computed(() => {
  if (advancedMode.value === 'poll') return 'Create poll';
  if (advancedMode.value === 'location') return 'Send location';
  if (advancedMode.value === 'contact') return 'Send contact card';
  const found = mediaTypes.find(item => item.value === mediaType.value);
  return found ? `Send ${found.label.toLowerCase()}` : 'Send media';
});

const parsedPollOptions = computed(() => pollOptionsText.value
  .split(/\n/u)
  .map(option => option.trim())
  .filter(Boolean));

const canSendMedia = computed(() => {
  if (props.disabled || props.sending || !mediaUrl.value.trim()) {
    return false;
  }

  return mediaType.value !== 'document' || !!mediaFilename.value.trim();
});

const canCreatePoll = computed(() => {
  return !props.disabled &&
    !props.sending &&
    !!pollQuestion.value.trim() &&
    parsedPollOptions.value.length >= 2;
});

const canSendLocation = computed(() => {
  return !props.disabled &&
    !props.sending &&
    Number.isFinite(Number(locationLatitude.value)) &&
    Number.isFinite(Number(locationLongitude.value));
});

const canSendContactCard = computed(() => {
  return !props.disabled && !props.sending && !!contactCardId.value.trim();
});

function openAdvanced(item) {
  attachOpen.value = false;
  advancedMode.value = item.mode;
  advancedOpen.value = true;

  if (item.mediaPreset) {
    mediaType.value = item.mediaPreset;
  }
}

function closeAdvanced() {
  advancedOpen.value = false;
  advancedMode.value = '';
}

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
    attachOpen.value = false;
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

function submitMedia() {
  if (!canSendMedia.value) {
    return;
  }

  emit('send-media', {
    type: mediaType.value,
    url: mediaUrl.value.trim(),
    caption: mediaCaption.value.trim(),
    filename: mediaFilename.value.trim(),
    asVoice: mediaType.value === 'voice',
  });
  mediaUrl.value = '';
  mediaCaption.value = '';
  mediaFilename.value = '';
  closeAdvanced();
}

function submitLocation() {
  if (!canSendLocation.value) {
    return;
  }

  emit('send-location', {
    latitude: Number(locationLatitude.value),
    longitude: Number(locationLongitude.value),
    description: locationDescription.value.trim(),
  });
  locationLatitude.value = '';
  locationLongitude.value = '';
  locationDescription.value = '';
  closeAdvanced();
}

function submitContactCard() {
  if (!canSendContactCard.value) {
    return;
  }

  emit('send-contact-card', {
    contactId: contactCardId.value.trim(),
  });
  contactCardId.value = '';
  closeAdvanced();
}

function submitPoll() {
  if (!canCreatePoll.value) {
    return;
  }

  emit('create-poll', {
    question: pollQuestion.value.trim(),
    options: parsedPollOptions.value,
  });
  pollQuestion.value = '';
  pollOptionsText.value = '';
  closeAdvanced();
}

function toggleAttach() {
  attachOpen.value = !attachOpen.value;
  emojiOpen.value = false;
}
</script>

<template>
  <form class="wa-composer" @submit.prevent="submit">
    <div v-if="advancedOpen" class="wa-composer-advanced">
      <div class="wa-composer-advanced-header">
        <span>{{ advancedLabel }}</span>
        <button type="button" class="wa-composer-close" aria-label="Close panel" @click="closeAdvanced">
          <span class="fas fa-xmark"></span>
        </button>
      </div>

      <div v-if="advancedMode === 'media'" class="wa-composer-panel">
        <label class="wa-composer-field">
          <span>Type</span>
          <select v-model="mediaType" :disabled="disabled || sending">
            <option v-for="item in mediaTypes" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label class="wa-composer-field">
          <span>URL</span>
          <input v-model="mediaUrl" type="url" placeholder="https://..." :disabled="disabled || sending" />
        </label>
        <label v-if="mediaType === 'document'" class="wa-composer-field">
          <span>File name</span>
          <input v-model="mediaFilename" type="text" placeholder="file.pdf" :disabled="disabled || sending" />
        </label>
        <label v-if="['image', 'video', 'document'].includes(mediaType)" class="wa-composer-field">
          <span>Caption</span>
          <input v-model="mediaCaption" type="text" :disabled="disabled || sending" />
        </label>
        <button type="button" class="btn btn-default btn-sm wa-composer-panel-submit" :disabled="!canSendMedia" @click="submitMedia">
          <span class="fas" :class="mediaTypes.find(item => item.value === mediaType)?.icon"></span>
          <span>Send</span>
        </button>
      </div>

      <div v-else-if="advancedMode === 'poll'" class="wa-composer-panel">
        <label class="wa-composer-field">
          <span>Question</span>
          <input v-model="pollQuestion" type="text" :disabled="disabled || sending" />
        </label>
        <label class="wa-composer-field is-wide">
          <span>Options</span>
          <textarea v-model="pollOptionsText" rows="3" :disabled="disabled || sending"></textarea>
        </label>
        <button type="button" class="btn btn-default btn-sm wa-composer-panel-submit" :disabled="!canCreatePoll" @click="submitPoll">
          <span class="fas fa-square-poll-horizontal"></span>
          <span>Create</span>
        </button>
      </div>

      <div v-else-if="advancedMode === 'location'" class="wa-composer-panel">
        <label class="wa-composer-field">
          <span>Latitude</span>
          <input v-model="locationLatitude" type="number" step="any" :disabled="disabled || sending" />
        </label>
        <label class="wa-composer-field">
          <span>Longitude</span>
          <input v-model="locationLongitude" type="number" step="any" :disabled="disabled || sending" />
        </label>
        <label class="wa-composer-field is-wide">
          <span>Description</span>
          <input v-model="locationDescription" type="text" :disabled="disabled || sending" />
        </label>
        <button type="button" class="btn btn-default btn-sm wa-composer-panel-submit" :disabled="!canSendLocation" @click="submitLocation">
          <span class="fas fa-location-dot"></span>
          <span>Send</span>
        </button>
      </div>

      <div v-else class="wa-composer-panel">
        <label class="wa-composer-field is-wide">
          <span>Contact ID</span>
          <input v-model="contactCardId" type="text" placeholder="12025550108@c.us" :disabled="disabled || sending" />
        </label>
        <button type="button" class="btn btn-default btn-sm wa-composer-panel-submit" :disabled="!canSendContactCard" @click="submitContactCard">
          <span class="fas fa-address-card"></span>
          <span>Send</span>
        </button>
      </div>
    </div>

    <div class="wa-composer-tools">
      <button
        type="button"
        class="wa-icon-button"
        title="Emoji"
        aria-label="Open emoji picker"
        :aria-expanded="emojiOpen"
        :disabled="disabled || sending"
        @click="emojiOpen = !emojiOpen; attachOpen = false"
      >
        <span class="far fa-smile"></span>
      </button>
      <button
        type="button"
        class="wa-icon-button"
        title="Attach"
        aria-label="Open attachment menu"
        :aria-expanded="attachOpen"
        :disabled="disabled || sending"
        @click="toggleAttach"
      >
        <span class="fas fa-paperclip"></span>
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
      <Transition name="wa-attach-popover">
        <div v-if="attachOpen" class="wa-attach-popover">
          <button
            v-for="item in attachMenuItems"
            :key="item.label"
            type="button"
            class="wa-attach-item"
            @click="openAdvanced(item)"
          >
            <span class="fas" :class="item.icon"></span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </Transition>
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
