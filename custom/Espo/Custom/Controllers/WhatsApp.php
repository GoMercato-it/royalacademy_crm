<?php
namespace Espo\Custom\Controllers;

use Espo\Core\Controllers\Base;
use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Core\Exceptions\NotFound;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Core\InjectableFactory;
use Espo\Modules\WhatsApp\Services\WebSocketService;
use Espo\Modules\WhatsApp\Services\MessageDispatchService;
use Espo\Modules\WhatsApp\Services\SessionLifecycleService;
use Espo\Modules\WhatsApp\Services\AvatarStorageService;

class WhatsApp extends Base
{
    private function getWhatsAppClient(): WhatsAppClient
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WhatsAppClient::class);
    }

    /**
     * Get WebSocketService for real-time event broadcasting
     */
    private function getWebSocketService(): WebSocketService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(WebSocketService::class);
    }

    private function getMessageDispatchService(): MessageDispatchService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(MessageDispatchService::class);
    }

    private function getSessionLifecycleService(): SessionLifecycleService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(SessionLifecycleService::class);
    }

    private function getAvatarStorageService(): AvatarStorageService
    {
        /** @var InjectableFactory $factory */
        $factory = $this->getContainer()->get('injectableFactory');
        return $factory->create(AvatarStorageService::class);
    }

    private function normalizeTimestampValue($timestamp): int
    {
        if (is_numeric($timestamp)) {
            return (int) $timestamp;
        }

        $parsed = strtotime((string) $timestamp);

        return $parsed ?: time();
    }

    private function isTemporaryMessageId(?string $messageId): bool
    {
        if (!$messageId) {
            return false;
        }

        return str_starts_with($messageId, 'sent_') ||
            str_starts_with($messageId, 'recv_') ||
            str_starts_with($messageId, 'temp-');
    }

    private function findStoredMessage($entityManager, ?string $messageId, string $chatId, bool $fromMe, string $body, int $timestamp)
    {
        $repository = $entityManager->getRepository('WhatsAppMessage');

        if ($messageId) {
            $existing = $repository->where(['messageId' => $messageId])->findOne();

            if ($existing) {
                return $existing;
            }
        }

        if ($body === '') {
            return null;
        }

        $candidates = $repository
            ->where([
                'chatId' => $chatId,
                'fromMe' => $fromMe,
                'body' => $body,
            ])
            ->order('timestamp', 'DESC')
            ->limit(10)
            ->find();

        foreach ($candidates as $candidate) {
            $candidateTimestamp = $candidate->get('timestamp') ? strtotime($candidate->get('timestamp')) : null;

            if (!$candidateTimestamp) {
                continue;
            }

            if (abs($candidateTimestamp - $timestamp) <= 60) {
                return $candidate;
            }
        }

        return null;
    }

    private function upsertStoredMessage($entityManager, array $data)
    {
        $chatId = $data['chatId'] ?? null;

        if (!$chatId) {
            throw new \RuntimeException('chatId is required for WhatsApp message persistence');
        }

        $fromMe = (bool) ($data['fromMe'] ?? false);
        $body = (string) ($data['body'] ?? '');
        $timestamp = $this->normalizeTimestampValue($data['timestamp'] ?? time());
        $messageId = $data['messageId'] ?? null;
        $status = $data['status'] ?? ($fromMe ? 'Sent' : 'Received');

        $entity = $this->findStoredMessage($entityManager, $messageId, $chatId, $fromMe, $body, $timestamp);

        if (!$entity) {
            $entity = $entityManager->getEntity('WhatsAppMessage');
        }

        $existingMessageId = $entity->get('messageId');

        $entity->set([
            'body' => $body,
            'chatId' => $chatId,
            'fromMe' => $fromMe,
            'timestamp' => date('Y-m-d H:i:s', $timestamp),
            'status' => $status,
        ]);

        if ($messageId && (!$existingMessageId || $existingMessageId === $messageId || $this->isTemporaryMessageId($existingMessageId))) {
            $entity->set('messageId', $messageId);
        } else if (!$existingMessageId) {
            $entity->set('messageId', $messageId ?: uniqid($fromMe ? 'sent_' : 'recv_'));
        }

        $entityManager->saveEntity($entity);

        return $entity;
    }

    public function getActionLogin(Request $request, Response $response): array
    {
        $this->getWhatsAppClient()->startSession();
        $qrCode = $this->getWhatsAppClient()->getQRCode();

        if ($qrCode) {
            $this->getSessionLifecycleService()->markQrReady(
                $this->getWhatsAppClient()->getSessionId(),
                ['source' => 'login']
            );
        }

        return [
            'success' => true,
            'qrCode' => $qrCode
        ];
    }

    public function getActionQrCode(Request $request, Response $response): array
    {
        $qr = $this->getWhatsAppClient()->getQRCode();

        if ($qr) {
            $this->getSessionLifecycleService()->markQrReady(
                $this->getWhatsAppClient()->getSessionId(),
                ['source' => 'qrCode']
            );
        }

        return [
            'qr' => $qr,
        ];
    }

    public function getActionStatus(Request $request, Response $response): array
    {
        // Check if enabled (default to true if null)
        $enabled = $this->getConfig()->get('whatsappEnabled');
        if ($enabled === false) {
            $this->getSessionLifecycleService()->recordState(
                $this->getWhatsAppClient()->getSessionId(),
                'disabled',
                ['rawState' => 'DISABLED']
            );

            return [
                'status' => 'disabled',
                'isConnected' => false,
                'enabled' => false
            ];
        }

        $status = $this->getWhatsAppClient()->getSessionStatus();
        $isConnected = in_array(strtoupper($status), ['CONNECTED', 'AUTHENTICATED']);
        $this->getSessionLifecycleService()->syncTransportState(
            $this->getWhatsAppClient()->getSessionId(),
            $status
        );

        return [
            'status' => $status,
            'isConnected' => $isConnected,
            'enabled' => true
        ];
    }

    public function getActionGetChats(Request $request, Response $response): array
    {
        $chats = $this->getWhatsAppClient()->getChats();

        return [
            'success' => true,
            'list' => $chats
        ];
    }

    public function getActionGetChatMessages(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');
        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $limit = (int) ($request->getQueryParam('limit') ?? 50);
        $entityManager = $this->getContainer()->get('entityManager');

        // Step 1: Try fetching fresh messages from WAHA API and save new ones to DB
        try {
            $apiMessages = $this->getWhatsAppClient()->getChatMessages($chatId, $limit);
            if (!empty($apiMessages)) {
                $this->getMessageDispatchService()->ingestApiMessages($chatId, $apiMessages);
            }
        } catch (\Throwable $e) {
            $GLOBALS['log']->warning('WhatsApp getChatMessages API fetch failed: ' . $e->getMessage());
        }

        // Step 2: Always read final result from DB (now has API + webhook messages merged)
        $result = $this->getMessageDispatchService()->getStoredMessages($chatId, $limit);

        return [
            'success' => true,
            'list' => $result
        ];
    }

    public function getActionGetContacts(Request $request, Response $response): array
    {
        $contacts = $this->getWhatsAppClient()->getContacts();

        return [
            'success' => true,
            'list' => $contacts
        ];
    }

    public function getActionGetProfilePic(Request $request, Response $response): array
    {
        $id = $request->getQueryParam('id');
        if (!$id) {
            return ['url' => null];
        }

        $link = $this->getAvatarStorageService()->ensureAvatar($id);

        if ($link) {
            $version = $this->getAvatarStorageService()->getAvatarVersion($id) ?: time();

            return [
                'url' => '/api/v1/WhatsApp/action/profilePicContent?id=' . rawurlencode($id) . '&v=' . $version,
            ];
        }

        return ['url' => null];
    }

    public function getActionProfilePicContent(Request $request, Response $response): void
    {
        $id = $request->getQueryParam('id');

        if (!$id) {
            throw new NotFound('Avatar not found.');
        }

        $payload = $this->getAvatarStorageService()->getAvatarContent($id);

        if (!$payload) {
            throw new NotFound('Avatar not found.');
        }

        $response->setHeader('Content-Type', $payload['contentType'] ?? 'image/jpeg');
        $response->setHeader('Cache-Control', 'public, max-age=86400');
        $response->writeBody($payload['body'] ?? '');
    }

    public function postActionLogout(Request $request, Response $response): array
    {
        $result = $this->getWhatsAppClient()->terminateSession();

        if ($result) {
            $this->getSessionLifecycleService()->markDisconnected(
                $this->getWhatsAppClient()->getSessionId(),
                ['source' => 'logout']
            );
        }

        return ['success' => $result];
    }

    /**
     * Send a message via WhatsApp and broadcast via WebSocket
     * 
     * POST /WhatsApp/action/sendMessage
     * Parameters:
     *   - chatId (string): Chat/phone ID
     *   - message (string): Message text
     */
    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $phone = $data->phone ?? $data->chatId ?? null;
        $message = $data->message ?? null;

        if (!$phone || !$message) {
            throw new BadRequest('Phone/chatId and message required');
        }

        $result = $this->getMessageDispatchService()->sendMessage($phone, $message);

        if ($result['success'] ?? false) {
            return [
                'success' => true,
                'messageId' => $result['messageId'] ?? null,
            ];
        }

        return $result;
    }

    public function postActionSaveSettings(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();

        if (isset($data->whatsappApiUrl)) {
            @$this->getConfig()->set('whatsappApiUrl', $data->whatsappApiUrl);
        }
        if (isset($data->whatsappApiKey)) {
            @$this->getConfig()->set('whatsappApiKey', $data->whatsappApiKey);
        }
        if (isset($data->whatsappAutoMessageEnabled)) {
            @$this->getConfig()->set('whatsappAutoMessageEnabled', $data->whatsappAutoMessageEnabled);
        }
        if (isset($data->whatsappLeadTemplate)) {
            @$this->getConfig()->set('whatsappLeadTemplate', $data->whatsappLeadTemplate);
        }
        if (isset($data->whatsappEnabled)) {
            @$this->getConfig()->set('whatsappEnabled', $data->whatsappEnabled);
        }

        @$this->getConfig()->save();

        return ['success' => true];
    }

    /**
     * Webhook handler for incoming messages from WhatsApp
     * Also broadcasts incoming messages via WebSocket
     */
    public function postActionWebhook(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $GLOBALS['log']->info('WhatsApp webhook received', (array) $data);

        $this->getMessageDispatchService()->processWebhookData($data);

        return ['success' => true];
    }
}
