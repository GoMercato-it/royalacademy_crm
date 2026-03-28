# Royal Academy CRM

Custom `EspoCRM` installation for Royal Academy. Previous documentation was outdated; this README reflects the code that is actually present in the repository today.

The system is not a generic CRM customization. It is a combined CRM + student operations + course delivery platform built around:

- student profiles linked to Espo users,
- course and course-section management,
- gated PDF study materials,
- CSV-driven lead intake,
- WhatsApp messaging, conversation tracking, and notifications,
- DDEV-based local runtime with MinIO and WAHA/WhatsApp API support.

## What The System Does

At a business level, the current codebase supports these flows:

- manage **Courses** with status, category, duration, price, teams, and related sections;
- manage **Course Sections** with ordering, PDF material, active flag, and page boundaries;
- manage **Students** as a dedicated entity linked 1:1 with `User`;
- manage **Course Access** records that assign a student to a course and track active/completed state;
- store and display **WhatsApp messages** inside the CRM;
- track **WhatsApp sessions, conversations, and contact/avatar links** for deeper module development;
- import **Leads from remote CSV URLs** on demand or on a schedule;
- expose course PDFs through the CRM and portal with access checks;
- automatically synchronize some business rules through Espo hooks.

## Current Project State

The repository contains a meaningful amount of custom code and configuration, not just metadata tweaks.

- Custom backend code lives mainly in `custom/Espo/Custom` and `custom/Espo/Modules/WhatsApp`.
- Custom frontend code lives in `client/custom`.
- Local runtime and environment switching live in `.ddev` and `environments`.
- The custom code footprint is substantial: roughly `150+` files in `custom/Espo/Custom` plus dedicated client code and environment/runtime glue.

### Implemented And Actively Wired

- `Course`, `CourseSection`, `CourseAccess`, `Student`, `CsvLeadImport`, `WhatsAppMessage`, `WhatsAppSession`, `WhatsAppConversation`, `WhatsAppContactLink` entities.
- custom routes for WhatsApp, CSV import actions, and PDF streaming.
- WhatsApp settings screen in admin.
- global floating WhatsApp widget injected into the Espo frontend.
- PDF reader panel on `CourseSection`.
- scheduled CSV import job plus console command to ensure the job exists.
- MinIO-backed PDF storage for course sections.
- MinIO-backed WhatsApp avatar storage.
- automatic student profile creation from `User` with role `Student`.
- automatic course-team sync down to course sections.
- automatic course-access timestamping.
- automatic deactivation logic on student expulsion.
- shared WhatsApp service layer for widget + future full module/workflow automation.

### Partially Implemented / Needs Revalidation

- WhatsApp automatic message on new lead creation exists, but the current status handling and success checks look fragile.
- PDF access control is enforced server-side, but page slicing is only enforced in the frontend viewer; the backend still streams the full file.
- WebSocket metadata suggests finer-grained access control, but the actual broadcasting service publishes on a broader `WhatsApp` topic.
- the large dedicated WhatsApp workspace/module foundation exists in backend/domain design, but its full CRM UI is not built yet.

### Legacy / Drift Signals

- the repository, domains, and some upstream references still carry `gomercato` naming;
- there are parallel layout definitions under both `Resources/layouts` and `Resources/metadata/layouts`;
- there are two WhatsApp controllers in different namespaces;
- the old README described infrastructure that does not match the current checked-in DDEV setup.

## Core Business Model

### `Course`

Represents the top-level learning product.

Key fields:

- `name`, `description`
- `status`: `Bozza`, `Attivo`, `Archiviato`
- `category`: `Professional`, `Masterclass`, `Workshop`, `Online`
- `durationHours`
- `price`
- `coverImageKey`
- standard `assignedUser` and `teams`

Relations:

- one course has many `CourseSection`
- one course has many `CourseAccess`

In the UI, `Course` is a top-level tab.

### `CourseSection`

Represents a section or lesson block inside a course.

Key fields:

- `name`, `description`
- `course`
- `order`
- `isActive`
- `pdfFile`
- `pdfMinioKey`
- `startPage`
- `endPage`

Behavior:

- when `pdfFile` changes, the attachment is uploaded to MinIO;
- the MinIO key is stored back on the entity;
- the frontend exposes a dedicated PDF reader panel.

`CourseSection` is not a top-level tab; it primarily lives under course relationships and course content flows.

### `CourseAccess`

Represents the student-to-course assignment.

Key fields:

- `student`
- `course`
- `isActive`
- `assignedAt`
- `courseCompleted`
- `completedAt`

Behavior:

- `assignedAt` is automatically set on create if missing.

### `Student`

Dedicated student profile entity linked to an Espo `User`.

Key fields include:

- `user`
- `firstName`, `lastName`
- `dateOfBirth`
- `phone`, `email`
- address fields
- `languagePreference`: `Italiano`, `English`, `Russian`
- `enrollmentDate`
- `status`: `Attiva`, `Inattiva`, `Diplomata`, `Sospesa`, `Espulsa`
- education and profile fields
- `profilePhotoKey`

Behavior:

- when a `User` is created with role `Student`, a `Student` entity is auto-created;
- when a student becomes `Espulsa`, the linked user is removed from teams, deactivated, and all active course accesses are disabled.

`Student` is a top-level tab.

### `CsvLeadImport`

Configuration entity for remote CSV imports into Espo Leads.

Key fields:

- `name`
- `csvUrl`
- `isActive`
- `lastProcessedRow`
- `lastRunAt`
- `lastError`
- `leadsImportedCount`
- `firstRowIsHeader`
- `fieldMapping`
- `defaultFieldMapping`
- `assignedUser`
- `team`
- `leadSource`
- `skipDuplicates`
- `duplicateCheckFields`

Behavior:

- supports manual import from the UI;
- supports counter reset from the UI;
- supports scheduled processing via `ImportLeadsFromCsv`;
- remembers how many CSV rows have already been processed.

### `WhatsAppMessage`

Technical store for WhatsApp chat messages.

Key fields:

- `body`
- `bodyPreview`
- `chatId`
- `sessionId`
- `conversationId`
- `fromMe`
- `messageId`
- `status`: `Sent`, `Delivered`, `Read`, `Failed`, `Received`
- `timestamp`
- `payloadMeta`

Used as the local persistence layer for WhatsApp history, deduplication, and chat rendering.

### `WhatsAppSession`

Tracks transport and bootstrap lifecycle for the active WhatsApp session.

Key fields:

- `sessionId`
- `lifecycleState`
- `rawState`
- `isConnected`
- `phoneNumber`
- `bootstrapPhase`
- `syncProgress`
- `connectedAt`
- `disconnectedAt`
- `lastSyncAt`
- `lastEventAt`
- `lastError`
- `contextData`

Used as the backend source of truth for session state and future non-widget WhatsApp UI flows.

### `WhatsAppConversation`

Tracks CRM-facing conversation state on top of raw WhatsApp messages.

Key fields:

- `sessionId`
- `chatId`
- `participantWaId`
- `contactLinkId`
- `status`: `open`, `idle`, `closed`, `archived`
- `startedAt`
- `lastMessageAt`
- `lastMessagePreview`
- `lastMessageDirection`
- `messageCount`
- `timeoutAt`
- `endedAt`
- `durationSeconds`
- `metadata`

Used as the conversation layer for ownership, reporting, SLA-style logic, and later workflow automation.

### `WhatsAppContactLink`

Maps WhatsApp identities to CRM entities and stores avatar metadata.

Key fields:

- `waId`
- `normalizedPhone`
- `displayName`
- `linkedEntityType`
- `linkedEntityId`
- `avatarStorage`
- `avatarObjectKey`
- `avatarMimeType`
- `avatarFetchedAt`
- `metadata`

Used for contact linking, avatar storage, and future contact-to-record reconciliation.

## Main Functional Flows

### 1. Student Provisioning

- Create a `User`.
- If the user has role `Student`, a `Student` entity is created automatically.
- The initial student profile is prefilled from the user and defaults to `Attiva` and `Italiano`.

### 2. Course Assignment

- Assign a student to a course through `CourseAccess`.
- `assignedAt` is filled automatically.
- If the student is expelled later, all active accesses are disabled.

### 3. Course Material Delivery

- Upload a PDF to `CourseSection`.
- The file is copied from `data/upload` to MinIO.
- `pdfMinioKey` is stored on the section.
- The viewer calls `CourseSectionPdf/:id/url` and `CourseSectionPdf/:id/stream`.
- Access is allowed for:
  - admins,
  - users whose linked student has active course access,
  - users who belong to a team assigned to the course.

### 4. Team Propagation

- Teams assigned to a `Course` are automatically synchronized to all related `CourseSection` records.
- This is important for visibility and portal access consistency.

### 5. CSV Lead Intake

- Admin configures a `CsvLeadImport` record with `csvUrl`, mapping, duplicate settings, assignment, and source.
- Import can be run manually from the detail view.
- The scheduled job can also process all active configs every minute.
- Imported rows create standard CRM `Lead` records.

Default mapping already handles many common column names such as:

- first/last name,
- email,
- phone,
- company/account,
- title,
- address data,
- description/source fields.

### 6. WhatsApp Messaging

The WhatsApp integration is split into two parts:

- an admin setup screen for API settings;
- a globally injected floating chat widget in the frontend;
- a shared backend foundation for a future full WhatsApp CRM module and workflow actions.

The backend flow is:

1. the CRM talks to a WAHA / wwebjs-compatible API service;
2. inbound webhook data is accepted by `POST /WhatsApp/action/webhook`;
3. chat history is fetched from the working `chat/fetchMessages` endpoint, with `syncHistory` fallback when needed;
4. normalized displayable messages are stored in `WhatsAppMessage`;
5. conversation/session state is tracked in `WhatsAppConversation` and `WhatsAppSession`;
6. avatars are stored through `WhatsAppContactLink` and served from MinIO-backed storage;
7. outbound and inbound events are broadcast through Espo WebSocket submission;
8. the widget renders live updates through the Espo WebSocket channel; initial list/history bootstrap still uses HTTP endpoints.

Additional behavior:

- chat history is merged from API and DB, with local persistence used as the stable history layer;
- duplicate messages are avoided using `messageId`;
- empty technical WhatsApp notifications are filtered so they do not become fake user chats;
- contacts are deduplicated across multiple WhatsApp identity forms such as `@c.us` and `@lid`;
- profile pictures are cached through the backend and stored in MinIO, not in a frontend-local avatar folder;
- a workflow-ready action layer exists so future CRM automation can call WhatsApp actions without binding directly to widget code.

## Frontend Customization

The frontend is not built with a separate Node pipeline in this repository. There is no checked-in `package.json`; the current custom client code is loaded directly by Espo.

### Custom UI Pieces

- **WhatsApp settings page** via custom controller/view.
- **Global floating WhatsApp widget** with chat list, login/QR flow, contacts, avatar loading, message sending, theme switching, and websocket-driven realtime behavior.
- **CourseSection PDF reader** as a bottom panel with fullscreen overlay, zoom, scroll/single-page modes, keyboard navigation, and portal/admin compatibility.
- **CsvLeadImport detail actions**: `Run Import Now` and `Reset Counter`.

### Active Frontend Entry Points

- `client/custom/src/whatsapp-widget-init.js`
- `client/custom/src/views/whatsapp/setup-v2.js`
- `client/custom/src/views/course-section/pdf-viewer.js`
- `client/custom/src/handlers/csv-lead-import.js`

### Client-Side Libraries

- local `pdf.js` bundle for PDF rendering:
  - `client/custom/lib/pdf.min.js`
  - `client/custom/lib/pdf.worker.min.js`

## Backend And Integration Architecture

### Custom Backend Areas

- `custom/Espo/Custom/Controllers`
- `custom/Espo/Custom/Services`
- `custom/Espo/Custom/Hooks`
- `custom/Espo/Custom/Entities`
- `custom/Espo/Modules/WhatsApp/Services`

### Important Custom Services

- `CsvLeadImportService`
  - fetches remote CSV via Guzzle,
  - parses rows,
  - applies default or custom field mappings,
  - checks duplicates,
  - creates leads,
  - tracks progress and errors.

- `MinioService`
  - uploads section PDFs,
  - fetches file content,
  - can generate presigned URLs,
  - deletes objects.

- `WhatsAppClient`
  - wraps the external WhatsApp API,
  - handles session start/status/QR,
  - sends messages,
  - reads chats/messages/contacts,
  - uses the current working history endpoints (`chat/fetchMessages` and `chat/syncHistory`),
  - fetches profile picture URLs.

- `MessageDispatchService`
  - centralizes message send/store/broadcast logic,
  - merges API history with webhook/realtime data,
  - prevents destructive overwrites when later events arrive with empty body,
  - filters non-display WhatsApp system notifications.

- `SessionLifecycleService`
  - records transport/bootstrap lifecycle state,
  - keeps `WhatsAppSession` in sync,
  - broadcasts lifecycle changes for future module UX.

- `AvatarStorageService`
  - resolves WhatsApp avatar URLs,
  - downloads avatars,
  - stores avatar payloads in MinIO via `WhatsAppContactLink`,
  - serves avatars back through CRM endpoints.

- `ConversationTrackingService`
  - opens/updates/closes `WhatsAppConversation`,
  - tracks last message preview, direction, and message count,
  - provides the CRM-facing conversation layer for later automation.

- `WorkflowActionService`
  - provides a stable backend action entry point for automation,
  - currently supports `send_message`,
  - is intended to back future Espo workflow/business-process integrations.

- `WebSocketService`
  - broadcasts message events and acknowledgements to the frontend.

### Custom Routes

The repository defines custom routes for:

- `WhatsApp/action/login`
- `WhatsApp/action/qrCode`
- `WhatsApp/action/status`
- `WhatsApp/action/getChats`
- `WhatsApp/action/getChatMessages`
- `WhatsApp/action/getContacts`
- `WhatsApp/action/getProfilePic`
- `WhatsApp/action/profilePicContent`
- `WhatsApp/action/logout`
- `WhatsApp/action/sendMessage`
- `WhatsApp/action/executeAction`
- `WhatsApp/action/saveSettings`
- `WhatsApp/action/webhook`
- `CsvLeadImport/:id/runImport`
- `CsvLeadImport/:id/resetCounter`
- `CourseSectionPdf/:id/url`
- `CourseSectionPdf/:id/stream`

### Custom Scheduled Logic

- `ImportLeadsFromCsv` job is registered in metadata.
- `ensureScheduledJobs` console command creates or updates the corresponding `ScheduledJob`.
- The intended schedule is `* * * * *`.

## Runtime Architecture

The checked-in runtime is DDEV-first.

### Local Stack

- PHP `8.3`
- MariaDB `11.8`
- `nginx-fpm`
- `docroot=public`
- websocket daemon launched inside the `web` container
- `ddev-cron` addon for cron execution
- MinIO sidecar
- WhatsApp API sidecar
- optional Caddy sidecar for the `dev` environment

### Important Clarifications

- there is **no separate checked-in `daemon` container** in the current DDEV setup;
- cron and websocket both run inside the DDEV `web` runtime;
- WhatsApp realtime uses the Espo websocket stack already present in the project (ZeroMQ/WAMP flow), not a separate ad-hoc widget channel;
- the old README’s websocket proxy details were outdated.

### Runtime Services

| Service | Purpose | Notes |
| --- | --- | --- |
| `web` | main EspoCRM runtime | also runs websocket daemon |
| `db` | MariaDB | managed by DDEV |
| `whatsapp-api` | WAHA / WhatsApp bridge | listens on port `3000` internally |
| `minio` | object storage for PDFs and WhatsApp avatars | exposes `9000` and `9001` |
| `caddy` | dev VPS hostname proxy | enabled only in `dev` env |

### URLs And Ports

Primary URLs:

- local: `https://royalacademy-crm.ddev.site`
- dev-style host: `https://crm.gomercato.it`

Important ports and endpoints:

- WhatsApp API: `3000`
- websocket daemon exposed by DDEV: container `8080`, HTTPS access `8444`
- MinIO: `9000` API, `9001` console
- websocket frontend endpoint: `/wss`
- WhatsApp webhook target from sidecar: `http://web/api/v1/WhatsApp/action/webhook`

## Environment Switching

This repository includes a custom host command:

```bash
ddev env local
ddev env dev
```

What it does:

- copies `environments/<env>/config-internal.php` to `data/config-internal.php`;
- removes old `.ddev/docker-compose.active-*` files;
- activates environment-specific compose files when present.

After switching environments, always run:

```bash
ddev restart
```

### `local`

Uses:

- `https://royalacademy-crm.ddev.site`

### `dev`

Uses:

- `https://crm.gomercato.it`

Also activates Caddy with host port bindings on `80` and `443`.

Important note: the project name is Royal Academy CRM, but some infrastructure and hostnames still use legacy `gomercato` naming.

## Local Development Setup

### Prerequisites

- DDEV installed and working
- Docker available

### First Start

```bash
git clone <repo-url>
cd royalacademy_crm
ddev start
```

Open:

- `https://royalacademy-crm.ddev.site`

If EspoCRM is not installed yet, complete the installer.

Database parameters for the installer:

- host: `db`
- database: `db`
- user: `db`
- password: `db`

After installation finishes:

```bash
ddev restart
```

That restart is important because the DDEV `post-start` hook:

- clears cache,
- runs `ensureScheduledJobs`,
- finalizes the normal post-install runtime state.

## Common Operations

### Switch Environment

```bash
ddev env local
ddev restart
```

```bash
ddev env dev
ddev restart
```

### Clear Cache

```bash
ddev exec php command.php clear-cache
```

or

```bash
ddev exec php clear_cache.php
```

### Rebuild Metadata

```bash
ddev exec php command.php rebuild
```

or

```bash
ddev exec php rebuild.php
```

### Ensure Scheduled Jobs

```bash
ddev exec php bin/command ensureScheduledJobs
```

### Useful Logs

- application log: `data/logs/espo.log`
- browser-side issues: browser devtools console and network tab
- container/runtime issues: `ddev logs`

## Operational Notes

- Changing Espo metadata, routes, client definitions, scopes, or layout files usually requires a rebuild.
- Changing `.ddev` compose or environment files requires `ddev restart`.
- The current setup assumes DDEV is the source of truth for local runtime; generic `docker-compose up` instructions from the old README are not the main path anymore.

## Project Structure Map

```text
custom/Espo/Custom/
  Classes/
    ConsoleCommands/
    Jobs/
  Controllers/
  Core/WhatsApp/
  Entities/
  Hooks/
  Resources/
  Services/

custom/Espo/Modules/WhatsApp/
  Controllers/
  Services/

client/custom/
  css/
  lib/
  res/templates/
  src/

.ddev/
environments/
```

## Known Risks And Technical Debt

This section intentionally documents the current state as seen in code, not an ideal future state.

### Security / Exposure

- `POST /WhatsApp/action/webhook` is marked `noAuth: true` and the controller does not validate a signature or shared secret.
- checked-in environment and compose templates currently contain environment-specific secrets and credentials; these should be reviewed before broader distribution or non-local deployment.
- the default local WhatsApp API key is a development placeholder and must not be reused outside local/dev use.

### Behavior / Logic Gaps

- lead auto-message logic for WhatsApp should be revalidated before relying on it in production workflows;
- PDF page boundaries are enforced only by the reader UI, not by backend file slicing;
- WebSocket access control metadata and actual broadcast topic usage are not fully aligned;
- CSV duplicate matching uses all selected fields together, not any-of semantics.
- the future full WhatsApp workspace UI is not finished yet even though the backend/domain foundation now exists.

### Codebase Drift

- duplicated layout definitions exist in two resource trees;
- there are two WhatsApp controller locations;
- some widget code still carries compatibility logic from the earlier incremental integration phase.

### Operational Gaps

- no dedicated automated test suite was found for the custom code;
- local verification is mainly runtime/manual;
- `dev` mode binds Caddy to host ports `80/443`, which can conflict with other local services.

## Recommended Verification Checklist

After significant changes, manually verify at least:

1. `ddev restart` completes cleanly.
2. `ddev exec php command.php rebuild` succeeds.
3. `Course` to `CourseSection` team sync still works.
4. `CourseSection` PDF upload writes `pdfMinioKey`.
5. PDF reader still opens in admin and portal contexts.
6. `CsvLeadImport` manual run and scheduled run both work.
7. WhatsApp widget loads, connects, and opens a working `/wss` socket in the browser.
8. WhatsApp chat history opens with recent device messages, not just locally stored rows.
9. WhatsApp avatars load through CRM endpoints backed by MinIO.

## Final Notes

Royal Academy CRM is already a fairly opinionated vertical application on top of EspoCRM, not an empty starter customization. The strongest implemented areas today are:

- course/student/access domain model,
- PDF material delivery,
- CSV lead import,
- WhatsApp chat persistence and UI integration,
- WhatsApp session/conversation/avatar foundation for a larger module,
- DDEV-based local runtime.

The biggest areas to treat carefully are:

- WhatsApp webhook security,
- checked-in secrets/config drift,
- legacy naming leftovers,
- duplicated metadata/layout sources,
- absence of automated regression coverage.
