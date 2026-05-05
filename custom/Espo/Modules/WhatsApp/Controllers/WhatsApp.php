<?php

namespace Espo\Modules\WhatsApp\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\NotFound;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Config\ConfigWriter;
use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;
use Espo\Modules\WhatsApp\Services\AvatarStorageService;
use Espo\Modules\WhatsApp\Services\ChatListSnapshotService;
use Espo\Modules\WhatsApp\Services\ConversationTrackingService;
use Espo\Modules\WhatsApp\Services\GroupService;
use Espo\Modules\WhatsApp\Services\MediaService;
use Espo\Modules\WhatsApp\Services\MessageDispatchService;
use Espo\Modules\WhatsApp\Services\SessionLifecycleService;
use Espo\Modules\WhatsApp\Services\WebSocketService;
use Espo\Modules\WhatsApp\Services\WorkflowActionService;

class WhatsApp
{
    private const CHAT_LIST_DEFAULT_LIMIT = 50;
    private const CHAT_LIST_MAX_LIMIT = 100;
    private const MESSAGE_LIST_DEFAULT_LIMIT = 50;
    private const MESSAGE_LIST_MAX_LIMIT = 1000;
    private const MESSAGE_LIVE_MAX_LIMIT = 200;

    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private MessageDispatchService $messageDispatchService,
        private ConversationTrackingService $conversationTrackingService,
        private GroupService $groupService,
        private MediaService $mediaService,
        private ChatListSnapshotService $chatListSnapshotService,
        private SessionLifecycleService $sessionLifecycleService,
        private AvatarStorageService $avatarStorageService,
        private WorkflowActionService $workflowActionService,
        private WebSocketService $webSocketService,
        private Config $config,
        private ConfigWriter $configWriter,
        private Log $log
    ) {}

    public function getActionLogin(Request $request, Response $response): array
    {
        $qrCode = $this->whatsAppClient->getQRCode();

        if (!$qrCode) {
            $this->whatsAppClient->startSession();
            $qrCode = $this->whatsAppClient->getQRCode();
        }

        if ($qrCode) {
            $this->sessionLifecycleService->markQrReady(
                $this->whatsAppClient->getSessionId(),
                ['source' => 'login']
            );
        }

        return [
            'success' => true,
            'qrCode' => $qrCode,
        ];
    }

    public function getActionQrCode(Request $request, Response $response): array
    {
        $qr = $this->whatsAppClient->getQRCode();

        if ($qr) {
            $this->sessionLifecycleService->markQrReady(
                $this->whatsAppClient->getSessionId(),
                ['source' => 'qrCode']
            );
        }

        return [
            'qr' => $qr,
        ];
    }

    public function getActionStatus(Request $request, Response $response): array
    {
        $enabled = $this->config->get('whatsappEnabled');

        if ($enabled === false) {
            $this->sessionLifecycleService->recordState(
                $this->whatsAppClient->getSessionId(),
                'disabled',
                ['rawState' => 'DISABLED']
            );

            return [
                'status' => 'disabled',
                'isConnected' => false,
                'enabled' => false,
            ];
        }

        $status = $this->whatsAppClient->getSessionStatus();
        $isConnected = in_array(strtoupper($status), ['CONNECTED', 'AUTHENTICATED']);

        $this->sessionLifecycleService->syncTransportState(
            $this->whatsAppClient->getSessionId(),
            $status
        );

        return [
            'status' => $status,
            'isConnected' => $isConnected,
            'enabled' => true,
        ];
    }

    public function getActionGetChats(Request $request, Response $response): array
    {
        $refresh = filter_var($request->getQueryParam('refresh') ?? false, FILTER_VALIDATE_BOOL);
        $hasPagination = $request->getQueryParam('limit') !== null || $request->getQueryParam('offset') !== null;
        $limit = $hasPagination
            ? $this->readIntQueryParam(
                $request,
                'limit',
                self::CHAT_LIST_DEFAULT_LIMIT,
                1,
                self::CHAT_LIST_MAX_LIMIT
            )
            : null;
        $offset = $hasPagination
            ? $this->readIntQueryParam($request, 'offset', 0, 0, PHP_INT_MAX)
            : 0;
        $snapshot = $this->chatListSnapshotService->getChatList($refresh, $limit, $offset);

        return [
            'success' => true,
            'list' => $snapshot['list'],
            'fromCache' => $snapshot['fromCache'],
            'stale' => $snapshot['stale'],
            'cachedAt' => $snapshot['cachedAt'],
            'total' => $snapshot['total'],
            'limit' => $snapshot['limit'],
            'offset' => $snapshot['offset'],
            'hasMore' => $snapshot['hasMore'],
            'nextOffset' => $snapshot['nextOffset'],
        ];
    }

    public function getActionGetChatMessages(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $source = strtolower(trim((string) ($request->getQueryParam('source') ?? 'web')));
        $limit = $this->readIntQueryParam(
            $request,
            'limit',
            self::MESSAGE_LIST_DEFAULT_LIMIT,
            1,
            $source === 'stored' ? self::MESSAGE_LIST_MAX_LIMIT : self::MESSAGE_LIVE_MAX_LIMIT
        );
        $offset = $this->readIntQueryParam($request, 'offset', 0, 0, PHP_INT_MAX);
        $cursor = $this->readOptionalTimestampQueryParam($request, 'before')
            ?? $this->readOptionalTimestampQueryParam($request, 'cursor');

        if ($source === 'stored') {
            $page = $this->messageDispatchService->getStoredMessagesPage(
                $chatId,
                $limit,
                $offset,
                $cursor
            );

            return [
                'success' => true,
                'list' => $page['list'],
                'total' => $page['total'],
                'limit' => $page['limit'],
                'offset' => $page['offset'],
                'hasMore' => $page['hasMore'],
                'nextOffset' => $page['nextOffset'],
                'nextCursor' => $page['nextCursor'],
                'source' => 'stored',
                'liveCount' => null,
                'storedTotal' => $page['total'],
            ];
        }

        try {
            $apiMessages = $this->whatsAppClient->getChatMessages($chatId, $limit);
            $this->messageDispatchService->ingestApiMessages($chatId, $apiMessages);
            $list = $this->messageDispatchService->getLiveMessages($chatId, $apiMessages);
            $storedTotal = $this->messageDispatchService->countStoredMessages($chatId);
        } catch (\Throwable $e) {
            $this->log->warning('WhatsApp live message fetch failed: ' . $e->getMessage(), [
                'chatId' => $chatId,
            ]);

            return [
                'success' => false,
                'error' => 'WA_WEB_FETCH_FAILED',
                'message' => 'Unable to fetch messages from WhatsApp Web.',
                'list' => [],
                'total' => 0,
                'limit' => $limit,
                'offset' => $offset,
                'hasMore' => false,
                'nextOffset' => null,
                'nextCursor' => null,
                'source' => 'web',
                'liveCount' => 0,
                'storedTotal' => $this->messageDispatchService->countStoredMessages($chatId),
            ];
        }

        $liveCount = count($list);
        $nextCursor = null;

        if ($liveCount >= $limit && $list !== []) {
            $oldestTimestamp = (int) ($list[0]['timestamp'] ?? 0);
            $nextCursor = $oldestTimestamp > 0 ? $oldestTimestamp : null;
        }

        return [
            'success' => true,
            'list' => $list,
            'total' => $liveCount,
            'limit' => $limit,
            'offset' => $offset,
            'hasMore' => $liveCount >= $limit,
            'nextOffset' => null,
            'nextCursor' => $nextCursor,
            'source' => 'web',
            'liveCount' => $liveCount,
            'storedTotal' => $storedTotal,
        ];
    }

    public function getActionGetContacts(Request $request, Response $response): array
    {
        return [
            'success' => true,
            'list' => $this->whatsAppClient->getContacts(),
        ];
    }

    public function getActionGetChatContext(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');
        $phoneNumber = $request->getQueryParam('phoneNumber');

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        return [
            'success' => true,
            'data' => $this->conversationTrackingService->getChatContext($chatId, $phoneNumber),
        ];
    }

    public function getActionGetConversationHistory(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $limit = (int) ($request->getQueryParam('limit') ?? 25);

        return [
            'success' => true,
            'list' => $this->conversationTrackingService->getConversationHistory(
                $this->whatsAppClient->getSessionId(),
                $chatId,
                $limit
            ),
        ];
    }

    public function getActionConversationPreview(Request $request, Response $response): array
    {
        $conversationId = $request->getQueryParam('conversationId');

        if (!$conversationId) {
            throw new BadRequest('conversationId is required');
        }

        $limit = (int) ($request->getQueryParam('limit') ?? 5);

        return [
            'success' => true,
            'messages' => $this->conversationTrackingService->getPreviewMessages($conversationId, $limit),
        ];
    }

    public function getActionGetChatFolders(Request $request, Response $response): array
    {
        $forceRefresh = filter_var($request->getQueryParam('forceRefresh') ?? false, FILTER_VALIDATE_BOOL);

        return [
            'success' => true,
            'list' => $this->groupService->getAllGroups($forceRefresh),
        ];
    }

    public function getActionGetGroupDetails(Request $request, Response $response): array
    {
        $groupId = trim((string) ($request->getQueryParam('groupId') ?? ''));

        if ($groupId === '') {
            throw new BadRequest('groupId is required');
        }

        return [
            'success' => true,
            'data' => $this->groupService->getGroupDetails($groupId),
        ];
    }

    public function getActionGetProfilePic(Request $request, Response $response): array
    {
        $id = $request->getQueryParam('id');

        if (!$id) {
            return ['url' => null];
        }

        $link = $this->avatarStorageService->ensureAvatar($id);

        if (!$link) {
            return ['url' => null];
        }

        $version = $this->avatarStorageService->getAvatarVersion($id) ?: time();

        return [
            'url' => '/api/v1/WhatsApp/action/profilePicContent?id=' . rawurlencode($id) . '&v=' . $version,
        ];
    }

    public function getActionProfilePicContent(Request $request, Response $response): void
    {
        $id = $request->getQueryParam('id');

        if (!$id) {
            throw new NotFound('Avatar not found.');
        }

        $payload = $this->avatarStorageService->getAvatarContent($id);

        if (!$payload) {
            throw new NotFound('Avatar not found.');
        }

        $response->setHeader('Content-Type', $payload['contentType'] ?? 'image/jpeg');
        $response->setHeader('Cache-Control', 'public, max-age=86400');
        $response->writeBody($payload['body'] ?? '');
    }

    public function postActionLogout(Request $request, Response $response): array
    {
        $result = $this->whatsAppClient->terminateSession();

        if ($result) {
            $this->chatListSnapshotService->clearSnapshot();
            $this->sessionLifecycleService->markDisconnected(
                $this->whatsAppClient->getSessionId(),
                ['source' => 'logout']
            );
        }

        return ['success' => $result];
    }

    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $phone = $data->phone ?? $data->chatId ?? null;
        $message = $data->message ?? null;

        if (!$phone || !$message) {
            throw new BadRequest('Phone/chatId and message required');
        }

        $result = $this->messageDispatchService->sendMessage($phone, $message);

        if ($result['success'] ?? false) {
            return [
                'success' => true,
                'messageId' => $result['messageId'] ?? null,
                'message' => $result['message'] ?? null,
            ];
        }

        return $result;
    }

    public function postActionSendLocation(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $latitude = $this->readPayloadFloat($payload, ['latitude', 'lat']);
        $longitude = $this->readPayloadFloat($payload, ['longitude', 'lng', 'lon']);

        if ($latitude === null || $longitude === null) {
            throw new BadRequest('latitude and longitude are required');
        }

        return $this->whatsAppClient->sendLocation(
            $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId'),
            $latitude,
            $longitude,
            $this->readPayloadString($payload, ['description', 'name'])
        );
    }

    public function postActionSendContactCard(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->sendContactCard(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['contactId', 'phone'], 'contactId')
        );
    }

    public function postActionCreateContactFromChat(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $displayName = $data->displayName ?? null;
        $phoneNumber = $data->phoneNumber ?? null;

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        return [
            'success' => true,
            'data' => $this->conversationTrackingService->createContactFromChat($chatId, $displayName, $phoneNumber),
        ];
    }

    public function postActionCreateGroup(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $name = trim((string) ($data->name ?? $data->title ?? ''));
        $participants = $this->normalizeStringList($data->participants ?? []);

        if ($name === '' || $participants === []) {
            throw new BadRequest('name and participants are required');
        }

        return [
            'success' => true,
            'data' => $this->groupService->createGroup($name, $participants),
        ];
    }

    public function postActionLeaveGroup(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $groupId = trim((string) ($data->groupId ?? $data->chatId ?? ''));

        if ($groupId === '') {
            throw new BadRequest('groupId is required');
        }

        return [
            'success' => true,
            'data' => $this->groupService->leaveGroup($groupId),
        ];
    }

    public function postActionAddGroupParticipants(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $groupId = trim((string) ($data->groupId ?? $data->chatId ?? ''));
        $participants = $this->normalizeStringList($data->participants ?? $data->participantIds ?? []);

        if ($groupId === '' || $participants === []) {
            throw new BadRequest('groupId and participants are required');
        }

        return [
            'success' => true,
            'data' => $this->groupService->addGroupParticipants($groupId, $participants),
        ];
    }

    public function postActionUpdateGroupSetting(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $groupId = trim((string) ($data->groupId ?? $data->chatId ?? ''));
        $setting = trim((string) ($data->setting ?? ''));

        if ($groupId === '' || $setting === '') {
            throw new BadRequest('groupId and setting are required');
        }

        return [
            'success' => true,
            'data' => $this->groupService->updateGroupSetting($groupId, $setting),
        ];
    }

    public function postActionSendImage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $imageUrl = $this->requirePayloadString($payload, ['imageUrl', 'url'], 'imageUrl');

        return $this->mediaService->sendImage(
            $chatId,
            $imageUrl,
            $this->readPayloadString($payload, ['caption'])
        );
    }

    public function postActionSendVideo(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $videoUrl = $this->requirePayloadString($payload, ['videoUrl', 'url'], 'videoUrl');

        return $this->mediaService->sendVideo(
            $chatId,
            $videoUrl,
            $this->readPayloadString($payload, ['caption'])
        );
    }

    public function postActionSendAudio(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $audioUrl = $this->requirePayloadString($payload, ['audioUrl', 'url'], 'audioUrl');

        return $this->mediaService->sendAudio($chatId, $audioUrl, $this->readPayloadBool($payload, 'asVoice'));
    }

    public function postActionSendVoiceNote(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $audioUrl = $this->requirePayloadString($payload, ['audioUrl', 'url'], 'audioUrl');

        return $this->mediaService->sendVoiceNote($chatId, $audioUrl);
    }

    public function postActionSendDocument(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $documentUrl = $this->requirePayloadString($payload, ['documentUrl', 'url'], 'documentUrl');
        $filename = $this->requirePayloadString($payload, ['filename', 'fileName'], 'filename');

        return $this->mediaService->sendDocument(
            $chatId,
            $documentUrl,
            $filename,
            $this->readPayloadString($payload, ['caption'])
        );
    }

    public function postActionSendSticker(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId', 'phone'], 'chatId');
        $stickerUrl = $this->requirePayloadString($payload, ['stickerUrl', 'url'], 'stickerUrl');

        return $this->mediaService->sendSticker($chatId, $stickerUrl);
    }

    public function postActionDownloadMedia(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->mediaService->downloadMedia(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId')
        );
    }

    public function postActionEditMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->editMessage(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId'),
            $this->requirePayloadString($payload, ['content', 'newText', 'message'], 'content')
        );
    }

    public function postActionDeleteMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->deleteMessage(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId'),
            $this->readPayloadBool($payload, 'everyone', $this->readPayloadBool($payload, 'forEveryone')),
            $this->readPayloadBool($payload, 'clearMedia')
        );
    }

    public function postActionReactToMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->sendReaction(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId'),
            $this->readPayloadString($payload, ['reaction', 'emoji']) ?? ''
        );
    }

    public function postActionForwardMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->forwardMessage(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId'),
            $this->requirePayloadString($payload, ['destinationChatId', 'toChatId'], 'destinationChatId')
        );
    }

    public function postActionStarMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->starMessage(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId')
        );
    }

    public function postActionUnstarMessage(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->unstarMessage(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId')
        );
    }

    public function postActionGetMessageReactions(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->getMessageReactions(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId')
        );
    }

    public function postActionCreatePoll(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $chatId = $this->requirePayloadString($payload, ['chatId'], 'chatId');
        $question = $this->requirePayloadString($payload, ['question', 'pollName'], 'question');
        $pollOptions = $this->normalizeStringList($payload['pollOptions'] ?? $payload['options'] ?? []);

        if ($pollOptions === []) {
            throw new BadRequest('pollOptions are required');
        }

        $config = $payload['config'] ?? [];

        return $this->whatsAppClient->createPoll($chatId, $question, $pollOptions, is_array($config) ? $config : []);
    }

    public function postActionGetPollVotes(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->getPollVotes(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId')
        );
    }

    public function postActionVoteInPoll(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $selectedOptions = $this->normalizeStringList($payload['selectedOptions'] ?? $payload['options'] ?? []);

        if ($selectedOptions === []) {
            throw new BadRequest('selectedOptions are required');
        }

        return $this->whatsAppClient->voteInPoll(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $this->requirePayloadString($payload, ['messageId'], 'messageId'),
            $selectedOptions
        );
    }

    public function postActionSetStatus(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->setStatus($this->requirePayloadString($payload, ['status'], 'status'));
    }

    public function getActionGetContactStatus(Request $request, Response $response): array
    {
        $contactId = trim((string) ($request->getQueryParam('contactId') ?? $request->getQueryParam('id') ?? ''));

        if ($contactId === '') {
            throw new BadRequest('contactId is required');
        }

        return $this->whatsAppClient->getStatus($contactId);
    }

    public function postActionUpdateProfilePicture(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->updateProfilePicture(
            $this->requirePayloadString($payload, ['pictureMimetype', 'mimetype'], 'pictureMimetype'),
            $this->requirePayloadString($payload, ['pictureData', 'data'], 'pictureData')
        );
    }

    public function getActionGetContactProfilePicture(Request $request, Response $response): array
    {
        $contactId = trim((string) ($request->getQueryParam('contactId') ?? $request->getQueryParam('id') ?? ''));

        if ($contactId === '') {
            throw new BadRequest('contactId is required');
        }

        return $this->whatsAppClient->getContactProfilePicture($contactId);
    }

    public function postActionBlockUser(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->blockUser($this->requirePayloadString($payload, ['contactId', 'chatId'], 'contactId'));
    }

    public function postActionUnblockUser(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->unblockUser($this->requirePayloadString($payload, ['contactId', 'chatId'], 'contactId'));
    }

    public function postActionCheckNumberOnWhatsApp(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);

        return $this->whatsAppClient->checkNumberOnWhatsApp($this->requirePayloadString($payload, ['number', 'phone'], 'number'));
    }

    public function getActionGetBlockedContacts(Request $request, Response $response): array
    {
        return $this->whatsAppClient->getBlockedContacts();
    }

    public function postActionArchiveChat(Request $request, Response $response): array
    {
        return $this->whatsAppClient->archiveChat($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionUnarchiveChat(Request $request, Response $response): array
    {
        return $this->whatsAppClient->unarchiveChat($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionMuteChat(Request $request, Response $response): array
    {
        $payload = $this->getPayload($request);
        $unmuteTimestamp = $this->readPayloadInt($payload, ['unmuteDate', 'unmuteTimestamp']);
        $duration = $this->readPayloadInt($payload, ['duration']);

        if ($unmuteTimestamp === null && $duration !== null && $duration > 0) {
            $unmuteTimestamp = time() + $duration;
        }

        return $this->whatsAppClient->muteChat(
            $this->requirePayloadString($payload, ['chatId'], 'chatId'),
            $unmuteTimestamp
        );
    }

    public function postActionUnmuteChat(Request $request, Response $response): array
    {
        return $this->whatsAppClient->unmuteChat($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionPinChat(Request $request, Response $response): array
    {
        return $this->whatsAppClient->pinChat($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionUnpinChat(Request $request, Response $response): array
    {
        return $this->whatsAppClient->unpinChat($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionMarkChatRead(Request $request, Response $response): array
    {
        return $this->whatsAppClient->markChatRead($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionMarkChatUnread(Request $request, Response $response): array
    {
        return $this->whatsAppClient->markChatUnread($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionClearChatMessages(Request $request, Response $response): array
    {
        return $this->whatsAppClient->clearChatMessages($this->requirePayloadString($this->getPayload($request), ['chatId'], 'chatId'));
    }

    public function postActionExecuteAction(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $payload = is_object($data) ? get_object_vars($data) : (array) $data;
        $action = (string) ($payload['action'] ?? '');

        if ($action === '') {
            throw new BadRequest('action is required');
        }

        try {
            return $this->workflowActionService->execute($action, $payload);
        } catch (\RuntimeException $e) {
            throw new BadRequest($e->getMessage());
        }
    }

    public function postActionSaveSettings(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();

        if (isset($data->whatsappApiUrl)) {
            $this->configWriter->set('whatsappApiUrl', $data->whatsappApiUrl);
        }
        if (isset($data->whatsappApiKey)) {
            $this->configWriter->set('whatsappApiKey', $data->whatsappApiKey);
        }
        if (isset($data->whatsappAutoMessageEnabled)) {
            $this->configWriter->set('whatsappAutoMessageEnabled', $data->whatsappAutoMessageEnabled);
        }
        if (isset($data->whatsappLeadTemplate)) {
            $this->configWriter->set('whatsappLeadTemplate', $data->whatsappLeadTemplate);
        }
        if (isset($data->whatsappEnabled)) {
            $this->configWriter->set('whatsappEnabled', $data->whatsappEnabled);
        }
        if (isset($data->whatsappConversationTimeoutSeconds)) {
            $this->configWriter->set(
                'whatsappConversationTimeoutSeconds',
                max(60, (int) $data->whatsappConversationTimeoutSeconds)
            );
        }

        $this->ensureWhatsAppTab();
        $this->configWriter->save();

        return ['success' => true];
    }

    private function ensureWhatsAppTab(): void
    {
        $tabList = $this->config->get('tabList') ?? [];

        if (!is_array($tabList)) {
            return;
        }

        if (in_array('WhatsApp', $tabList, true)) {
            return;
        }

        $index = array_search('Email', $tabList, true);

        if ($index === false) {
            $tabList[] = 'WhatsApp';
        } else {
            array_splice($tabList, $index + 1, 0, ['WhatsApp']);
        }

        $this->configWriter->set('tabList', $tabList);
    }

    /**
     * @return array<string, mixed>
     */
    private function getPayload(Request $request): array
    {
        $data = $request->getParsedBody();

        if (is_array($data)) {
            return $data;
        }

        if (is_object($data)) {
            return get_object_vars($data);
        }

        return [];
    }

    /**
     * @param array<string, mixed> $payload
     * @param string[] $keys
     */
    private function requirePayloadString(array $payload, array $keys, string $fieldName): string
    {
        $value = $this->readPayloadString($payload, $keys);

        if ($value === null || $value === '') {
            throw new BadRequest($fieldName . ' is required');
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $payload
     * @param string[] $keys
     */
    private function readPayloadString(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];

            if (is_array($value) || is_object($value)) {
                continue;
            }

            return trim((string) $value);
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function readPayloadBool(array $payload, string $key, bool $default = false): bool
    {
        if (!array_key_exists($key, $payload)) {
            return $default;
        }

        return filter_var($payload[$key], FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    /**
     * @param array<string, mixed> $payload
     * @param string[] $keys
     */
    private function readPayloadInt(array $payload, array $keys): ?int
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $payload) || $payload[$key] === '' || $payload[$key] === null) {
                continue;
            }

            if (is_numeric($payload[$key])) {
                return (int) $payload[$key];
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @param string[] $keys
     */
    private function readPayloadFloat(array $payload, array $keys): ?float
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $payload) || $payload[$key] === '' || $payload[$key] === null) {
                continue;
            }

            if (is_numeric($payload[$key])) {
                return (float) $payload[$key];
            }
        }

        return null;
    }

    private function readIntQueryParam(Request $request, string $name, int $default, int $min, int $max): int
    {
        $rawValue = $request->getQueryParam($name);

        if ($rawValue === null || $rawValue === '' || !is_numeric($rawValue)) {
            return $default;
        }

        return max($min, min($max, (int) $rawValue));
    }

    private function readOptionalTimestampQueryParam(Request $request, string $name): ?int
    {
        $rawValue = $request->getQueryParam($name);

        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if (is_numeric($rawValue)) {
            return max(0, (int) $rawValue);
        }

        $parsed = strtotime((string) $rawValue);

        return $parsed === false ? null : $parsed;
    }

    /**
     * @return string[]
     */
    private function normalizeStringList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($item): string => trim((string) $item),
            $value
        ))));
    }

    public function postActionWebhook(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $this->log->info('WhatsApp webhook received', (array) $data);

        $this->messageDispatchService->processWebhookData($data);

        return ['success' => true];
    }

    public function postActionBroadcastAck(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $messageId = $data->messageId ?? null;
        $ack = $data->ack ?? 1;
        $status = $data->status ?? null;

        if (!$chatId || !$messageId) {
            throw new BadRequest('chatId and messageId are required');
        }

        try {
            $this->webSocketService->broadcastMessageAck($chatId, $messageId, $ack, $status);

            return [
                'success' => true,
                'message' => 'ACK broadcasted',
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    public function postActionBroadcastTyping(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $isTyping = $data->isTyping ?? true;

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        try {
            $this->webSocketService->broadcastTyping($chatId, $isTyping);

            return [
                'success' => true,
                'message' => 'Typing status broadcasted',
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
