<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

class ConversationTrackingService
{
    private const DEFAULT_TIMEOUT_SECONDS = 86400;

    public function __construct(
        private EntityManager $entityManager,
        private WebSocketService $webSocketService,
        private Config $config,
        private Log $log
    ) {
    }

    public function touchConversation(string $sessionId, string $chatId, int $timestamp, array $context = []): Entity
    {
        $eventAt = date('Y-m-d H:i:s', $timestamp);
        $participantWaId = $this->normalizeParticipantWaId($chatId);
        $contactLinkId = $this->findContactLinkId($participantWaId);
        $activeConversation = $this->findActiveConversation($sessionId, $chatId, $timestamp);
        $created = false;

        if (!$activeConversation) {
            $activeConversation = $this->entityManager->getEntity('WhatsAppConversation');
            $activeConversation->set([
                'sessionId' => $sessionId,
                'chatId' => $chatId,
                'channel' => 'whatsapp',
                'startedAt' => $eventAt,
                'status' => 'open',
            ]);
            $created = true;
        }

        $existingMetadata = $activeConversation->get('metadata');
        $metadata = is_object($existingMetadata) ? get_object_vars($existingMetadata) : (array) ($existingMetadata ?? []);

        if (array_key_exists('source', $context)) {
            $metadata['lastSource'] = $context['source'];
        }

        if (array_key_exists('fromMe', $context)) {
            $metadata['lastDirection'] = $context['fromMe'] ? 'outgoing' : 'incoming';
        }

        $incrementMessageCount = max(0, (int) ($context['incrementMessageCount'] ?? 0));
        $messageCount = (int) ($activeConversation->get('messageCount') ?? 0) + $incrementMessageCount;
        $startedAtTimestamp = strtotime((string) ($activeConversation->get('startedAt') ?: $eventAt)) ?: $timestamp;

        $activeConversation->set([
            'participantWaId' => $participantWaId,
            'contactLinkId' => $contactLinkId ?: $activeConversation->get('contactLinkId'),
            'status' => 'open',
            'lastMessageAt' => $eventAt,
            'timeoutAt' => date('Y-m-d H:i:s', $timestamp + $this->getConversationTimeoutSeconds()),
            'endedAt' => null,
            'durationSeconds' => max(0, $timestamp - $startedAtTimestamp),
            'messageCount' => $messageCount,
            'lastMessagePreview' => (string) ($context['bodyPreview'] ?? $activeConversation->get('lastMessagePreview') ?? ''),
            'lastMessageDirection' => array_key_exists('fromMe', $context)
                ? ($context['fromMe'] ? 'outgoing' : 'incoming')
                : ($activeConversation->get('lastMessageDirection') ?? null),
            'metadata' => (object) $metadata,
        ]);

        $this->entityManager->saveEntity($activeConversation);

        try {
            $this->webSocketService->broadcastConversationEvent(
                $activeConversation->getId(),
                $created ? 'opened' : 'updated',
                [
                    'chatId' => $chatId,
                    'sessionId' => $sessionId,
                    'status' => 'open',
                    'participantWaId' => $participantWaId,
                    'lastMessageAt' => $timestamp,
                    'messageCount' => $messageCount,
                ]
            );
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp conversation broadcast error: ' . $e->getMessage());
        }

        return $activeConversation;
    }

    private function findActiveConversation(string $sessionId, string $chatId, int $timestamp): ?Entity
    {
        $collection = $this->entityManager
            ->getRepository('WhatsAppConversation')
            ->where([
                'sessionId' => $sessionId,
                'chatId' => $chatId,
            ])
            ->order('lastMessageAt', 'DESC')
            ->limit(10)
            ->find();

        foreach ($collection as $conversation) {
            $status = (string) ($conversation->get('status') ?? '');

            if (!in_array($status, ['open', 'idle'], true)) {
                continue;
            }

            $timeoutAt = $conversation->get('timeoutAt');
            $timeoutTimestamp = $timeoutAt ? strtotime((string) $timeoutAt) : null;

            if ($timeoutTimestamp && $timeoutTimestamp < $timestamp) {
                $this->closeConversation($conversation, $timestamp);
                continue;
            }

            if ($conversation->get('endedAt')) {
                continue;
            }

            return $conversation;
        }

        return null;
    }

    private function closeConversation(Entity $conversation, int $timestamp): void
    {
        $startedAtTimestamp = strtotime((string) ($conversation->get('startedAt') ?? '')) ?: $timestamp;
        $endedAt = date('Y-m-d H:i:s', $timestamp);

        $conversation->set([
            'status' => 'closed',
            'endedAt' => $endedAt,
            'durationSeconds' => max(0, $timestamp - $startedAtTimestamp),
        ]);

        $this->entityManager->saveEntity($conversation);

        try {
            $this->webSocketService->broadcastConversationEvent(
                $conversation->getId(),
                'closed',
                [
                    'chatId' => $conversation->get('chatId'),
                    'sessionId' => $conversation->get('sessionId'),
                    'status' => 'closed',
                    'endedAt' => $timestamp,
                ]
            );
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp conversation close broadcast error: ' . $e->getMessage());
        }
    }

    private function findContactLinkId(string $participantWaId): ?string
    {
        if ($participantWaId === '') {
            return null;
        }

        $repository = $this->entityManager->getRepository('WhatsAppContactLink');
        $entity = $repository->where(['waId' => $participantWaId])->findOne();

        if ($entity) {
            return $entity->getId();
        }

        $normalizedPhone = preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $participantWaId));

        if ($normalizedPhone === '') {
            return null;
        }

        $entity = $repository->where(['normalizedPhone' => $normalizedPhone])->findOne();

        return $entity?->getId();
    }

    private function normalizeParticipantWaId(string $chatId): string
    {
        if (str_contains($chatId, '@')) {
            return $chatId;
        }

        $normalizedPhone = preg_replace('/[^0-9]/', '', $chatId);

        return $normalizedPhone !== '' ? $normalizedPhone . '@c.us' : $chatId;
    }

    private function getConversationTimeoutSeconds(): int
    {
        $value = (int) ($this->config->get('whatsappConversationTimeoutSeconds') ?? self::DEFAULT_TIMEOUT_SECONDS);

        return $value > 0 ? $value : self::DEFAULT_TIMEOUT_SECONDS;
    }
}
