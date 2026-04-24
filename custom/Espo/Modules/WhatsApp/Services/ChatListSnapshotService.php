<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\PhoneNumber\Sanitizer as PhoneNumberSanitizer;
use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;

class ChatListSnapshotService
{
    private const TTL_SECONDS = 20;

    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private PhoneNumberSanitizer $phoneNumberSanitizer,
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
            $list = $this->enrichWhatsAppPhoneNumbers(
                $this->normalizeChatList($this->whatsAppClient->getChats())
            );

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

    /**
     * Keep the chat-list payload intentionally small. The bridge returns full
     * message/contact models; the UI only needs identity, counters and preview.
     *
     * @param array<int, mixed> $list
     * @return array<int, array<string, mixed>>
     */
    private function normalizeChatList(array $list): array
    {
        $normalized = array_map(
            fn ($chat) => $this->normalizeChat($chat),
            array_filter($list, fn ($chat) => is_array($chat) || is_object($chat))
        );

        return array_values(array_filter(
            $normalized,
            fn (array $chat) => !$this->shouldSkipChatId((string) ($chat['id'] ?? ''))
        ));
    }

    /**
     * @param array<string, mixed>|object $chat
     * @return array<string, mixed>
     */
    private function normalizeChat(array|object $chat): array
    {
        $id = $this->normalizeId($this->readValue($chat, 'id'));
        $lastMessage = $this->readValue($chat, 'lastMessage');
        $contact = $this->readValue($chat, 'contact');

        return [
            'id' => $id,
            'name' => $this->sanitizeDisplayName($this->readString($chat, 'name'), $id),
            'formattedTitle' => $this->sanitizeDisplayName($this->readString($chat, 'formattedTitle'), $id),
            'number' => $this->sanitizePhoneValue($this->readString($chat, 'number'), $id),
            'phoneNumber' => $this->sanitizePhoneValue($this->readString($chat, 'phoneNumber'), $id),
            'waPhoneNumber' => $this->sanitizePhoneValue($this->readString($chat, 'phoneNumber') ?: $this->readString($chat, 'number'), $id),
            'waPhoneId' => '',
            'waLid' => $this->isLidChatId($id) ? $id : '',
            'isGroup' => (bool) $this->readValue($chat, 'isGroup', str_ends_with($id, '@g.us')),
            'isReadOnly' => (bool) $this->readValue($chat, 'isReadOnly', false),
            'isLocked' => (bool) $this->readValue($chat, 'isLocked', false),
            'isMuted' => (bool) $this->readValue($chat, 'isMuted', false),
            'muteExpiration' => (int) $this->readValue($chat, 'muteExpiration', 0),
            'unreadCount' => (int) $this->readValue($chat, 'unreadCount', 0),
            'timestamp' => $this->normalizeTimestamp($this->readValue($chat, 'timestamp')),
            'archived' => (bool) $this->readValue($chat, 'archived', false),
            'pinned' => (bool) $this->readValue($chat, 'pinned', false),
            'contact' => $contact ? $this->normalizeContact($contact, $id) : null,
            'lastMessage' => $lastMessage ? $this->normalizeLastMessage($lastMessage, $id) : null,
        ];
    }

    /**
     * @param array<string, mixed>|object $contact
     * @return array<string, mixed>
     */
    private function normalizeContact(array|object $contact, string $chatId = ''): array
    {
        return [
            'id' => $this->normalizeId($this->readValue($contact, 'id')),
            'name' => $this->sanitizeDisplayName($this->readString($contact, 'name'), $chatId),
            'pushname' => $this->sanitizeDisplayName($this->readString($contact, 'pushname'), $chatId),
            'shortName' => $this->sanitizeDisplayName($this->readString($contact, 'shortName'), $chatId),
            'number' => $this->sanitizePhoneValue($this->readString($contact, 'number'), $chatId),
            'phoneNumber' => $this->sanitizePhoneValue($this->readString($contact, 'phoneNumber'), $chatId),
            'waPhoneNumber' => $this->sanitizePhoneValue($this->readString($contact, 'phoneNumber') ?: $this->readString($contact, 'number'), $chatId),
            'isMyContact' => (bool) $this->readValue($contact, 'isMyContact', false),
        ];
    }

    /**
     * @param array<string, mixed>|object $message
     * @return array<string, mixed>
     */
    private function normalizeLastMessage(array|object $message, string $chatId): array
    {
        $messageId = $this->normalizeId($this->readValue($message, 'id'));
        $timestamp = $this->normalizeTimestamp($this->readValue($message, 'timestamp'));

        return [
            'id' => $messageId,
            'messageId' => $messageId,
            'body' => $this->readString($message, 'body'),
            'caption' => $this->readString($message, 'caption'),
            'type' => $this->readString($message, 'type') ?: 'chat',
            'timestamp' => $timestamp,
            'fromMe' => (bool) $this->readValue($message, 'fromMe', false),
            'ack' => (int) $this->readValue($message, 'ack', 0),
            'hasMedia' => (bool) $this->readValue($message, 'hasMedia', false),
            'author' => $this->normalizeId($this->readValue($message, 'author')),
            'from' => $this->normalizeId($this->readValue($message, 'from')),
            'to' => $this->normalizeId($this->readValue($message, 'to')),
            'chatId' => $chatId,
            'bodyPreview' => $this->buildPreview(
                $this->readString($message, 'body')
                    ?: $this->readString($message, 'caption')
                    ?: '[' . ($this->readString($message, 'type') ?: 'Message') . ']'
            ),
        ];
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

    private function buildPreview(string $body): string
    {
        $preview = trim(preg_replace('/\s+/', ' ', $body));

        if (mb_strlen($preview) <= 255) {
            return $preview;
        }

        return mb_substr($preview, 0, 252) . '...';
    }

    private function sanitizeDisplayName(string $value, string $chatId): string
    {
        if (!$this->isLidChatId($chatId) || !$this->looksLikePhoneLabel($value)) {
            return $value;
        }

        return $this->digitsMatchChatId($value, $chatId) ? '' : $value;
    }

    private function sanitizePhoneValue(string $value, string $chatId): string
    {
        if (!$this->isLidChatId($chatId)) {
            return $value;
        }

        $value = trim($value);

        if ($value === '' || preg_match('/@(lid|g\\.us)$/i', $value)) {
            return '';
        }

        return $this->digitsMatchChatId($value, $chatId) ? '' : $value;
    }

    private function looksLikePhoneLabel(string $value): bool
    {
        $value = trim($value);

        if ($value === '') {
            return false;
        }

        $digits = preg_replace('/[^0-9]/', '', $value);

        return strlen($digits) >= 7 && preg_match('/^[+0-9 ()\\-.]+$/', $value) === 1;
    }

    private function isLidChatId(string $chatId): bool
    {
        return str_ends_with(strtolower(trim($chatId)), '@lid');
    }

    private function digitsMatchChatId(string $value, string $chatId): bool
    {
        $valueDigits = preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $value));
        $chatDigits = preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $chatId));

        return $valueDigits !== '' && $chatDigits !== '' && $valueDigits === $chatDigits;
    }

    private function normalizePhoneNumberValue(string $value): string
    {
        $value = trim($value);

        if ($value === '' || preg_match('/@(lid|g\\.us)$/i', $value)) {
            return '';
        }

        $digits = preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $value));

        if (strlen($digits) < 7) {
            return '';
        }

        return $this->phoneNumberSanitizer->sanitize('+' . $digits);
    }

    /**
     * WhatsApp Web can expose personal chats as @lid IDs while keeping the
     * real phone number behind a separate lid-to-phone API. Use that API as
     * the WA source of truth; never replace it with CRM data here.
     *
     * @param array<int, array<string, mixed>> $list
     * @return array<int, array<string, mixed>>
     */
    private function enrichWhatsAppPhoneNumbers(array $list): array
    {
        $lidList = array_values(array_filter(array_map(
            fn (array $chat) => (string) ($chat['waLid'] ?? ''),
            $list
        )));

        if ($lidList === []) {
            return $list;
        }

        try {
            $linkList = $this->whatsAppClient->getContactLidAndPhone($lidList);
        } catch (\Throwable $e) {
            $this->log->warning('WhatsApp lid-to-phone lookup failed: ' . $e->getMessage());

            return $list;
        }

        $phoneByLid = [];

        foreach ($linkList as $item) {
            if (!is_array($item)) {
                continue;
            }

            $lid = $this->normalizeId($item['lid'] ?? '');
            $phoneId = $this->normalizeId($item['pn'] ?? $item['phone'] ?? '');
            $phoneNumber = $this->normalizePhoneNumberValue($phoneId);

            if ($lid === '' || $phoneNumber === '') {
                continue;
            }

            $phoneByLid[$lid] = [
                'phoneId' => $phoneId,
                'phoneNumber' => $phoneNumber,
            ];
        }

        if ($phoneByLid === []) {
            return $list;
        }

        return array_map(function (array $chat) use ($phoneByLid): array {
            $lid = (string) ($chat['waLid'] ?? '');

            if ($lid === '' || !isset($phoneByLid[$lid])) {
                return $chat;
            }

            $phone = $phoneByLid[$lid]['phoneNumber'];
            $phoneId = $phoneByLid[$lid]['phoneId'];

            $chat['waPhoneNumber'] = $phone;
            $chat['waPhoneId'] = $phoneId;
            $chat['phoneNumber'] = $phone;
            $chat['number'] = $phone;

            if (isset($chat['contact']) && is_array($chat['contact'])) {
                $chat['contact']['waPhoneNumber'] = $phone;
                $chat['contact']['phoneNumber'] = $phone;
                $chat['contact']['number'] = $phone;
            }

            return $chat;
        }, $list);
    }

    private function shouldSkipChatId(string $chatId): bool
    {
        $chatId = trim($chatId);

        return $chatId === '' ||
            $chatId === 'status@broadcast' ||
            str_ends_with($chatId, '@newsletter') ||
            str_ends_with($chatId, '@broadcast');
    }
}
