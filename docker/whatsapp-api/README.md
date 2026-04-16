# WhatsApp API Bridge Image

This image wraps `avoylenko/wwebjs-api` for the CRM runtime.

Pinned upstream refs:

- `avoylenko/wwebjs-api`: `31e94123016757adcaa1a8aeca514695ee1f722d`
- `whatsapp-web.js`: `b0a4b6c6c10868fad4881fb484b97895ce898b5d`

Why this exists:

- Docker Hub `avoylenko/wwebjs-api:latest` is still based on the January 2026 release.
- Current WhatsApp Web expects `WAWebChatLoadMessages.loadEarlierMsgs({ chat })`.
- `avoylenko/wwebjs-api` still calls `loadEarlierMsgs(chat)` in its custom `fetchMessages` override.
- `whatsapp-web.js` main already contains the profile picture compatibility fix, so the old DDEV startup patch is no longer needed.
- The CRM webhook route is `noAuth`; using `x-api-key` on bridge-to-CRM callbacks makes Espo treat the callback as a failed API-auth attempt. The image rewrites that callback header to `x-whatsapp-api-key`.
- Runtime config should keep only message-bearing callbacks enabled. Startup/status/reaction/ack callbacks are noisy during first sync and are not consumed by the CRM.

Removal criteria:

- Remove the `loadEarlierMsgs` part of `patch-whatsapp-api-compat.js` once `avoylenko/wwebjs-api` releases a version that calls `loadEarlierMsgs({ chat })` in `src/utils.js`.
- Keep the webhook header isolation unless the CRM endpoint is changed to intentionally authenticate bridge callbacks with a non-Espo auth header.
