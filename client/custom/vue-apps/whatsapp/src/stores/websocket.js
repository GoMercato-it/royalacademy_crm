import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useWhatsAppStore } from './whatsapp';

export const useWebSocketStore = defineStore('websocket', () => {
  const subscribed = ref(false);
  const subscribing = ref(false);
  const lastError = ref(null);
  const retryTimer = ref(null);
  const retryDelay = ref(2000);
  let manager = null;
  let handler = null;

  function connect() {
    if (subscribed.value || subscribing.value) {
      return Promise.resolve();
    }

    subscribing.value = true;
    lastError.value = null;

    return resolveManager()
      .then(resolvedManager => {
        manager = resolvedManager;

        if (!handler) {
          handler = (topic, payload) => {
            const eventPayload = typeof topic === 'object' && payload === undefined ? topic : payload;
            useWhatsAppStore().handleRealtimeEvent(eventPayload);
          };
        }

        manager.unsubscribe('WhatsApp', handler);
        manager.subscribe('WhatsApp', handler);

        subscribed.value = true;
        subscribing.value = false;
        retryDelay.value = 2000;
        clearRetry();
      })
      .catch(error => {
        subscribing.value = false;
        lastError.value = error;
        scheduleRetry();
      });
  }

  function disconnect() {
    clearRetry();

    if (manager && handler) {
      try {
        manager.unsubscribe('WhatsApp', handler);
      } catch (error) {}
    }

    subscribed.value = false;
  }

  function resolveManager() {
    return new Promise((resolve, reject) => {
      if (manager) {
        resolve(manager);
        return;
      }

      if (!window.Espo || !window.Espo.loader || !window.Espo.loader.require) {
        reject(new Error('Espo loader is not available.'));
        return;
      }

      window.Espo.loader.require('di', diModule => {
        window.Espo.loader.require('web-socket-manager', wsModule => {
          const WebSocketManagerClass = (wsModule && wsModule.default) || wsModule;
          const container = diModule && diModule.container;

          if (!container || !container.get || !WebSocketManagerClass) {
            reject(new Error('Espo webSocketManager is unavailable.'));
            return;
          }

          resolve(container.get(WebSocketManagerClass));
        });
      });
    });
  }

  function scheduleRetry() {
    if (retryTimer.value || subscribed.value) {
      return;
    }

    retryTimer.value = window.setTimeout(() => {
      retryTimer.value = null;
      retryDelay.value = Math.min(30000, Math.round(retryDelay.value * 1.6));
      connect();
    }, retryDelay.value);
  }

  function clearRetry() {
    if (!retryTimer.value) {
      return;
    }

    window.clearTimeout(retryTimer.value);
    retryTimer.value = null;
  }

  return {
    subscribed,
    subscribing,
    lastError,
    connect,
    disconnect,
  };
});
