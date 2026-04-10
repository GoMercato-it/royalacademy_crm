<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;

class ChatListSnapshotService
{
    private const TTL_SECONDS = 20;

    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private Log $log
    ) {
    }

    /**
     * @return array{list: array<int, mixed>, fromCache: bool, stale: bool, cachedAt: ?int}
     */
    public function getChatList(bool $forceRefresh = false): array
    {
        $snapshot = $this->readSnapshot();
        $isFresh = $snapshot && ((time() - (int) ($snapshot['savedAt'] ?? 0)) < self::TTL_SECONDS);

        if (!$forceRefresh && $isFresh) {
            return [
                'list' => $snapshot['list'],
                'fromCache' => true,
                'stale' => false,
                'cachedAt' => (int) ($snapshot['savedAt'] ?? 0),
            ];
        }

        try {
            $list = $this->whatsAppClient->getChats();

            if (is_array($list)) {
                $this->writeSnapshot($list);

                return [
                    'list' => $list,
                    'fromCache' => false,
                    'stale' => false,
                    'cachedAt' => time(),
                ];
            }
        } catch (\Throwable $e) {
            $this->log->warning('WhatsApp chat snapshot refresh failed: ' . $e->getMessage());
        }

        if ($snapshot) {
            return [
                'list' => $snapshot['list'],
                'fromCache' => true,
                'stale' => true,
                'cachedAt' => (int) ($snapshot['savedAt'] ?? 0),
            ];
        }

        return [
            'list' => [],
            'fromCache' => false,
            'stale' => false,
            'cachedAt' => null,
        ];
    }

    public function clearSnapshot(): void
    {
        $path = $this->getSnapshotPath();

        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function getSnapshotPath(): string
    {
        $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '-', $this->whatsAppClient->getSessionId());

        return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR
            . 'espocrm-whatsapp-chats-'
            . $sessionId
            . '.json';
    }

    /**
     * @return array{savedAt: int, list: array<int, mixed>}|null
     */
    private function readSnapshot(): ?array
    {
        $path = $this->getSnapshotPath();

        if (!is_file($path)) {
            return null;
        }

        $raw = @file_get_contents($path);

        if ($raw === false || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        if (!is_array($decoded) || !isset($decoded['list']) || !is_array($decoded['list'])) {
            return null;
        }

        return [
            'savedAt' => (int) ($decoded['savedAt'] ?? 0),
            'list' => $decoded['list'],
        ];
    }

    /**
     * @param array<int, mixed> $list
     */
    private function writeSnapshot(array $list): void
    {
        $payload = json_encode(
            [
                'savedAt' => time(),
                'list' => array_values($list),
            ],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        if ($payload === false) {
            return;
        }

        @file_put_contents($this->getSnapshotPath(), $payload, LOCK_EX);
    }
}
