# WhatsApp Module API

This document covers the custom WhatsApp API surface implemented for Task 3.
All endpoints are custom EspoCRM action routes under:

```text
/api/v1/WhatsApp/action
```

All request and response bodies are JSON unless noted otherwise. Most calls
operate on the currently configured WhatsApp session on the server side.
`chatId`, `contactId`, and `messageId` values are WhatsApp identifiers. Backend
helpers normalize plain phone numbers to WhatsApp IDs where the implementation
supports it.

## Verified Upstream Bridge

The Task 3 implementation was aligned to the current `wwebjs-api` source rather
than to the stale endpoint examples in the original task text.

| Feature | Verified `wwebjs-api` bridge |
| --- | --- |
| Text, media URL, base64 media, location, contact card, poll | `POST /client/sendMessage/{sessionId}` with `contentType` |
| Download, edit, delete, react, forward, star, unstar, reactions, poll votes | `POST /message/{action}/{sessionId}` |
| Poll voting | `POST /message/runMethod/{sessionId}` with `method: "vote"` |
| Status and profile | `POST /client/setStatus`, `POST /client/setProfilePicture`, `POST /client/getProfilePicUrl`, `POST /contact/getAbout`, `POST /contact/getProfilePicUrl` |
| Contact management | `POST /contact/block`, `POST /contact/unblock`, `POST /client/isRegisteredUser`, `POST /client/getBlockedContacts` |
| Chat operations | `POST /client/archiveChat`, `POST /client/unarchiveChat`, `POST /client/muteChat`, `POST /client/unmuteChat`, `POST /client/pinChat`, `POST /client/unpinChat`, `POST /client/sendSeen`, `POST /client/markChatUnread`, `POST /chat/clearMessages` |

Verified content types for `sendMessage` are:

| `contentType` | Custom API entry point |
| --- | --- |
| `MessageMediaFromURL` | `sendImage`, `sendVideo`, `sendAudio`, `sendVoiceNote`, `sendDocument`, `sendSticker` |
| `MessageMedia` | `WhatsAppClient::sendMedia` backend method |
| `Location` | `sendLocation` |
| `Contact` | `sendContactCard` |
| `Poll` | `createPoll` |

## Media, Location, And Contact Card

| Method | Endpoint | Required payload | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/sendImage` | `chatId`, `imageUrl` | `caption` |
| `POST` | `/sendVideo` | `chatId`, `videoUrl` | `caption` |
| `POST` | `/sendAudio` | `chatId`, `audioUrl` | none |
| `POST` | `/sendVoiceNote` | `chatId`, `audioUrl` | none |
| `POST` | `/sendDocument` | `chatId`, `documentUrl`, `filename` | `caption` |
| `POST` | `/sendSticker` | `chatId`, `stickerUrl` | none |
| `POST` | `/sendLocation` | `chatId`, `latitude`, `longitude` | `description` |
| `POST` | `/sendContactCard` | `chatId`, `contactId` | none |
| `POST` | `/downloadMedia` | `chatId`, `messageId` | none |

Media URLs are validated by `MediaService` before dispatch. The service checks
URL format, MIME type, and a maximum `Content-Length` of 16 MB. Successful
outgoing media sends are persisted through the existing message dispatch path
with media details stored in `payloadMeta`.

Example:

```json
{
  "chatId": "390000000000@c.us",
  "imageUrl": "https://example.test/image.jpg",
  "caption": "Registration receipt"
}
```

## Message Actions

| Method | Endpoint | Required payload | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/editMessage` | `chatId`, `messageId`, `text` | none |
| `POST` | `/deleteMessage` | `chatId`, `messageId` | `everyone`, `clearMedia` |
| `POST` | `/reactToMessage` | `chatId`, `messageId` | `reaction` |
| `POST` | `/forwardMessage` | `chatId`, `messageId`, `destinationChatId` | none |
| `POST` | `/starMessage` | `chatId`, `messageId` | none |
| `POST` | `/unstarMessage` | `chatId`, `messageId` | none |
| `POST` | `/getMessageReactions` | `chatId`, `messageId` | none |

An empty `reaction` value removes the current message reaction.

## Polls

| Method | Endpoint | Required payload | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/createPoll` | `chatId`, `question`, `pollOptions` | `config` |
| `POST` | `/getPollVotes` | `chatId`, `messageId` | none |
| `POST` | `/voteInPoll` | `chatId`, `messageId`, `selectedOptions` | none |

`pollOptions` and `selectedOptions` are arrays of option text. Poll voting is
bridged through `message/runMethod` because the verified `wwebjs-api` source has
no dedicated `/poll/vote` route.

Example:

```json
{
  "chatId": "390000000000@c.us",
  "question": "Preferred lesson time?",
  "pollOptions": ["Morning", "Afternoon"],
  "config": {
    "allowMultipleAnswers": false
  }
}
```

## Status And Profile

| Method | Endpoint | Required payload/query | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/setStatus` | `status` | none |
| `GET` | `/getContactStatus` | `contactId` query parameter | none |
| `POST` | `/updateProfilePicture` | `pictureMimetype`, `pictureData` | none |
| `GET` | `/getContactProfilePicture` | `contactId` query parameter | none |

`pictureData` is base64 image data. The verified upstream route is
`setProfilePicture`, not `updateProfilePicture`; the custom endpoint keeps the
Task 3 frontend-friendly name and maps it to the verified bridge.

## Contact Management

| Method | Endpoint | Required payload/query | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/blockUser` | `contactId` | none |
| `POST` | `/unblockUser` | `contactId` | none |
| `POST` | `/checkNumberOnWhatsApp` | `number` | none |
| `GET` | `/getBlockedContacts` | none | none |

`checkNumberOnWhatsApp` maps to the verified upstream
`client/isRegisteredUser` route.

## Chat Operations

| Method | Endpoint | Required payload | Optional payload |
| --- | --- | --- | --- |
| `POST` | `/archiveChat` | `chatId` | none |
| `POST` | `/unarchiveChat` | `chatId` | none |
| `POST` | `/muteChat` | `chatId` | `unmuteDate` |
| `POST` | `/unmuteChat` | `chatId` | none |
| `POST` | `/pinChat` | `chatId` | none |
| `POST` | `/unpinChat` | `chatId` | none |
| `POST` | `/markChatRead` | `chatId` | none |
| `POST` | `/markChatUnread` | `chatId` | none |
| `POST` | `/clearChatMessages` | `chatId` | none |

`unmuteDate` is passed as a Unix timestamp string when present. Omitting it
requests an indefinite mute through the upstream API behavior.

## Frontend Surface

The live Vue app exposes Task 3 through existing custom frontend files:

| Area | File | Coverage |
| --- | --- | --- |
| API client | `client/custom/vue-apps/whatsapp/src/utils/api.js` | All `/WhatsApp/action/*` wrappers |
| Store | `client/custom/vue-apps/whatsapp/src/stores/whatsapp.js` | UI-facing actions and request state |
| Composer | `client/custom/vue-apps/whatsapp/src/components/MessageComposer.vue` | Media URL sends, polls, location, contact cards |
| Thread | `client/custom/vue-apps/whatsapp/src/components/ChatThread.vue` | Edit, delete, react, forward, star, download media, poll vote/results |
| Context panel | `client/custom/vue-apps/whatsapp/src/components/ContextPanel.vue` | Chat operations and contact operations |
| App shell | `client/custom/vue-apps/whatsapp/src/App.vue` | Header status/profile controls and event routing |

## Limitations And Safety Notes

- Raw vCard sending is not implemented. The Task 3 inventory listed it, but no
  verified `wwebjs-api` route or request contract was found for raw vCard
  sending. Verified contact-card sending through `contentType: "Contact"` and
  `contactId` is implemented instead.
- Destructive real-account actions such as delete, block, archive, mute, pin,
  and clear messages were wired and covered by structural integration checks,
  but were not executed against the connected WhatsApp account without explicit
  target data.
- Media URL validation depends on remote HTTP headers. If a remote server omits
  `Content-Type` or `Content-Length`, validation can reject otherwise valid
  media until that source provides predictable headers.

## Verification Commands

Run from the project root:

```bash
ddev exec php -l custom/Espo/Modules/WhatsApp/Core/WhatsAppClient.php
ddev exec php -l custom/Espo/Modules/WhatsApp/Controllers/WhatsApp.php
ddev exec php -l custom/Espo/Modules/WhatsApp/Tests/Integration/Task3FeatureCoverageTest.php
node -e "const fs=require('fs'); const routes=JSON.parse(fs.readFileSync('custom/Espo/Modules/WhatsApp/Resources/routes.json','utf8')); console.log(routes.length + ' routes');"
cd client/custom/vue-apps/whatsapp && npm run build
ddev exec php custom/Espo/Modules/WhatsApp/Tests/Integration/Task3FeatureCoverageTest.php
```

Expected integration-test result:

```text
Task 3 integration contract checks passed.
```

