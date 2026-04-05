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
use Espo\Modules\WhatsApp\Services\MessageDispatchService;
use Espo\Modules\WhatsApp\Services\SessionLifecycleService;
use Espo\Modules\WhatsApp\Services\WebSocketService;
use Espo\Modules\WhatsApp\Services\WorkflowActionService;

class WhatsApp
{
    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private MessageDispatchService $messageDispatchService,
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
        $this->whatsAppClient->startSession();
        $qrCode = $this->whatsAppClient->getQRCode();

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
        return [
            'success' => true,
            'list' => $this->whatsAppClient->getChats(),
        ];
    }

    public function getActionGetChatMessages(Request $request, Response $response): array
    {
        $chatId = $request->getQueryParam('chatId');

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        $limit = (int) ($request->getQueryParam('limit') ?? 50);

        try {
            $apiMessages = $this->whatsAppClient->getChatMessages($chatId, $limit);

            if (!empty($apiMessages)) {
                $this->messageDispatchService->ingestApiMessages($chatId, $apiMessages);
            }
        } catch (\Throwable $e) {
            $this->log->warning('WhatsApp getChatMessages API fetch failed: ' . $e->getMessage());
        }

        return [
            'success' => true,
            'list' => $this->messageDispatchService->getStoredMessages($chatId, $limit),
        ];
    }

    public function getActionGetContacts(Request $request, Response $response): array
    {
        return [
            'success' => true,
            'list' => $this->whatsAppClient->getContacts(),
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
            ];
        }

        return $result;
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

        $this->configWriter->save();

        return ['success' => true];
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
