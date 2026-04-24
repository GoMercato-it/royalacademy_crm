import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles.css';

function resolveRoot(target) {
  if (typeof target === 'string') {
    return document.querySelector(target);
  }

  return target;
}

export function initWhatsAppVueApp(target, espoContext = {}) {
  const root = resolveRoot(target);

  if (!root) {
    throw new Error('WhatsApp Vue root element was not found.');
  }

  if (root.__whatsAppVueApp) {
    root.__whatsAppVueApp.unmount();
  }

  const app = createApp(App, { espoContext });

  app.use(createPinia());
  app.mount(root);

  root.__whatsAppVueApp = app;

  return app;
}

window.initWhatsAppVueApp = initWhatsAppVueApp;
