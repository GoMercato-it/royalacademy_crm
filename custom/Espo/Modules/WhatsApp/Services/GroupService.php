<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\Utils\DataCache;
use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;
use Throwable;

class GroupService
{
    private const CACHE_TTL_SECONDS = 300;
    private const CACHE_KEY_PREFIX = 'whatsapp-groups-';

    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private DataCache $dataCache,
        private Log $log
    ) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getAllGroups(bool $forceRefresh = false): array
    {
        if (!$forceRefresh) {
            $cached = $this->readCachedGroups();

            if ($cached !== null) {
                return $cached;
            }
        }

        try {
            $list = $this->formatGroups($this->whatsAppClient->getAllGroups());
            $this->writeCachedGroups($list);

            return $list;
        } catch (Throwable $e) {
            $this->log->error('WhatsApp GroupService::getAllGroups failed: ' . $e->getMessage());

            return $this->readCachedGroups(true) ?? [];
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function getGroupDetails(string $groupId): array
    {
        $response = $this->whatsAppClient->getGroupMetadata($groupId);
        $payload = $this->extractPayload($response);

        if ($payload === []) {
            return $response;
        }

        return $this->formatGroup($payload);
    }

    /**
     * @param string[] $participants
     * @return array<string, mixed>
     */
    public function createGroup(string $title, array $participants): array
    {
        $response = $this->whatsAppClient->createGroup($title, $participants);
        $this->invalidateCache();

        return $response;
    }

    /**
     * @param string[] $participants
     * @return array<string, mixed>
     */
    public function addGroupParticipants(string $groupId, array $participants): array
    {
        $response = $this->whatsAppClient->addGroupParticipants($groupId, $participants);
        $this->invalidateCache();

        return $response;
    }

    /**
     * @return array<string, mixed>
     */
    public function leaveGroup(string $groupId): array
    {
        $response = $this->whatsAppClient->leaveGroup($groupId);
        $this->invalidateCache();

        return $response;
    }

    /**
     * @return array<string, mixed>
     */
    public function updateGroupSetting(string $groupId, string $setting): array
    {
        $response = $this->whatsAppClient->updateGroupSetting($groupId, $setting);
        $this->invalidateCache();

        return $response;
    }

    public function invalidateCache(): void
    {
        $this->dataCache->clear($this->getCacheKey());
    }

    /**
     * @param array<int, mixed> $rawGroups
     * @return array<int, array<string, mixed>>
     */
    private function formatGroups(array $rawGroups): array
    {
        $list = array_map(
            fn ($group): array => $this->formatGroup($group),
            array_filter($rawGroups, fn ($group): bool => is_array($group) || is_object($group))
        );

        usort($list, function (array $a, array $b): int {
            $byTimestamp = ((int) ($b['timestamp'] ?? 0)) <=> ((int) ($a['timestamp'] ?? 0));

            if ($byTimestamp !== 0) {
                return $byTimestamp;
            }

            return strcasecmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
        });

        return array_values(array_filter($list, fn (array $group): bool => ($group['id'] ?? '') !== ''));
    }

    /**
     * @param array<string, mixed>|object $group
     * @return array<string, mixed>
     */
    private function formatGroup(array|object $group): array
    {
        $id = $this->normalizeId(
            $this->readValue($group, 'id')
                ?: $this->readValue($group, 'chatId')
                ?: $this->readValue($group, '_serialized')
        );
        $participants = $this->readValue($group, 'participants', []);
        $name = $this->readString($group, 'name')
            ?: $this->readString($group, 'formattedTitle')
            ?: $this->readString($group, 'subject')
            ?: $id;

        return [
            'id' => $id,
            'chatId' => $id,
            'name' => $name,
            'formattedTitle' => $this->readString($group, 'formattedTitle') ?: $name,
            'description' => $this->readString($group, 'description'),
            'isGroup' => true,
            'isBroadcast' => (bool) $this->readValue($group, 'isBroadcast', false),
            'isReadOnly' => (bool) $this->readValue($group, 'isReadOnly', false),
            'isLocked' => (bool) $this->readValue($group, 'isLocked', false),
            'isMuted' => (bool) $this->readValue($group, 'isMuted', false),
            'unreadCount' => (int) $this->readValue($group, 'unreadCount', 0),
            'participantCount' => is_countable($participants) ? count($participants) : 0,
            'participants' => is_array($participants) ? array_values($participants) : [],
            'timestamp' => $this->normalizeTimestamp($this->readValue($group, 'timestamp')),
            'owner' => $this->normalizeId($this->readValue($group, 'owner')),
            'lastMessage' => $this->readValue($group, 'lastMessage'),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    private function readCachedGroups(bool $allowStale = false): ?array
    {
        $cached = $this->dataCache->tryGet($this->getCacheKey());

        if (!is_array($cached) || !isset($cached['list']) || !is_array($cached['list'])) {
            return null;
        }

        $savedAt = (int) ($cached['savedAt'] ?? 0);

        if (!$allowStale && (!$savedAt || time() - $savedAt > self::CACHE_TTL_SECONDS)) {
            return null;
        }

        return array_values(array_filter(
            $cached['list'],
            fn ($group): bool => is_array($group)
        ));
    }

    /**
     * @param array<int, array<string, mixed>> $list
     */
    private function writeCachedGroups(array $list): void
    {
        $this->dataCache->store($this->getCacheKey(), [
            'savedAt' => time(),
            'list' => array_values($list),
        ]);
    }

    private function getCacheKey(): string
    {
        $sessionId = preg_replace('/[^a-zA-Z0-9_-]/', '-', $this->whatsAppClient->getSessionId());

        return self::CACHE_KEY_PREFIX . $sessionId;
    }

    /**
     * @return array<string, mixed>
     */
    private function extractPayload(array $response): array
    {
        foreach (['data', 'result', 'group', 'chat'] as $key) {
            if (isset($response[$key]) && is_array($response[$key])) {
                return $response[$key];
            }
        }

        return $response;
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

    private function readString(array|object|null $value, string $key): string
    {
        $raw = $this->readValue($value, $key, '');

        if (is_array($raw) || is_object($raw)) {
            return '';
        }

        return trim((string) $raw);
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

    private function normalizeTimestamp(mixed $value): int
    {
        if (is_float($value)) {
            return (int) floor($value);
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        $parsed = strtotime((string) $value);

        return $parsed ?: 0;
    }
}
