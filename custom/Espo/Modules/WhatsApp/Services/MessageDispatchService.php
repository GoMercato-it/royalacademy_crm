<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;

class MessageDispatchService
{
    public function __construct(
        private EntityManager $entityManager,
        private WhatsAppClient $whatsappClient,
        private WebSocketService $webSocketService,
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

        $messageId = $this->extractMessageId($result['message']['id'] ?? $result['data']['id'] ?? null) ?: uniqid('sent_');
        $storedMessage = $this->storeMessage([
            'body' => $message,
            'chatId' => $chatId,
            'fromMe' => true,
            'timestamp' => time(),
            'status' => 'Sent',
            'messageId' => $messageId,
            'payloadMeta' => [
                'source' => 'sendMessage',
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
        foreach ($apiMessages as $apiMessage) {
            $messageId = $this->extractMessageId($apiMessage['id'] ?? $apiMessage['messageId'] ?? null);

            if (!$messageId) {
                continue;
            }

            try {
                $this->storeMessage([
                    'body' => $apiMessage['body'] ?? '',
                    'chatId' => $chatId,
                    'fromMe' => $apiMessage['fromMe'] ?? false,
                    'timestamp' => $apiMessage['timestamp'] ?? time(),
                    'status' => ($apiMessage['fromMe'] ?? false) ? 'Sent' : 'Received',
                    'messageId' => $messageId,
                    'payloadMeta' => [
                        'source' => 'getChatMessages',
                    ],
                ]);
            } catch (\PDOException $e) {
                if ($e->getCode() !== '23000' && strpos($e->getMessage(), '1062') === false) {
                    $this->log->warning('WhatsApp ingestApiMessages save error: ' . $e->getMessage());
                }
            }
        }
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

        $body = (string) ($payload->body ?? '');

        if ($body === 'status@broadcast') {
            return null;
        }

        $messageId = $this->extractMessageId($payload->id ?? null);
        $fromMe = (bool) ($payload->fromMe ?? false);
        $from = is_object($payload->from ?? null) ? ($payload->from->_serialized ?? '') : (string) ($payload->from ?? '');
        $to = is_object($payload->to ?? null) ? ($payload->to->_serialized ?? '') : (string) ($payload->to ?? '');
        $chatId = $fromMe ? $to : $from;
        $status = $fromMe ? 'Sent' : 'Received';

        if ($messageId) {
            $existing = $this->entityManager
                ->getRepository('WhatsAppMessage')
                ->where(['messageId' => $messageId])
                ->findOne();

            if ($existing) {
                return $this->normalizeEntityForBroadcast($existing);
            }
        }

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
            ],
        ]);

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
        $payloadMeta = $data['payloadMeta'] ?? (object) [];
        $sessionId = $data['sessionId'] ?? $this->whatsappClient->getSessionId();
        $conversationId = $data['conversationId'] ?? null;
        $bodyPreview = $data['bodyPreview'] ?? $this->buildBodyPreview($body);

        $entity = $this->findStoredMessage($messageId, $chatId, $fromMe, $body, $timestamp);

        if (!$entity) {
            $entity = $this->entityManager->getEntity('WhatsAppMessage');
        }

        $existingMessageId = $entity->get('messageId');

        $entity->set([
            'body' => $body,
            'bodyPreview' => $bodyPreview,
            'chatId' => $chatId,
            'fromMe' => $fromMe,
            'timestamp' => date('Y-m-d H:i:s', $timestamp),
            'status' => $status,
            'sessionId' => $sessionId,
            'conversationId' => $conversationId,
            'payloadMeta' => $payloadMeta ?: (object) [],
        ]);

        if ($messageId && (!$existingMessageId || $existingMessageId === $messageId || $this->isTemporaryMessageId($existingMessageId))) {
            $entity->set('messageId', $messageId);
        } elseif (!$existingMessageId) {
            $entity->set('messageId', $messageId ?: uniqid($fromMe ? 'sent_' : 'recv_'));
        }

        $this->entityManager->saveEntity($entity);

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
            $result[] = $this->normalizeEntityForBroadcast($message);
        }

        return array_reverse($result);
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
        ];
    }

    private function broadcastMessage(string $chatId, array $message): void
    {
        try {
            $this->webSocketService->broadcastMessage($chatId, $message);
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp WebSocket broadcast error: ' . $e->getMessage());
        }
    }
}
