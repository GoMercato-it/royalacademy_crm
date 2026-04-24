import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

function readCssVariable(styles, name, fallback = '') {
  return String(styles.getPropertyValue(name) || fallback || '').trim();
}

function parseColor(value) {
  const color = String(value || '').trim();
  const rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);

  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
    };
  }

  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!hex) {
    return null;
  }

  const value6 = hex[1].length === 3
    ? hex[1].split('').map(char => char + char).join('')
    : hex[1];

  return {
    r: parseInt(value6.slice(0, 2), 16),
    g: parseInt(value6.slice(2, 4), 16),
    b: parseInt(value6.slice(4, 6), 16),
  };
}

function toRgb(color) {
  return `rgb(${clamp(color.r)}, ${clamp(color.g)}, ${clamp(color.b)})`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixColors(first, second, amount = 0.5) {
  const a = parseColor(first);
  const b = parseColor(second);

  if (!a || !b) {
    return first || second || '';
  }

  return toRgb({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function shiftColor(value, amount) {
  const color = parseColor(value);

  if (!color) {
    return value;
  }

  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);

  return toRgb({
    r: color.r + (target - color.r) * weight,
    g: color.g + (target - color.g) * weight,
    b: color.b + (target - color.b) * weight,
  });
}

function getLuminance(value) {
  const color = parseColor(value);

  if (!color) {
    return 255;
  }

  return (0.299 * color.r) + (0.587 * color.g) + (0.114 * color.b);
}

function getReadableText(background, lightText, darkText) {
  return getLuminance(background) < 130 ? lightText : darkText;
}

function buildTheme() {
  const bodyStyles = window.getComputedStyle(document.body);
  const rootStyles = window.getComputedStyle(document.documentElement);
  const getVar = (name, fallback = '') => readCssVariable(bodyStyles, name) || readCssVariable(rootStyles, name, fallback);

  const bodyBg = getVar('--body-bg', bodyStyles.backgroundColor || '#f7f7f7');
  const panel = getVar('--panel-bg', getVar('--panel-default-bg', '#ffffff'));
  const border = getVar('--panel-default-border', getVar('--default-border-color', '#dddddd'));
  const text = getVar('--text-color', bodyStyles.color || '#333333');
  const muted = getVar('--text-muted-color', '#777777');
  const input = getVar('--input-bg', panel);
  const link = getVar('--link-color', '#337ab7');
  const successBg = getVar('--state-success-bg', getVar('--btn-success-bg', '#dff6d9'));
  const successBorder = getVar('--state-success-border', getVar('--btn-success-border', successBg));
  const warningBg = getVar('--state-warning-bg', '#fcf8e3');
  const warningBorder = getVar('--state-warning-border', border);
  const warningText = getVar('--state-warning-text', getReadableText(warningBg, '#f6e4a6', '#8a6d3b'));
  const dangerBg = getVar('--state-danger-bg', '#f2dede');
  const dangerBorder = getVar('--state-danger-border', border);
  const dangerText = getVar('--state-danger-text', getReadableText(dangerBg, '#ffb7bd', '#a94442'));
  const isDark = getLuminance(panel) < 130 || getLuminance(bodyBg) < 130;
  const canvas = mixColors(bodyBg, panel, isDark ? 0.38 : 0.58);
  const incoming = isDark ? shiftColor(panel, 0.04) : panel;
  const outgoing = isDark ? mixColors(panel, successBg, 0.32) : successBg;
  const outgoingText = getReadableText(outgoing, '#f3fff7', text);

  return {
    isDark,
    variables: {
      '--wa-app-bg': bodyBg,
      '--wa-panel-surface': panel,
      '--wa-panel-border': border,
      '--wa-text-main': text,
      '--wa-text-muted': muted,
      '--wa-hover-bg': isDark ? shiftColor(panel, 0.08) : shiftColor(panel, -0.04),
      '--wa-input-bg': input,
      '--wa-chat-canvas': canvas,
      '--wa-message-in-bg': incoming,
      '--wa-message-out-bg': outgoing,
      '--wa-message-out-border': successBorder,
      '--wa-message-out-text': outgoingText,
      '--wa-danger-bg': dangerBg,
      '--wa-danger-border': dangerBorder,
      '--wa-danger-text': dangerText,
      '--wa-warning-bg': warningBg,
      '--wa-warning-border': warningBorder,
      '--wa-warning-text': warningText,
      '--wa-link-color': link,
      '--wa-skeleton-a': isDark ? shiftColor(panel, 0.04) : shiftColor(panel, -0.04),
      '--wa-skeleton-b': isDark ? shiftColor(panel, 0.1) : shiftColor(panel, -0.1),
      '--wa-subtle-hover': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)',
    },
  };
}

export function useEspoTheme() {
  const version = ref(0);
  let observer = null;

  const theme = computed(() => {
    version.value;

    if (typeof window === 'undefined') {
      return {
        isDark: false,
        variables: {},
      };
    }

    return buildTheme();
  });

  function updateTheme() {
    version.value += 1;
  }

  onMounted(() => {
    updateTheme();

    if (!window.MutationObserver) {
      return;
    }

    observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
  });

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  return {
    isDarkTheme: computed(() => theme.value.isDark),
    themeStyle: computed(() => theme.value.variables),
    updateTheme,
  };
}
