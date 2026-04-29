<?php

namespace Espo\Modules\WhatsApp\Core;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;

class WhatsAppClient
{
    private string $sessionId = 'espocrm-session';

    public function __construct(
        private Config $config,
        private Log $log
    ) {
    }

    public function getSessionId(): string
    {
        return $this->sessionId;
    }

    private function getApiUrl(): string
    {
        return rtrim($this->config->get('whatsappApiUrl', 'http://whatsapp-api:3000'), '/');
    }

    private function getApiKey(): ?string
    {
        return $this->config->get('whatsappApiKey');
    }

    public function startSession(): array
    {
        return $this->makeRequest('GET', "/session/start/{$this->sessionId}");
    }

    public function getQRCode(): ?string
    {
        $response = $this->makeRequest('GET', "/session/qr/{$this->sessionId}");

        return $response['qr'] ?? null;
    }

    public function getSessionStatus(): string
    {
        $response = $this->makeRequest('GET', "/session/status/{$this->sessionId}");

        return $response['state'] ?? $response['status'] ?? 'disconnected';
    }

    public function getChats(): array
    {
        $response = $this->makeRequest('GET', "/client/getChats/{$this->sessionId}");

        return $response['chats'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    /**
     * @return array<int, array<string, mixed>|object>
     */
    public function getAllGroups(): array
    {
        return array_values(array_filter(
            $this->getChats(),
            fn($chat): bool => $this->isGroupChat($chat)
        ));
    }

    public function getGroupMetadata(string $groupId): array
    {
        return $this->makeRequest('POST', "/groupChat/getClassInfo/{$this->sessionId}", [
            'chatId' => $groupId,
        ]);
    }

    /**
     * @param string[] $participants
     * @param array<string, mixed> $options
     */
    public function createGroup(string $title, array $participants, array $options = []): array
    {
        $payload = [
            'title' => $title,
            'participants' => array_values($participants),
        ];

        if ($options !== []) {
            $payload['options'] = $options;
        }

        return $this->makeRequest('POST', "/client/createGroup/{$this->sessionId}", $payload);
    }

    public function leaveGroup(string $groupId): array
    {
        return $this->makeRequest('POST', "/groupChat/leave/{$this->sessionId}", [
            'chatId' => $groupId,
        ]);
    }

    /**
     * @param string[] $participants
     * @param array<string, mixed> $options
     */
    public function addGroupParticipants(string $groupId, array $participants, array $options = []): array
    {
        $payload = [
            'chatId' => $groupId,
            'participantIds' => array_values($participants),
        ];

        if ($options !== []) {
            $payload['options'] = $options;
        }

        return $this->makeRequest('POST', "/groupChat/addParticipants/{$this->sessionId}", $payload);
    }

    public function setGroupSubject(string $groupId, string $subject): array
    {
        return $this->makeRequest('POST', "/groupChat/setSubject/{$this->sessionId}", [
            'chatId' => $groupId,
            'subject' => $subject,
        ]);
    }

    public function setGroupDescription(string $groupId, string $description): array
    {
        return $this->makeRequest('POST', "/groupChat/setDescription/{$this->sessionId}", [
            'chatId' => $groupId,
            'description' => $description,
        ]);
    }

    public function setGroupInfoAdminsOnly(string $groupId, bool $adminsOnly): array
    {
        return $this->makeRequest('POST', "/groupChat/setInfoAdminsOnly/{$this->sessionId}", [
            'chatId' => $groupId,
            'adminsOnly' => $adminsOnly,
        ]);
    }

    public function setGroupMessagesAdminsOnly(string $groupId, bool $adminsOnly): array
    {
        return $this->makeRequest('POST', "/groupChat/setMessagesAdminsOnly/{$this->sessionId}", [
            'chatId' => $groupId,
            'adminsOnly' => $adminsOnly,
        ]);
    }

    public function updateGroupSetting(string $groupId, string $setting): array
    {
        return match ($setting) {
            'announcement', 'messagesAdminsOnly' => $this->setGroupMessagesAdminsOnly($groupId, true),
            'not_announcement', 'messagesAllParticipants' => $this->setGroupMessagesAdminsOnly($groupId, false),
            'infoAdminsOnly' => $this->setGroupInfoAdminsOnly($groupId, true),
            'infoAllParticipants' => $this->setGroupInfoAdminsOnly($groupId, false),
            default => ['success' => false, 'error' => 'Unsupported group setting.'],
        };
    }

    public function getChatMessages(string $chatId, int $limit = 40): array
    {
        $limit = max(1, min(200, $limit));

        // Keep UI requests bounded. An unbounded fetch serializes the full in-memory
        // WhatsApp chat and can block the Node bridge on large conversations.
        return $this->fetchChatMessagesBatch($chatId, $limit);
    }

    public function getContacts(): array
    {
        $response = $this->makeRequest('GET', "/client/getContacts/{$this->sessionId}");

        return $response['contacts'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    /**
     * @param string[] $userIds
     * @return array<int, array<string, mixed>>
     */
    public function getContactLidAndPhone(array $userIds): array
    {
        $userIds = array_values(array_unique(array_filter(array_map(
            fn($id) => trim((string) $id),
            $userIds
        ))));

        if ($userIds === []) {
            return [];
        }

        $result = [];

        foreach (array_chunk($userIds, 100) as $chunk) {
            $response = $this->makeRequest('POST', "/client/getContactLidAndPhone/{$this->sessionId}", [
                'userIds' => $chunk,
            ]);

            $data = $response['data'] ?? $response['result'] ?? [];

            if (is_array($data)) {
                $result = array_merge($result, $data);
            }
        }

        return $result;
    }

    public function sendMessage(string $chatId, string $message): array
    {
        return $this->sendClientMessage($chatId, 'string', $message);
    }

    public function sendLocation(
        string $chatId,
        float $latitude,
        float $longitude,
        ?string $description = null
    ): array {
        return $this->sendClientMessage($chatId, 'Location', [
            'latitude' => $latitude,
            'longitude' => $longitude,
            'description' => $description ?? '',
        ]);
    }

    public function sendContactCard(string $chatId, string $contactId): array
    {
        $normalizedContactId = $this->normalizeSendChatId($contactId);

        if ($normalizedContactId === null) {
            return ['success' => false, 'error' => 'contactId is required'];
        }

        return $this->sendClientMessage($chatId, 'Contact', [
            'contactId' => $normalizedContactId,
        ]);
    }

    /**
     * @param array<string, mixed> $options
     * @param array<string, mixed> $mediaFromUrlOptions
     */
    public function sendMediaFromUrl(
        string $chatId,
        string $mediaUrl,
        ?string $caption = null,
        array $options = [],
        array $mediaFromUrlOptions = []
    ): array {
        if ($caption !== null) {
            $options['caption'] = $caption;
        }

        $extraPayload = [];

        if ($mediaFromUrlOptions !== []) {
            $extraPayload['mediaFromURLOptions'] = $mediaFromUrlOptions;
        }

        return $this->sendClientMessage($chatId, 'MessageMediaFromURL', $mediaUrl, $options, $extraPayload);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendImage(string $chatId, string $imageUrl, ?string $caption = null, array $options = []): array
    {
        return $this->sendMediaFromUrl($chatId, $imageUrl, $caption, $options);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendVideo(string $chatId, string $videoUrl, ?string $caption = null, array $options = []): array
    {
        return $this->sendMediaFromUrl($chatId, $videoUrl, $caption, $options);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendAudio(string $chatId, string $audioUrl, bool $asVoice = false, array $options = []): array
    {
        if ($asVoice) {
            $options['sendAudioAsVoice'] = true;
        }

        return $this->sendMediaFromUrl($chatId, $audioUrl, null, $options);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendVoiceNote(string $chatId, string $audioUrl, array $options = []): array
    {
        return $this->sendAudio($chatId, $audioUrl, true, $options);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendDocument(
        string $chatId,
        string $documentUrl,
        ?string $filename = null,
        ?string $caption = null,
        array $options = []
    ): array {
        $options['sendMediaAsDocument'] = true;
        $mediaFromUrlOptions = [];

        if ($filename !== null && $filename !== '') {
            $mediaFromUrlOptions['filename'] = $filename;
        }

        return $this->sendMediaFromUrl($chatId, $documentUrl, $caption, $options, $mediaFromUrlOptions);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendSticker(string $chatId, string $stickerUrl, array $options = []): array
    {
        $options['sendMediaAsSticker'] = true;

        return $this->sendMediaFromUrl($chatId, $stickerUrl, null, $options);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function sendMedia(
        string $chatId,
        string $mimeType,
        string $base64Data,
        ?string $filename = null,
        ?int $filesize = null,
        ?string $caption = null,
        array $options = []
    ): array {
        if ($caption !== null) {
            $options['caption'] = $caption;
        }

        return $this->sendClientMessage($chatId, 'MessageMedia', [
            'mimetype' => $mimeType,
            'data' => $base64Data,
            'filename' => $filename,
            'filesize' => $filesize,
        ], $options);
    }

    public function downloadMedia(string $chatId, string $messageId): array
    {
        return $this->makeMessageRequest('downloadMedia', $chatId, $messageId);
    }

    /**
     * @param array<string, mixed> $options
     */
    public function editMessage(string $chatId, string $messageId, string $content, array $options = []): array
    {
        $payload = [
            'content' => $content,
        ];

        if ($options !== []) {
            $payload['options'] = $options;
        }

        return $this->makeMessageRequest('edit', $chatId, $messageId, $payload);
    }

    public function deleteMessage(
        string $chatId,
        string $messageId,
        bool $everyone = false,
        bool $clearMedia = false
    ): array {
        return $this->makeMessageRequest('delete', $chatId, $messageId, [
            'everyone' => $everyone,
            'clearMedia' => $clearMedia,
        ]);
    }

    public function sendReaction(string $chatId, string $messageId, string $reaction): array
    {
        return $this->makeMessageRequest('react', $chatId, $messageId, [
            'reaction' => $reaction,
        ]);
    }

    public function forwardMessage(string $chatId, string $messageId, string $destinationChatId): array
    {
        $normalizedDestination = $this->normalizeSendChatId($destinationChatId);

        if ($normalizedDestination === null) {
            return ['success' => false, 'error' => 'destinationChatId is required'];
        }

        return $this->makeMessageRequest('forward', $chatId, $messageId, [
            'destinationChatId' => $normalizedDestination,
        ]);
    }

    public function starMessage(string $chatId, string $messageId): array
    {
        return $this->makeMessageRequest('star', $chatId, $messageId);
    }

    public function unstarMessage(string $chatId, string $messageId): array
    {
        return $this->makeMessageRequest('unstar', $chatId, $messageId);
    }

    public function getMessageReactions(string $chatId, string $messageId): array
    {
        return $this->makeMessageRequest('getReactions', $chatId, $messageId);
    }

    /**
     * @param string[] $pollOptions
     * @param array<string, mixed> $config
     */
    public function createPoll(string $chatId, string $question, array $pollOptions, array $config = []): array
    {
        return $this->sendClientMessage($chatId, 'Poll', [
            'pollName' => $question,
            'pollOptions' => array_values($pollOptions),
            'options' => $config,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function getPollVotes(string $chatId, string $messageId): array
    {
        return $this->makeMessageRequest('getPollVotes', $chatId, $messageId);
    }

    /**
     * @param string[] $selectedOptions
     * @return array<string, mixed>
     */
    public function voteInPoll(string $chatId, string $messageId, array $selectedOptions): array
    {
        return $this->makeMessageRequest('runMethod', $chatId, $messageId, [
            'method' => 'vote',
            'options' => array_values($selectedOptions),
        ]);
    }

    public function setStatus(string $status): array
    {
        return $this->makeRequest('POST', "/client/setStatus/{$this->sessionId}", [
            'status' => $status,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function getStatus(string $contactId): array
    {
        return $this->getContactAbout($contactId);
    }

    /**
     * @return array<string, mixed>
     */
    public function getContactAbout(string $contactId): array
    {
        return $this->makeRequest('POST', "/contact/getAbout/{$this->sessionId}", [
            'contactId' => $contactId,
        ]);
    }

    public function setProfilePicture(string $pictureMimetype, string $pictureData): array
    {
        return $this->makeRequest('POST', "/client/setProfilePicture/{$this->sessionId}", [
            'pictureMimetype' => $pictureMimetype,
            'pictureData' => $pictureData,
        ]);
    }

    public function updateProfilePicture(string $pictureMimetype, string $pictureData): array
    {
        return $this->setProfilePicture($pictureMimetype, $pictureData);
    }

    /**
     * @return array<string, mixed>
     */
    public function getProfilePicture(string $contactId): array
    {
        return $this->makeRequest('POST', "/client/getProfilePicUrl/{$this->sessionId}", [
            'contactId' => $contactId,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function getContactProfilePicture(string $contactId): array
    {
        return $this->makeRequest('POST', "/contact/getProfilePicUrl/{$this->sessionId}", [
            'contactId' => $contactId,
        ]);
    }

    public function blockUser(string $contactId): array
    {
        return $this->makeContactRequest('block', $contactId);
    }

    public function unblockUser(string $contactId): array
    {
        return $this->makeContactRequest('unblock', $contactId);
    }

    public function checkNumberOnWhatsApp(string $number): array
    {
        $number = trim($number);

        if ($number === '') {
            return ['success' => false, 'error' => 'number is required'];
        }

        return $this->makeRequest('POST', "/client/isRegisteredUser/{$this->sessionId}", [
            'number' => $number,
        ]);
    }

    public function isRegisteredUser(string $number): array
    {
        return $this->checkNumberOnWhatsApp($number);
    }

    public function getBlockedContacts(): array
    {
        return $this->makeRequest('POST', "/client/getBlockedContacts/{$this->sessionId}", []);
    }

    public function archiveChat(string $chatId): array
    {
        return $this->makeClientChatRequest('archiveChat', $chatId);
    }

    public function unarchiveChat(string $chatId): array
    {
        return $this->makeClientChatRequest('unarchiveChat', $chatId);
    }

    public function muteChat(string $chatId, ?int $unmuteTimestamp = null): array
    {
        $data = [];

        if ($unmuteTimestamp !== null) {
            $data['unmuteDate'] = (string) $unmuteTimestamp;
        }

        return $this->makeClientChatRequest('muteChat', $chatId, $data);
    }

    public function unmuteChat(string $chatId): array
    {
        return $this->makeClientChatRequest('unmuteChat', $chatId);
    }

    public function pinChat(string $chatId): array
    {
        return $this->makeClientChatRequest('pinChat', $chatId);
    }

    public function unpinChat(string $chatId): array
    {
        return $this->makeClientChatRequest('unpinChat', $chatId);
    }

    public function markChatRead(string $chatId): array
    {
        return $this->makeClientChatRequest('sendSeen', $chatId);
    }

    public function sendSeen(string $chatId): array
    {
        return $this->markChatRead($chatId);
    }

    public function markChatUnread(string $chatId): array
    {
        return $this->makeClientChatRequest('markChatUnread', $chatId);
    }

    public function clearChatMessages(string $chatId): array
    {
        $normalizedChatId = $this->normalizeSendChatId($chatId);

        if ($normalizedChatId === null) {
            return ['success' => false, 'error' => 'chatId is required'];
        }

        return $this->makeRequest('POST', "/chat/clearMessages/{$this->sessionId}", [
            'chatId' => $normalizedChatId,
        ]);
    }

    public function terminateSession(): bool
    {
        $response = $this->makeRequest('GET', "/session/terminate/{$this->sessionId}");

        return $response['success'] ?? false;
    }

    public function getProfilePicUrl(string $contactId): ?string
    {
        $response = $this->getProfilePicture($contactId);

        if (isset($response['success']) && $response['success'] && isset($response['result'])) {
            return $response['result'];
        }

        return null;
    }

    private function fetchChatMessagesBatch(string $chatId, ?int $limit = null): array
    {
        $payload = [
            'chatId' => $chatId,
        ];

        if ($limit !== null) {
            $payload['searchOptions'] = [
                'limit' => $limit,
            ];
        }

        $response = $this->makeRequest('POST', "/chat/fetchMessages/{$this->sessionId}", $payload);
        $messages = $response['messages'] ?? $response['data'] ?? [];

        return is_array($messages) ? $messages : [];
    }

    private function isGroupChat(mixed $chat): bool
    {
        if (!is_array($chat) && !is_object($chat)) {
            return false;
        }

        if ((bool) $this->readValue($chat, 'isGroup', false)) {
            return true;
        }

        return str_ends_with(strtolower($this->normalizeId($this->readValue($chat, 'id'))), '@g.us');
    }

    private function readValue(array|object|null $value, string $key, mixed $default = null): mixed
    {
        if (is_array($value)) {
            return $value[$key] ?? $default;
        }

        if (is_object($value)) {
            return $value->{$key} ?? $default;
        }

        return $default;
    }

    private function normalizeId(mixed $value): string
    {
        if (is_array($value)) {
            return (string) ($value['_serialized'] ?? $value['id'] ?? '');
        }

        if (is_object($value)) {
            return (string) ($value->_serialized ?? $value->id ?? '');
        }

        return trim((string) ($value ?? ''));
    }

    /**
     * @param array<string, mixed> $options
     * @param array<string, mixed> $extraPayload
     */
    private function sendClientMessage(
        string $chatId,
        string $contentType,
        mixed $content,
        array $options = [],
        array $extraPayload = []
    ): array {
        $normalizedChatId = $this->normalizeSendChatId($chatId);

        if ($normalizedChatId === null) {
            $this->log->warning('WhatsAppClient: Empty phone/chatId provided.');

            return ['success' => false];
        }

        $payload = [
            'chatId' => $normalizedChatId,
            'contentType' => $contentType,
            'content' => $content,
        ];

        if ($options !== []) {
            $payload['options'] = $options;
        }

        return $this->makeRequest(
            'POST',
            "/client/sendMessage/{$this->sessionId}",
            array_merge($payload, $extraPayload)
        );
    }

    private function normalizeSendChatId(string $chatId): ?string
    {
        $chatId = trim($chatId);

        if ($chatId === '') {
            return null;
        }

        if (str_contains($chatId, '@')) {
            return $chatId;
        }

        $cleanPhone = preg_replace('/[^0-9]/', '', $chatId);

        if (empty($cleanPhone)) {
            return null;
        }

        return $cleanPhone . '@c.us';
    }

    /**
     * @param array<string, mixed> $data
     */
    private function makeMessageRequest(string $action, string $chatId, string $messageId, array $data = []): array
    {
        $normalizedChatId = $this->normalizeSendChatId($chatId);
        $messageId = trim($messageId);

        if ($normalizedChatId === null || $messageId === '') {
            return ['success' => false, 'error' => 'chatId and messageId are required'];
        }

        return $this->makeRequest('POST', "/message/{$action}/{$this->sessionId}", array_merge([
            'chatId' => $normalizedChatId,
            'messageId' => $messageId,
        ], $data));
    }

    private function makeContactRequest(string $action, string $contactId): array
    {
        $normalizedContactId = $this->normalizeSendChatId($contactId);

        if ($normalizedContactId === null) {
            return ['success' => false, 'error' => 'contactId is required'];
        }

        return $this->makeRequest('POST', "/contact/{$action}/{$this->sessionId}", [
            'contactId' => $normalizedContactId,
        ]);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function makeClientChatRequest(string $action, string $chatId, array $data = []): array
    {
        $normalizedChatId = $this->normalizeSendChatId($chatId);

        if ($normalizedChatId === null) {
            return ['success' => false, 'error' => 'chatId is required'];
        }

        return $this->makeRequest('POST', "/client/{$action}/{$this->sessionId}", array_merge([
            'chatId' => $normalizedChatId,
        ], $data));
    }

    private function makeRequest(string $method, string $endpoint, ?array $data = null): array
    {
        $url = $this->getApiUrl() . $endpoint;
        $apiKey = $this->getApiKey();

        if (empty($apiKey)) {
            $this->log->error('WhatsAppClient: API Key is not configured.');

            return ['success' => false, 'error' => 'API Key not configured'];
        }

        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'X-API-KEY: ' . $apiKey,
            'Content-Type: application/json',
        ]);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
        } elseif ($method !== 'GET') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        }

        if ($data !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        if ($curlError) {
            $this->log->error("WhatsAppClient cURL Error ({$method} {$url}): " . $curlError);

            return ['success' => false, 'error' => $curlError];
        }

        if ($httpCode !== 200) {
            if (
                $httpCode === 404 &&
                (strpos($url, 'fetchMessages') !== false || strpos($url, 'syncHistory') !== false)
            ) {
                return ['success' => false, 'code' => $httpCode];
            }

            $this->log->error('WhatsAppClient API error fetching ' . $url, ['code' => $httpCode, 'response' => $response]);

            return ['success' => false, 'code' => $httpCode];
        }

        return json_decode($response, true) ?? [];
    }
}
