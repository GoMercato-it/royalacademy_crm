<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;

class MessageDispatchService
{
    private const LOCAL_REACTION_SENDER = '__crm_user__';

    public function __construct(
        private EntityManager $entityManager,
        private WhatsAppClient $whatsappClient,
        private WebSocketService $webSocketService,
        private ConversationTrackingService $conversationTrackingService,
        private ChatListSnapshotService $chatListSnapshotService,
        private Log $log
    ) {
    }

    public function sendMessage(string $chatId, string $message): array
    {
        $result = $this->whatsappClient->sendMessage($chatId, $message);
        $sent = $result['success'] ?? false;

        if (!$sent) {
            return [
                'success' => false,
                'error' => $result['error'] ?? 'Unknown error',
            ];
        }

        $messagePayload = $result['message'] ?? $result['data'] ?? [];
        $messageId = $this->extractMessageId($messagePayload['id'] ?? null) ?: uniqid('sent_');
        $timestamp = microtime(true);
        $storedMessage = $this->storeMessage([
            'body' => $message,
            'chatId' => $chatId,
            'fromMe' => true,
            'timestamp' => $timestamp,
            'status' => 'Sent',
            'messageId' => $messageId,
            'payloadMeta' => [
                'source' => 'sendMessage',
                'sortSequence' => (int) round(microtime(true) * 1000),
            ],
        ]);

        $payload = $this->normalizeEntityForBroadcast($storedMessage);
        $this->chatListSnapshotService->clearSnapshot();
        $this->broadcastMessage($payload['chatId'], $payload);

        return [
            'success' => true,
            'messageId' => $payload['messageId'],
            'message' => $payload,
        ];
    }

    public function ingestApiMessages(string $chatId, array $apiMessages): void
    {
        if ($this->shouldSkipChatId($chatId)) {
            return;
        }

        $updated = false;

        foreach (array_values($apiMessages) as $index => $apiMessage) {
            $messageId = $this->extractMessageId($apiMessage['id'] ?? $apiMessage['messageId'] ?? null);

            if (!$messageId) {
                continue;
            }

            $body = $this->resolveDisplayBody($apiMessage);

            if ($this->shouldSkipNonDisplayMessage($apiMessage, $body)) {
                continue;
            }

            $fromMe = $this->resolvePayloadFromMe($apiMessage);

            try {
                $this->storeMessage([
                    'body' => $body,
                    'chatId' => $chatId,
                    'fromMe' => $fromMe,
                    'timestamp' => $apiMessage['timestamp'] ?? time(),
                    'status' => $fromMe ? 'Sent' : 'Received',
                    'messageId' => $messageId,
                    'payloadMeta' => [
                        'source' => 'getChatMessages',
                        'type' => $apiMessage['type'] ?? null,
                        'sortSequence' => $this->buildHistorySortSequence($apiMessage['timestamp'] ?? time(), $index),
                        'canonicalChatId' => $chatId,
                    ],
                ]);
                $updated = true;
            } catch (\PDOException $e) {
                if (!$this->isDuplicateException($e)) {
                    $this->log->warning('WhatsApp ingestApiMessages save error: ' . $e->getMessage());
                }
            }
        }

        if ($updated) {
            $this->chatListSnapshotService->clearSnapshot();
        }
    }

    public function getLiveMessages(string $chatId, array $apiMessages): array
    {
        if ($this->shouldSkipChatId($chatId)) {
            return [];
        }

        $result = [];

        foreach (array_values($apiMessages) as $index => $apiMessage) {
            $normalized = $this->normalizeApiMessageForBroadcast($chatId, $apiMessage, $index);

            if ($normalized) {
                $result[] = $normalized;
            }
        }

        usort($result, [$this, 'compareBroadcastMessages']);

        return $result;
    }

    public function processWebhookData(object $data): ?array
    {
        if (($data->dataType ?? null) === 'message_reaction') {
            return $this->processReactionWebhookData($data);
        }

        $payload = null;

        if (isset($data->data) && isset($data->data->body)) {
            $payload = $data->data;
        } elseif (isset($data->data) && isset($data->data->message) && isset($data->data->message->body)) {
            $payload = $data->data->message;
        }

        if (!$payload) {
            return null;
        }

        $body = $this->resolveDisplayBody($payload);

        if ($body === 'status@broadcast') {
            return null;
        }

        if ($this->shouldSkipNonDisplayMessage($payload, $body)) {
            return null;
        }

        $messageId = $this->extractMessageId($this->readMessageValue($payload, 'id'));
        $fromMe = $this->resolvePayloadFromMe($payload);
        $from = $this->normalizeChatIdValue($this->readMessageValue($payload, 'from'));
        $to = $this->normalizeChatIdValue($this->readMessageValue($payload, 'to'));
        $remote = $this->extractPayloadRemoteId($payload);
        $chatId = $this->resolvePayloadChatId($payload, $fromMe, $from, $to);
        $status = $fromMe ? 'Sent' : 'Received';

        if ($this->shouldSkipChatId($chatId)) {
            return null;
        }

        if ($messageId) {
            $existing = $this->entityManager
                ->getRepository('WhatsAppMessage')
                ->where(['messageId' => $messageId])
                ->findOne();

            if ($existing) {
                return $this->normalizeEntityForBroadcast($existing);
            }
        }

        try {
            $storedMessage = $this->storeMessage([
                'body' => $body,
                'chatId' => $chatId,
                'fromMe' => $fromMe,
                'timestamp' => $payload->timestamp ?? time(),
                'status' => $status,
                'messageId' => $messageId,
                'payloadMeta' => [
                    'source' => 'webhook',
                    'from' => $from,
                    'to' => $to,
                    'remote' => $remote,
                    'canonicalChatId' => $chatId,
                    'type' => is_object($payload->type ?? null) ? null : ($payload->type ?? null),
                    'sortSequence' => (int) round(microtime(true) * 1000),
                ],
            ]);
        } catch (\PDOException $e) {
            if (!$this->isDuplicateException($e)) {
                throw $e;
            }

            $existing = $this->findStoredMessage(
                $messageId,
                $chatId,
                $fromMe,
                $body,
                $this->normalizeTimestampValue($payload->timestamp ?? time())
            );

            if (!$existing) {
                throw $e;
            }

            return $this->normalizeEntityForBroadcast($existing);
        }

        $message = $this->normalizeEntityForBroadcast($storedMessage);
        $this->chatListSnapshotService->clearSnapshot();
        $this->broadcastMessage($chatId, $message);

        return $message;
    }

    private function processReactionWebhookData(object $data): ?array
    {
        $reaction = $data->data->reaction ?? null;

        if (!is_array($reaction) && !is_object($reaction)) {
            return null;
        }

        $messageId = $this->extractMessageId($this->readMessageValue($reaction, 'msgId'));

        if (!$messageId) {
            return null;
        }

        $message = $this->entityManager
            ->getRepository('WhatsAppMessage')
            ->where(['messageId' => $messageId])
            ->findOne();

        if (!$message) {
            $this->log->debug('WhatsApp reaction webhook skipped: message not found', [
                'messageId' => $messageId,
            ]);

            return null;
        }

        $payloadMeta = $this->normalizePayloadMeta($message->get('payloadMeta') ?: []);
        $payloadMeta['reactions'] = $this->mergeReactionPayload(
            $payloadMeta['reactions'] ?? [],
            $reaction
        );
        $payloadMeta['lastReactionAt'] = time();

        $message->set('payloadMeta', (object) $payloadMeta);
        $this->entityManager->saveEntity($message);

        $payload = $this->normalizeEntityForBroadcast($message);
        $this->broadcastMessage($payload['chatId'], $payload);

        return $payload;
    }

    public function storeMessage(array $data): Entity
    {
        $chatId = $data['chatId'] ?? null;

        if (!$chatId) {
            throw new \RuntimeException('chatId is required for WhatsApp message persistence');
        }

        $fromMe = $this->normalizeBooleanFlag($data['fromMe'] ?? null) ?? false;
        $body = (string) ($data['body'] ?? '');
        $timestamp = $this->normalizeTimestampValue($data['timestamp'] ?? time());
        $messageId = $data['messageId'] ?? null;
        $status = $data['status'] ?? ($fromMe ? 'Sent' : 'Received');
        $payloadMeta = $this->normalizePayloadMeta($data['payloadMeta'] ?? []);
        $sessionId = $data['sessionId'] ?? $this->whatsappClient->getSessionId();
        $bodyPreview = $data['bodyPreview'] ?? $this->buildBodyPreview($body);
        $incomingSource = $this->extractPayloadMetaValue($payloadMeta, 'source');

        $entity = $this->findStoredMessage($messageId, $chatId, $fromMe, $body, $timestamp);

        if (!$entity) {
            $entity = $this->entityManager->getEntity('WhatsAppMessage');
        }

        $isNewEntity = !$entity->hasId();
        $existingMessageId = $entity->get('messageId');
        $existingBody = (string) ($entity->get('body') ?? '');
        $existingBodyPreview = (string) ($entity->get('bodyPreview') ?? '');
        $existingPayloadMeta = $this->normalizePayloadMeta($entity->get('payloadMeta') ?: []);
        $existingSource = $this->extractPayloadMetaValue($existingPayloadMeta, 'source');
        $existingTimestamp = $entity->get('timestamp');
        $existingTimestampValue = $existingTimestamp ? strtotime((string) $existingTimestamp) : null;
        $preserveRealtimeMetadata = (
            !$isNewEntity &&
            $incomingSource === 'getChatMessages' &&
            in_array($existingSource, ['sendMessage', 'webhook'], true)
        );

        if ($body === '' && $existingBody !== '') {
            $body = $existingBody;
        }

        if ($bodyPreview === '' && $existingBodyPreview !== '') {
            $bodyPreview = $existingBodyPreview;
        }

        if ($preserveRealtimeMetadata && $existingTimestampValue) {
            $timestamp = $existingTimestampValue;
        }

        $payloadMeta = array_merge($existingPayloadMeta, $payloadMeta);

        if ($preserveRealtimeMetadata) {
            $payloadMeta['source'] = $existingSource;

            if (array_key_exists('sortSequence', $existingPayloadMeta)) {
                $payloadMeta['sortSequence'] = $existingPayloadMeta['sortSequence'];
            } elseif (array_key_exists('sortSequence', $payloadMeta)) {
                unset($payloadMeta['sortSequence']);
            }
        }

        $storedSource = $this->extractPayloadMetaValue($payloadMeta, 'source');
        $existingConversationId = trim((string) ($data['conversationId'] ?? $entity->get('conversationId') ?? ''));
        $conversation = null;

        if (!$isNewEntity && $existingConversationId !== '') {
            $conversation = $this->entityManager->getEntityById('WhatsAppConversation', $existingConversationId);
        }

        if (!$conversation) {
            $conversation = $this->conversationTrackingService->touchConversation(
                $sessionId,
                $chatId,
                $timestamp,
                [
                    'bodyPreview' => $bodyPreview,
                    'fromMe' => $fromMe,
                    'source' => $storedSource,
                    'incrementMessageCount' => $isNewEntity ? 1 : 0,
                ]
            );
        }

        $conversationId = $conversation->getId() ?: $existingConversationId;

        $entity->set([
            'body' => $body,
            'bodyPreview' => $bodyPreview,
            'chatId' => $chatId,
            'fromMe' => $fromMe,
            'timestamp' => date('Y-m-d H:i:s', $timestamp),
            'status' => $status,
            'sessionId' => $sessionId,
            'conversationId' => $conversationId,
            'payloadMeta' => $payloadMeta ? (object) $payloadMeta : (object) [],
        ]);

        if ($messageId && (!$existingMessageId || $existingMessageId === $messageId || $this->isTemporaryMessageId($existingMessageId))) {
            $entity->set('messageId', $messageId);
        } elseif (!$existingMessageId) {
            $entity->set('messageId', $messageId ?: uniqid($fromMe ? 'sent_' : 'recv_'));
        }

        $this->entityManager->saveEntity($entity);

        if (!$conversation->get('firstMessageMessageId')) {
            $conversation->set('firstMessageMessageId', $entity->get('messageId') ?: $entity->getId());
            $this->entityManager->saveEntity($conversation);
        }

        return $entity;
    }

    public function getStoredMessages(string $chatId, int $limit = 50): array
    {
        return $this->getStoredMessagesPage($chatId, $limit)['list'];
    }

    public function countStoredMessages(string $chatId): int
    {
        return $this->entityManager
            ->getRepository('WhatsAppMessage')
            ->where(['chatId' => $chatId])
            ->count();
    }

    /**
     * @return array{
     *     list: array<int, array<string, mixed>>,
     *     total: int,
     *     limit: int,
     *     offset: int,
     *     hasMore: bool,
     *     nextOffset: ?int,
     *     nextCursor: ?int
     * }
     */
    public function getStoredMessagesPage(
        string $chatId,
        int $limit = 50,
        int $offset = 0,
        ?int $before = null
    ): array {
        $limit = max(1, min(1000, $limit));
        $offset = max(0, $offset);
        $where = ['chatId' => $chatId];

        if ($before !== null && $before > 0) {
            $where['timestamp<'] = date('Y-m-d H:i:s', $before);
            $offset = 0;
        }

        $repository = $this->entityManager->getRepository('WhatsAppMessage');
        $total = $repository->where($where)->count();
        $collection = $repository
            ->where($where)
            ->order('timestamp', 'DESC')
            ->limit($offset, $limit + 1)
            ->find();

        $result = [];

        foreach ($collection as $message) {
            if (count($result) >= $limit) {
                break;
            }

            $body = trim((string) ($message->get('body') ?? ''));
            $bodyPreview = trim((string) ($message->get('bodyPreview') ?? ''));

            if ($body === '' && $bodyPreview === '') {
                continue;
            }

            $result[] = $this->normalizeEntityForBroadcast($message);
        }

        usort($result, [$this, 'compareBroadcastMessages']);

        $nextOffset = $offset + $limit;
        $hasMore = $nextOffset < $total;
        $nextCursor = null;

        if ($hasMore && $result !== []) {
            $oldest = $result[0]['timestamp'] ?? null;
            $nextCursor = is_numeric($oldest) ? (int) $oldest : null;
        }

        return [
            'list' => $result,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'hasMore' => $hasMore,
            'nextOffset' => $hasMore ? $nextOffset : null,
            'nextCursor' => $nextCursor,
        ];
    }

    private function findStoredMessage(?string $messageId, string $chatId, bool $fromMe, string $body, int $timestamp): ?Entity
    {
        $repository = $this->entityManager->getRepository('WhatsAppMessage');

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

        return $this->pickCandidateByTimestamp($candidates, $timestamp);
    }

    private function buildBodyPreview(string $body): string
    {
        $preview = trim(preg_replace('/\s+/', ' ', $body));

        if (mb_strlen($preview) <= 255) {
            return $preview;
        }

        return mb_substr($preview, 0, 252) . '...';
    }

    private function normalizeTimestampValue($timestamp): int
    {
        if (is_float($timestamp)) {
            return (int) floor($timestamp);
        }

        if (is_numeric($timestamp)) {
            return (int) $timestamp;
        }

        $parsed = strtotime((string) $timestamp);

        return $parsed ?: time();
    }

    private function buildHistorySortSequence($timestamp, int $index): int
    {
        return ($this->normalizeTimestampValue($timestamp) * 10000) + max(0, $index);
    }

    private function resolveDisplayBody(array|object $message): string
    {
        $body = trim((string) $this->readMessageValue($message, 'body', ''));

        if ($body !== '') {
            return $body;
        }

        $type = strtolower((string) $this->readMessageValue($message, 'type', ''));

        return match ($type) {
            'image' => '[Image]',
            'video' => '[Video]',
            'audio', 'ptt', 'voice' => '[Audio]',
            'document' => '[Document]',
            'sticker' => '[Sticker]',
            'location' => '[Location]',
            'vcard', 'multi_vcard' => '[Contact]',
            'poll_creation', 'poll_update', 'poll_result' => '[Poll]',
            default => '',
        };
    }

    private function shouldSkipNonDisplayMessage(array|object $message, string $body): bool
    {
        if ($body !== '') {
            return false;
        }

        $type = strtolower((string) $this->readMessageValue($message, 'type', ''));

        return in_array($type, [
            'e2e_notification',
            'notification_template',
            'protocol',
            'gp2',
            'ciphertext',
        ], true);
    }

    private function shouldSkipChatId(string $chatId): bool
    {
        $chatId = trim($chatId);

        return $chatId === '' ||
            $chatId === 'status@broadcast' ||
            str_ends_with($chatId, '@newsletter') ||
            str_ends_with($chatId, '@broadcast');
    }

    private function isDuplicateException(\PDOException $e): bool
    {
        return $e->getCode() === '23000' || strpos($e->getMessage(), '1062') !== false;
    }

    private function readMessageValue(array|object $message, string $key, mixed $default = null): mixed
    {
        if (is_array($message)) {
            return $message[$key] ?? $default;
        }

        if (is_object($message)) {
            return $message->{$key} ?? $default;
        }

        return $default;
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

    private function extractMessageId($value): ?string
    {
        if (is_array($value)) {
            return $value['_serialized'] ?? $value['id'] ?? null;
        }

        if (is_object($value)) {
            return $value->_serialized ?? $value->id ?? null;
        }

        return $value ? (string) $value : null;
    }

    private function normalizeBooleanFlag(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return (int) $value === 1;
        }

        if (is_string($value)) {
            $normalized = strtolower(trim($value));

            if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
                return true;
            }

            if (in_array($normalized, ['0', 'false', 'no', 'off', ''], true)) {
                return false;
            }
        }

        return null;
    }

    private function resolvePayloadFromMe(array|object $payload): bool
    {
        $fromMe = $this->normalizeBooleanFlag($this->readMessageValue($payload, 'fromMe'));
        $id = $this->readMessageValue($payload, 'id');

        if (is_array($id) || is_object($id)) {
            $idFromMe = $this->normalizeBooleanFlag($this->readMessageValue($id, 'fromMe'));

            if ($idFromMe !== null) {
                return $idFromMe;
            }
        }

        $serialized = $this->extractMessageId($id) ?? '';

        if (str_starts_with($serialized, 'true_')) {
            return true;
        }

        if (str_starts_with($serialized, 'false_')) {
            return false;
        }

        if ($fromMe !== null) {
            return $fromMe;
        }

        return false;
    }

    private function extractPayloadRemoteId(array|object $payload): string
    {
        $id = $this->readMessageValue($payload, 'id');

        if (!is_array($id) && !is_object($id)) {
            return '';
        }

        return $this->normalizeChatIdValue($this->readMessageValue($id, 'remote'));
    }

    private function resolvePayloadChatId(array|object $payload, bool $fromMe, string $from, string $to): string
    {
        $remote = $this->extractPayloadRemoteId($payload);

        if (!$fromMe) {
            return $remote ?: ($from ?: $to);
        }

        if ($remote !== '' && !($from !== '' && $remote === $from && $to !== '' && $to !== $from)) {
            return $remote;
        }

        return $to ?: ($remote ?: $from);
    }

    private function normalizeChatIdValue(mixed $value): string
    {
        if (is_array($value)) {
            return (string) ($value['_serialized'] ?? $value['id'] ?? '');
        }

        if (is_object($value)) {
            return (string) ($value->_serialized ?? $value->id ?? '');
        }

        return trim((string) ($value ?? ''));
    }

    private function normalizeEntityForBroadcast(Entity $message): array
    {
        $fromMe = (bool) $message->get('fromMe');
        $payloadMeta = $message->get('payloadMeta') ?: [];
        $sortSequence = $this->extractComparableSortSequence([
            'payloadMeta' => $payloadMeta,
        ]);

        return [
            'id' => $message->get('messageId') ?: $message->getId(),
            'messageId' => $message->get('messageId') ?: $message->getId(),
            'body' => $message->get('body') ?? '',
            'bodyPreview' => $message->get('bodyPreview') ?? '',
            'chatId' => $message->get('chatId') ?? '',
            'fromMe' => $fromMe,
            'timestamp' => $message->get('timestamp') ? strtotime((string) $message->get('timestamp')) : time(),
            'ack' => $fromMe ? 1 : 0,
            'status' => $message->get('status') ?? 'Received',
            'sessionId' => $message->get('sessionId'),
            'conversationId' => $message->get('conversationId'),
            'sortSequence' => $sortSequence,
            'payloadMeta' => $payloadMeta,
        ];
    }

    private function normalizeApiMessageForBroadcast(string $chatId, array $apiMessage, int $index): ?array
    {
        $messageId = $this->extractMessageId($apiMessage['id'] ?? $apiMessage['messageId'] ?? null);

        if (!$messageId) {
            return null;
        }

        $body = $this->resolveDisplayBody($apiMessage);

        if ($this->shouldSkipNonDisplayMessage($apiMessage, $body)) {
            return null;
        }

        $fromMe = $this->resolvePayloadFromMe($apiMessage);
        $timestamp = $this->normalizeTimestampValue($apiMessage['timestamp'] ?? time());
        $sortSequence = $this->buildHistorySortSequence($timestamp, $index);
        $payloadMeta = [
            'source' => 'getChatMessages',
            'type' => $apiMessage['type'] ?? null,
            'sortSequence' => $sortSequence,
            'author' => $apiMessage['author'] ?? null,
            'from' => $apiMessage['from'] ?? null,
            'to' => $apiMessage['to'] ?? null,
            'remote' => $this->extractPayloadRemoteId($apiMessage),
            'canonicalChatId' => $chatId,
        ];

        return [
            'id' => $messageId,
            'messageId' => $messageId,
            'body' => $body,
            'bodyPreview' => $this->buildBodyPreview($body),
            'chatId' => $chatId,
            'fromMe' => $fromMe,
            'timestamp' => $timestamp,
            'ack' => $fromMe ? 1 : 0,
            'status' => $fromMe ? 'Sent' : 'Received',
            'author' => $apiMessage['author'] ?? null,
            'from' => $apiMessage['from'] ?? null,
            'sessionId' => $this->whatsappClient->getSessionId(),
            'conversationId' => null,
            'sortSequence' => $sortSequence,
            'payloadMeta' => $payloadMeta,
        ];
    }

    private function extractPayloadMetaValue(array|object|null $payloadMeta, string $key): mixed
    {
        if (is_array($payloadMeta)) {
            return $payloadMeta[$key] ?? null;
        }

        if (is_object($payloadMeta)) {
            return $payloadMeta->{$key} ?? null;
        }

        return null;
    }

    private function normalizePayloadMeta(array|object|null $payloadMeta): array
    {
        if (is_array($payloadMeta)) {
            return $payloadMeta;
        }

        if (is_object($payloadMeta)) {
            return get_object_vars($payloadMeta);
        }

        return [];
    }

    private function mergeReactionPayload(array|object $existingReactions, array|object $reaction): array
    {
        $reactions = [];

        foreach ($this->normalizeReactionList($existingReactions) as $existingReaction) {
            $key = $this->buildReactionKey($existingReaction);

            if ($key) {
                $reactions[$key] = $existingReaction;
            }
        }

        $reactionValue = trim((string) $this->readMessageValue($reaction, 'reaction', ''));
        $fromMe = $this->normalizeBooleanFlag($this->readMessageValue($reaction, 'fromMe')) ?? false;
        $senderId = $this->extractReactionSenderId($reaction);
        $reactionId = $this->extractMessageId($this->readMessageValue($reaction, 'id'));
        $isLocalReaction = $fromMe || $this->isLocalReactionId($reactionId);
        $key = $isLocalReaction ? self::LOCAL_REACTION_SENDER : ($senderId ?: ($reactionId ?: uniqid('reaction_', true)));

        if ($reactionValue === '') {
            unset($reactions[$key]);

            return array_values($reactions);
        }

        $reactions[$key] = [
            'id' => $reactionId,
            'senderId' => $isLocalReaction ? self::LOCAL_REACTION_SENDER : $senderId,
            'reaction' => $reactionValue,
            'timestamp' => $this->normalizeTimestampValue($this->readMessageValue($reaction, 'timestamp', time())),
            'fromMe' => $isLocalReaction,
        ];

        return array_values($reactions);
    }

    private function normalizeReactionList(array|object $reactions): array
    {
        if (is_object($reactions)) {
            $reactions = get_object_vars($reactions);
        }

        $normalized = [];

        foreach ($reactions as $reaction) {
            if (!is_array($reaction) && !is_object($reaction)) {
                continue;
            }

            $reactionValue = trim((string) $this->readMessageValue($reaction, 'reaction', ''));

            if ($reactionValue === '') {
                continue;
            }

            $reactionId = $this->extractMessageId($this->readMessageValue($reaction, 'id'));
            $fromMe = ($this->normalizeBooleanFlag($this->readMessageValue($reaction, 'fromMe')) ?? false) ||
                $this->isLocalReactionId($reactionId);

            $normalized[] = [
                'id' => $reactionId,
                'senderId' => $fromMe ? self::LOCAL_REACTION_SENDER : $this->extractReactionSenderId($reaction),
                'reaction' => $reactionValue,
                'timestamp' => $this->normalizeTimestampValue($this->readMessageValue($reaction, 'timestamp', time())),
                'fromMe' => $fromMe,
            ];
        }

        return $normalized;
    }

    private function buildReactionKey(array $reaction): string
    {
        if (($reaction['fromMe'] ?? false) === true || $this->isLocalReactionId($reaction['id'] ?? null)) {
            return self::LOCAL_REACTION_SENDER;
        }

        return (string) ($reaction['senderId'] ?: ($reaction['id'] ?: ''));
    }

    private function extractReactionSenderId(array|object $reaction): ?string
    {
        foreach (['senderId', 'author', 'participant', 'from'] as $key) {
            $senderId = $this->extractMessageId($this->readMessageValue($reaction, $key));

            if ($senderId) {
                return $senderId;
            }
        }

        $id = $this->readMessageValue($reaction, 'id');

        if (is_array($id) || is_object($id)) {
            foreach (['participant', 'author', 'from'] as $key) {
                $senderId = $this->extractMessageId($this->readMessageValue($id, $key));

                if ($senderId) {
                    return $senderId;
                }
            }
        }

        return null;
    }

    private function isLocalReactionId(?string $reactionId): bool
    {
        return $reactionId !== null && str_starts_with($reactionId, 'true_');
    }

    private function extractComparableSortSequence(array $message): ?int
    {
        $value = $message['sortSequence'] ?? $this->extractPayloadMetaValue($message['payloadMeta'] ?? null, 'sortSequence');

        if ($value === null || $value === '') {
            return null;
        }

        if (!is_numeric($value)) {
            return null;
        }

        return (int) $value;
    }

    private function extractMessageTimestamp(array $payload): ?int
    {
        $raw = $payload['timestamp'] ?? $payload['t'] ?? null;

        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_float($raw)) {
            return (int) floor($raw);
        }

        if (is_numeric($raw)) {
            return (int) $raw;
        }

        $parsed = strtotime((string) $raw);

        return $parsed ?: null;
    }

    private function broadcastMessage(string $chatId, array $message): void
    {
        try {
            $this->webSocketService->broadcastMessage($chatId, $message);
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp WebSocket broadcast error: ' . $e->getMessage());
        }
    }

    private function compareBroadcastMessages(array $a, array $b): int
    {
        $timeA = $this->normalizeTimestampValue($a['timestamp'] ?? time());
        $timeB = $this->normalizeTimestampValue($b['timestamp'] ?? time());
        $seqA = $this->extractComparableSortSequence($a);
        $seqB = $this->extractComparableSortSequence($b);

        if ($timeA !== $timeB) {
            return $timeA <=> $timeB;
        }

        if ($seqA !== null && $seqB !== null && $seqA !== $seqB) {
            return $seqA <=> $seqB;
        }

        return strcmp((string) ($a['messageId'] ?? $a['id'] ?? ''), (string) ($b['messageId'] ?? $b['id'] ?? ''));
    }

    private function pickCandidateByTimestamp(iterable $candidates, int $timestamp): ?Entity
    {
        foreach ($candidates as $candidate) {
            $candidateTimestamp = $candidate->get('timestamp') ? strtotime((string) $candidate->get('timestamp')) : null;

            if (!$candidateTimestamp) {
                continue;
            }

            if (abs($candidateTimestamp - $timestamp) <= 60) {
                return $candidate;
            }
        }

        return null;
    }
}
