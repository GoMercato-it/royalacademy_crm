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
    ) {}

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

    public function getChatMessages(string $chatId, int $limit = 100, bool $allowSyncFallback = true): array
    {
        $response = $this->makeRequest('POST', "/chat/fetchMessages/{$this->sessionId}", [
            'chatId' => $chatId,
            'searchOptions' => [
                'limit' => $limit,
            ],
        ]);
        $messages = $response['messages'] ?? $response['data'] ?? [];

        if ($allowSyncFallback && empty($messages)) {
            $this->makeRequest('POST', "/chat/syncHistory/{$this->sessionId}", [
                'chatId' => $chatId,
            ]);

            $response = $this->makeRequest('POST', "/chat/fetchMessages/{$this->sessionId}", [
                'chatId' => $chatId,
                'searchOptions' => [
                    'limit' => $limit,
                ],
            ]);
            $messages = $response['messages'] ?? $response['data'] ?? [];
        }

        return $messages;
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
            $this->log->error('WhatsAppClient cURL Error: ' . $curlError);

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
