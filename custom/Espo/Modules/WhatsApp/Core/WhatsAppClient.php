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

    public function getChatMessages(string $chatId, int $limit = 40, bool $allowSyncFallback = true, bool $forceSync = false): array
    {
        // Try to fetch in‑memory batch first (no limit = all cached messages)
        $messages = $this->fetchChatMessagesBatch($chatId, null);

        // If we have enough messages in RAM, or we explicitly do not want to sync, return what we have
        if (!empty($messages) && (!$allowSyncFallback || count($messages) >= $limit)) {
            if (count($messages) > $limit) {
                $messages = array_slice($messages, -$limit);
            }
            return $messages;
        }

        // If we are not allowed to sync, just return whatever we have (may be empty)
        if (!$allowSyncFallback) {
            return $messages;
        }

        // If we need to force a sync (manual endpoint) or in‑memory was empty, try limited fetch
        if ($forceSync || empty($messages)) {
            $this->log->warning('WhatsAppClient: Forcing limited fetch.', ['chatId' => $chatId, 'limit' => $limit]);
            $messages = $this->fetchChatMessagesBatch($chatId, $limit);
            if (!empty($messages)) {
                return $messages;
            }
        }

        // If still empty, trigger full history sync
        $this->log->warning('WhatsAppClient: Triggering full history sync.', ['chatId' => $chatId]);
        $this->makeRequest('POST', "/chat/syncHistory/{$this->sessionId}", ['chatId' => $chatId]);
        // One final attempt after sync
        return $this->fetchChatMessagesBatch($chatId, $limit);
    }

    public function getContacts(): array
    {
        $response = $this->makeRequest('GET', "/client/getContacts/{$this->sessionId}");

        return $response['contacts'] ?? $response['data'] ?? (is_array($response) && !isset($response['success']) ? $response : []);
    }

    public function sendMessage(string $chatId, string $message): array
    {
        if (strpos($chatId, '@') === false) {
            $cleanPhone = preg_replace('/[^0-9]/', '', $chatId);

            if (empty($cleanPhone)) {
                $this->log->warning('WhatsAppClient: Empty phone/chatId provided.');

                return ['success' => false];
            }

            $chatId = $cleanPhone . '@c.us';
        }

        return $this->makeRequest('POST', "/client/sendMessage/{$this->sessionId}", [
            'chatId' => $chatId,
            'contentType' => 'string',
            'content' => $message,
        ]);
    }

    public function terminateSession(): bool
    {
        $response = $this->makeRequest('GET', "/session/terminate/{$this->sessionId}");

        return $response['success'] ?? false;
    }

    public function getProfilePicUrl(string $contactId): ?string
    {
        $response = $this->makeRequest('POST', "/client/getProfilePicUrl/{$this->sessionId}", ['contactId' => $contactId]);

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

        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
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
