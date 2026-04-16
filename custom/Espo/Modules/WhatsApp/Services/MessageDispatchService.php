<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;

class MessageDispatchService
{
    public function __construct(
        private EntityManager $entityManager,
        private WhatsAppClient $whatsappClient,
        private WebSocketService $webSocketService,
        private ConversationTrackingService $conversationTrackingService,
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

        foreach (array_values($apiMessages) as $index => $apiMessage) {
            $messageId = $this->extractMessageId($apiMessage['id'] ?? $apiMessage['messageId'] ?? null);

            if (!$messageId) {
                continue;
            }

            $body = $this->resolveDisplayBody($apiMessage);

            if ($this->shouldSkipNonDisplayMessage($apiMessage, $body)) {
                continue;
            }

            try {
                $this->storeMessage([
                    'body' => $body,
                    'chatId' => $chatId,
                    'fromMe' => $apiMessage['fromMe'] ?? false,
                    'timestamp' => $apiMessage['timestamp'] ?? time(),
                    'status' => ($apiMessage['fromMe'] ?? false) ? 'Sent' : 'Received',
                    'messageId' => $messageId,
                    'payloadMeta' => [
                        'source' => 'getChatMessages',
                        'type' => $apiMessage['type'] ?? null,
                        'sortSequence' => $this->buildHistorySortSequence($apiMessage['timestamp'] ?? time(), $index),
                    ],
                ]);
            } catch (\PDOException $e) {
                if (!$this->isDuplicateException($e)) {
                    $this->log->warning('WhatsApp ingestApiMessages save error: ' . $e->getMessage());
                }
            }
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

        return $result;
    }

    public function processWebhookData(object $data): ?array
    {
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

        $messageId = $this->extractMessageId($payload->id ?? null);
        $fromMe = (bool) ($payload->fromMe ?? false);
        $from = is_object($payload->from ?? null) ? ($payload->from->_serialized ?? '') : (string) ($payload->from ?? '');
        $to = is_object($payload->to ?? null) ? ($payload->to->_serialized ?? '') : (string) ($payload->to ?? '');
        $chatId = $fromMe ? $to : $from;
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
        $this->broadcastMessage($chatId, $message);

        return $message;
    }

    public function storeMessage(array $data): Entity
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
        $conversationId = $data['conversationId'] ?? $conversation->getId();

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
        $collection = $this->entityManager
            ->getRepository('WhatsAppMessage')
            ->where(['chatId' => $chatId])
            ->order('timestamp', 'DESC')
            ->limit($limit)
            ->find();

        $result = [];

        foreach ($collection as $message) {
            $body = trim((string) ($message->get('body') ?? ''));
            $bodyPreview = trim((string) ($message->get('bodyPreview') ?? ''));

            if ($body === '' && $bodyPreview === '') {
                continue;
            }

            $result[] = $this->normalizeEntityForBroadcast($message);
        }

        usort($result, [$this, 'compareBroadcastMessages']);

        return $result;
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

        $fromMe = (bool) ($apiMessage['fromMe'] ?? false);
        $timestamp = $this->normalizeTimestampValue($apiMessage['timestamp'] ?? time());
        $sortSequence = $this->buildHistorySortSequence($timestamp, $index);
        $payloadMeta = [
            'source' => 'getChatMessages',
            'type' => $apiMessage['type'] ?? null,
            'sortSequence' => $sortSequence,
            'author' => $apiMessage['author'] ?? null,
            'from' => $apiMessage['from'] ?? null,
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
