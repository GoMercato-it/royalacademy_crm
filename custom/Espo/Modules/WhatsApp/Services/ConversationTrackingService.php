<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Tools\PhoneNumber\EntityLookup as PhoneNumberEntityLookup;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

class ConversationTrackingService
{
    private const DEFAULT_TIMEOUT_SECONDS = 1200;
    private const AUTO_LINK_ENTITY_TYPE_LIST = ['Contact', 'Lead', 'Account'];
    private const AUTO_LINK_ENTITY_PRIORITY_MAP = [
        'Contact' => 1,
        'Lead' => 2,
        'Account' => 3,
    ];

    public function __construct(
        private EntityManager $entityManager,
        private WebSocketService $webSocketService,
        private PhoneNumberEntityLookup $phoneNumberEntityLookup,
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

    public function closeExpiredConversations(?string $sessionId = null, ?string $chatId = null, ?int $timestamp = null): int
    {
        $timestamp ??= time();
        $where = [];

        if ($sessionId !== null && $sessionId !== '') {
            $where['sessionId'] = $sessionId;
        }

        if ($chatId !== null && $chatId !== '') {
            $where['chatId'] = $chatId;
        }

        $collection = $this->entityManager
            ->getRepository('WhatsAppConversation')
            ->where($where)
            ->order('timeoutAt', 'ASC')
            ->limit(200)
            ->find();

        $count = 0;

        foreach ($collection as $conversation) {
            $status = (string) ($conversation->get('status') ?? '');

            if (!in_array($status, ['open', 'idle'], true)) {
                continue;
            }

            $timeoutAt = $conversation->get('timeoutAt');
            $timeoutTimestamp = $timeoutAt ? strtotime((string) $timeoutAt) : null;

            if (!$timeoutTimestamp || $timeoutTimestamp > $timestamp) {
                continue;
            }

            $this->closeConversation($conversation, $timeoutTimestamp);
            $count++;
        }

        return $count;
    }

    public function getConversationHistory(string $sessionId, string $chatId, int $limit = 25): array
    {
        $limit = max(1, min(100, $limit));
        $this->closeExpiredConversations($sessionId, $chatId);

        $collection = $this->entityManager
            ->getRepository('WhatsAppConversation')
            ->where([
                'sessionId' => $sessionId,
                'chatId' => $chatId,
            ])
            ->order('startedAt', 'DESC')
            ->limit($limit)
            ->find();

        $list = [];

        foreach ($collection as $conversation) {
            $list[] = $this->normalizeConversation($conversation);
        }

        return $list;
    }

    public function getChatContext(string $chatId, ?string $knownPhone = null): array
    {
        $participantWaId = $this->normalizeParticipantWaId($chatId);
        $normalizedPhone = $this->normalizeProvidedPhone($knownPhone) ?: $this->extractNormalizedPhone($participantWaId);
        $contactLink = $this->findContactLinkEntity($participantWaId, $normalizedPhone);
        $candidateList = [];

        $context = [
            'chatId' => $chatId,
            'participantWaId' => $participantWaId,
            'normalizedPhone' => $normalizedPhone,
            'displayPhone' => $this->formatDisplayPhone($normalizedPhone),
            'displayName' => $normalizedPhone !== '' ? $this->formatDisplayPhone($normalizedPhone) : null,
            'contactLinkId' => null,
            'linkedEntityType' => null,
            'linkedEntityId' => null,
            'linkedEntityName' => null,
            'linkedEntityUrl' => null,
            'isLinked' => false,
            'isAmbiguous' => false,
            'matchCount' => 0,
            'candidateList' => [],
        ];

        if (!$contactLink) {
            $candidateList = $this->findLinkedEntityCandidates($normalizedPhone);
            $context['isAmbiguous'] = count($candidateList) > 1;
            $context['matchCount'] = count($candidateList);
            $context['candidateList'] = $candidateList;

            return $context;
        }

        $linkedEntityType = (string) ($contactLink->get('linkedEntityType') ?? '');
        $linkedEntityId = (string) ($contactLink->get('linkedEntityId') ?? '');
        $linkedEntityName = $this->resolveEntityDisplayName($linkedEntityType, $linkedEntityId);
        $linkedEntityPhone = $this->resolveEntityPhoneNumber($linkedEntityType, $linkedEntityId);
        $displayPhone = $this->formatDisplayPhone($normalizedPhone) ?: $linkedEntityPhone;
        $displayName = $this->resolveChatDisplayName(
            (string) ($contactLink->get('displayName') ?? ''),
            $linkedEntityName,
            $displayPhone,
            $participantWaId
        );
        $candidateList = [];

        if ($linkedEntityType === '' || $linkedEntityId === '') {
            $candidateList = $this->findLinkedEntityCandidates($normalizedPhone);
        }

        return [
            'chatId' => $chatId,
            'participantWaId' => $participantWaId,
            'normalizedPhone' => $normalizedPhone,
            'displayPhone' => $displayPhone,
            'displayName' => $displayName,
            'contactLinkId' => $contactLink->getId(),
            'linkedEntityType' => $linkedEntityType ?: null,
            'linkedEntityId' => $linkedEntityId ?: null,
            'linkedEntityName' => $linkedEntityName ?: null,
            'linkedEntityUrl' => ($linkedEntityType && $linkedEntityId) ? '#' . $linkedEntityType . '/view/' . $linkedEntityId : null,
            'isLinked' => $linkedEntityType !== '' && $linkedEntityId !== '',
            'isAmbiguous' => count($candidateList) > 1,
            'matchCount' => count($candidateList),
            'candidateList' => $candidateList,
        ];
    }

    public function createContactFromChat(string $chatId, ?string $displayName = null, ?string $knownPhone = null): array
    {
        $participantWaId = $this->normalizeParticipantWaId($chatId);
        $normalizedPhone = $this->normalizeProvidedPhone($knownPhone) ?: $this->extractNormalizedPhone($participantWaId);
        $contactLink = $this->findContactLinkEntity($participantWaId, $normalizedPhone);

        if (
            $contactLink &&
            (string) ($contactLink->get('linkedEntityType') ?? '') === 'Contact' &&
            (string) ($contactLink->get('linkedEntityId') ?? '') !== ''
        ) {
            return $this->getChatContext($chatId, $normalizedPhone);
        }

        $resolvedDisplayName = trim((string) (
            $displayName
            ?: ($contactLink?->get('displayName') ?? '')
            ?: ($normalizedPhone !== '' ? $normalizedPhone : 'WhatsApp Contact')
        ));
        [$firstName, $lastName] = $this->splitContactName($resolvedDisplayName);

        $contact = $this->entityManager->getEntity('Contact');
        $contact->set([
            'firstName' => $firstName ?: null,
            'lastName' => $lastName,
            'contactType' => 'WhatsApp',
        ]);

        if ($normalizedPhone !== '') {
            $contact->set('phoneNumber', $normalizedPhone);
        }

        $this->entityManager->saveEntity($contact);

        if (!$contactLink) {
            $contactLink = $this->entityManager->getEntity('WhatsAppContactLink');
            $contactLink->set('waId', $participantWaId);
        }

        $contactLink->set([
            'normalizedPhone' => $normalizedPhone,
            'displayName' => $resolvedDisplayName,
            'linkedEntityType' => 'Contact',
            'linkedEntityId' => $contact->getId(),
        ]);

        $this->entityManager->saveEntity($contactLink);
        $this->refreshConversationContactLink($chatId, $contactLink->getId());

        return $this->getChatContext($chatId, $normalizedPhone);
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
        $entity = $this->findContactLinkEntity($participantWaId);

        return $entity?->getId();
    }

    private function findContactLinkEntity(string $participantWaId, string $knownPhone = ''): ?Entity
    {
        if ($participantWaId === '') {
            return null;
        }

        $repository = $this->entityManager->getRepository('WhatsAppContactLink');
        $entity = $repository->where(['waId' => $participantWaId])->findOne();

        if ($entity) {
            return $this->resolvePendingContactLink($participantWaId, $entity, $knownPhone);
        }

        $normalizedPhone = $knownPhone !== '' ? $knownPhone : $this->extractNormalizedPhone($participantWaId);

        if ($normalizedPhone === '') {
            return null;
        }

        $entity = $repository->where(['normalizedPhone' => $normalizedPhone])->findOne();

        if ($entity) {
            return $this->resolvePendingContactLink($participantWaId, $entity, $normalizedPhone);
        }

        $candidateList = $this->findLinkedEntityCandidates($normalizedPhone);

        if (count($candidateList) !== 1) {
            return null;
        }

        $candidate = $candidateList[0];

        return $this->persistAutoLinkedContactLink(
            $participantWaId,
            $normalizedPhone,
            null,
            $candidate['entityType'],
            $candidate['entityId'],
            $candidate['entityName'] ?: $normalizedPhone
        );
    }

    private function resolvePendingContactLink(string $participantWaId, Entity $contactLink, string $knownPhone = ''): Entity
    {
        $linkedEntityType = trim((string) ($contactLink->get('linkedEntityType') ?? ''));
        $linkedEntityId = trim((string) ($contactLink->get('linkedEntityId') ?? ''));

        if ($linkedEntityType !== '' && $linkedEntityId !== '') {
            return $contactLink;
        }

        $normalizedPhone = trim((string) ($contactLink->get('normalizedPhone') ?? ''));

        $storedNormalizedPhone = trim((string) ($contactLink->get('normalizedPhone') ?? ''));

        if ($normalizedPhone === '') {
            $normalizedPhone = $knownPhone !== '' ? $knownPhone : $this->extractNormalizedPhone($participantWaId);
        }

        if ($normalizedPhone !== '' && $normalizedPhone !== $storedNormalizedPhone) {
            $contactLink->set('normalizedPhone', $normalizedPhone);
            $this->entityManager->saveEntity($contactLink);
            $this->synchronizeLinkedEntityPhone($contactLink, $storedNormalizedPhone, $normalizedPhone, $participantWaId);
        }

        $candidateList = $this->findLinkedEntityCandidates($normalizedPhone);

        if (count($candidateList) !== 1) {
            return $contactLink;
        }

        $candidate = $candidateList[0];
        $displayName = trim((string) ($contactLink->get('displayName') ?? ''));

        return $this->persistAutoLinkedContactLink(
            $participantWaId,
            $normalizedPhone,
            $contactLink,
            $candidate['entityType'],
            $candidate['entityId'],
            $displayName !== '' ? $displayName : ($candidate['entityName'] ?: $normalizedPhone)
        );
    }

    private function findLinkedEntityCandidates(string $normalizedPhone): array
    {
        if ($normalizedPhone === '') {
            return [];
        }

        $candidateMap = [];

        foreach ($this->buildPhoneLookupVariants($normalizedPhone) as $number) {
            foreach ($this->phoneNumberEntityLookup->find($number) as $entity) {
                $entityType = $entity->getEntityType();

                if (!in_array($entityType, self::AUTO_LINK_ENTITY_TYPE_LIST, true)) {
                    continue;
                }

                $entityId = $entity->getId();

                if (!$entityId) {
                    continue;
                }

                $key = $entityType . ':' . $entityId;

                $candidateMap[$key] = [
                    'entityType' => $entityType,
                    'entityId' => $entityId,
                    'entityName' => $this->resolveEntityDisplayName($entityType, $entityId) ?: $entityId,
                    'entityUrl' => '#' . $entityType . '/view/' . $entityId,
                ];
            }
        }

        $candidateList = array_values($candidateMap);

        usort(
            $candidateList,
            fn (array $a, array $b) =>
                (self::AUTO_LINK_ENTITY_PRIORITY_MAP[$a['entityType']] ?? 999)
                <=>
                (self::AUTO_LINK_ENTITY_PRIORITY_MAP[$b['entityType']] ?? 999)
        );

        return $candidateList;
    }

    private function buildPhoneLookupVariants(string $normalizedPhone): array
    {
        $variants = [$normalizedPhone];

        if (!str_starts_with($normalizedPhone, '+')) {
            $variants[] = '+' . $normalizedPhone;
        }

        return array_values(array_unique(array_filter($variants)));
    }

    private function persistAutoLinkedContactLink(
        string $participantWaId,
        string $normalizedPhone,
        ?Entity $contactLink,
        string $entityType,
        string $entityId,
        string $displayName
    ): Entity {
        $contactLink ??= $this->entityManager->getEntity('WhatsAppContactLink');

        if (!$contactLink->get('waId')) {
            $contactLink->set('waId', $participantWaId);
        }

        $contactLink->set([
            'normalizedPhone' => $normalizedPhone,
            'displayName' => $displayName,
            'linkedEntityType' => $entityType,
            'linkedEntityId' => $entityId,
        ]);

        $this->entityManager->saveEntity($contactLink);

        return $contactLink;
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

    private function extractNormalizedPhone(string $participantWaId): string
    {
        if (!$this->isPhoneBasedWaId($participantWaId)) {
            return '';
        }

        return preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $participantWaId));
    }

    private function normalizeProvidedPhone(?string $phone): string
    {
        $digits = preg_replace('/[^0-9]/', '', trim((string) $phone));

        return strlen($digits) >= 6 ? $digits : '';
    }

    private function isPhoneBasedWaId(string $participantWaId): bool
    {
        $participantWaId = strtolower(trim($participantWaId));

        if ($participantWaId === '') {
            return false;
        }

        return str_ends_with($participantWaId, '@c.us') || str_ends_with($participantWaId, '@s.whatsapp.net');
    }

    private function formatDisplayPhone(?string $phone): ?string
    {
        $phone = trim((string) $phone);

        if ($phone === '') {
            return null;
        }

        if (str_starts_with($phone, '+')) {
            return $phone;
        }

        $digits = preg_replace('/[^0-9]/', '', $phone);

        return $digits !== '' ? '+' . $digits : null;
    }

    private function resolveEntityDisplayName(string $entityType, string $entityId): ?string
    {
        if ($entityType === '' || $entityId === '') {
            return null;
        }

        $entity = $this->entityManager->getEntityById($entityType, $entityId);

        if (!$entity) {
            return null;
        }

        $name = trim((string) ($entity->get('name') ?? ''));

        if ($name !== '') {
            return $name;
        }

        $firstName = trim((string) ($entity->get('firstName') ?? ''));
        $lastName = trim((string) ($entity->get('lastName') ?? ''));

        return trim($firstName . ' ' . $lastName) ?: null;
    }

    private function resolveEntityPhoneNumber(string $entityType, string $entityId): ?string
    {
        if ($entityType === '' || $entityId === '') {
            return null;
        }

        $entity = $this->entityManager->getEntityById($entityType, $entityId);

        if (!$entity) {
            return null;
        }

        return $this->formatDisplayPhone((string) ($entity->get('phoneNumber') ?? ''));
    }

    private function synchronizeLinkedEntityPhone(
        Entity $contactLink,
        string $oldNormalizedPhone,
        string $newNormalizedPhone,
        string $participantWaId
    ): void {
        if ($newNormalizedPhone === '') {
            return;
        }

        $linkedEntityType = trim((string) ($contactLink->get('linkedEntityType') ?? ''));
        $linkedEntityId = trim((string) ($contactLink->get('linkedEntityId') ?? ''));

        if ($linkedEntityType !== 'Contact' || $linkedEntityId === '') {
            return;
        }

        $contact = $this->entityManager->getEntityById('Contact', $linkedEntityId);

        if (!$contact) {
            return;
        }

        $currentPhone = preg_replace('/[^0-9]/', '', (string) ($contact->get('phoneNumber') ?? ''));
        $lidDigits = preg_replace('/[^0-9]/', '', preg_replace('/@.+$/', '', $participantWaId));

        if (
            $currentPhone === '' ||
            $currentPhone === $oldNormalizedPhone ||
            ($lidDigits !== '' && $currentPhone === $lidDigits)
        ) {
            $contact->set('phoneNumber', $newNormalizedPhone);
            $this->entityManager->saveEntity($contact);
        }
    }

    private function resolveChatDisplayName(
        string $contactLinkDisplayName,
        ?string $linkedEntityName,
        ?string $displayPhone,
        string $participantWaId
    ): ?string {
        $contactLinkDisplayName = trim($contactLinkDisplayName);
        $linkedEntityName = trim((string) $linkedEntityName);

        if ($contactLinkDisplayName !== '' && $contactLinkDisplayName !== $participantWaId) {
            if (!preg_match('/^\d+$/', $contactLinkDisplayName) || $this->isPhoneBasedWaId($participantWaId)) {
                return $contactLinkDisplayName;
            }
        }

        if ($linkedEntityName !== '') {
            return $linkedEntityName;
        }

        return $displayPhone;
    }

    private function normalizeConversation(Entity $conversation): array
    {
        $participantWaId = (string) ($conversation->get('participantWaId') ?? $this->normalizeParticipantWaId((string) $conversation->get('chatId')));
        $contactLink = null;
        $contactLinkId = (string) ($conversation->get('contactLinkId') ?? '');

        if ($contactLinkId !== '') {
            $contactLink = $this->entityManager->getEntityById('WhatsAppContactLink', $contactLinkId);
        }

        if (!$contactLink) {
            $contactLink = $this->findContactLinkEntity($participantWaId);
            $contactLinkId = $contactLink?->getId() ?? $contactLinkId;
        }

        $linkedEntityType = trim((string) ($contactLink?->get('linkedEntityType') ?? ''));
        $linkedEntityId = trim((string) ($contactLink?->get('linkedEntityId') ?? ''));
        $linkedEntityName = $this->resolveEntityDisplayName($linkedEntityType, $linkedEntityId);
        $displayPhone = $this->resolveEntityPhoneNumber($linkedEntityType, $linkedEntityId)
            ?: $this->formatDisplayPhone($this->extractNormalizedPhone($participantWaId));
        $displayName = $this->resolveChatDisplayName(
            (string) ($contactLink?->get('displayName') ?? ''),
            $linkedEntityName,
            $displayPhone,
            $participantWaId
        ) ?: $participantWaId;

        $startedAtTimestamp = strtotime((string) ($conversation->get('startedAt') ?? '')) ?: time();
        $endedAtTimestamp = $conversation->get('endedAt')
            ? (strtotime((string) $conversation->get('endedAt')) ?: null)
            : null;
        $timeoutAtTimestamp = $conversation->get('timeoutAt')
            ? (strtotime((string) $conversation->get('timeoutAt')) ?: null)
            : null;

        $previewMessages = $this->loadConversationPreviewMessages($conversation);
        $firstMessageMessageId = $this->resolveConversationFirstMessageId($conversation, $previewMessages);

        return [
            'id' => $conversation->getId(),
            'chatId' => $conversation->get('chatId'),
            'status' => $conversation->get('status'),
            'startedAt' => $startedAtTimestamp,
            'endedAt' => $endedAtTimestamp,
            'timeoutAt' => $timeoutAtTimestamp,
            'durationSeconds' => (int) ($conversation->get('durationSeconds') ?? 0),
            'messageCount' => (int) ($conversation->get('messageCount') ?? 0),
            'firstMessageMessageId' => $firstMessageMessageId,
            'contactLinkId' => $contactLinkId ?: null,
            'linkedEntityType' => $linkedEntityType ?: null,
            'linkedEntityId' => $linkedEntityId ?: null,
            'linkedEntityName' => $linkedEntityName ?: null,
            'linkedEntityUrl' => ($linkedEntityType && $linkedEntityId) ? '#' . $linkedEntityType . '/view/' . $linkedEntityId : null,
            'displayName' => $displayName,
            'title' => date('H:i | d-m-Y', $startedAtTimestamp) . ' | ' . $displayName,
            'previewMessages' => $previewMessages,
        ];
    }

    private function loadConversationPreviewMessages(Entity $conversation): array
    {
        $conversationId = (string) ($conversation->getId() ?? '');

        if ($conversationId === '') {
            return [];
        }

        $collection = $this->entityManager
            ->getRepository('WhatsAppMessage')
            ->where(['conversationId' => $conversationId])
            ->order('timestamp', 'ASC')
            ->limit(5)
            ->find();

        if (!count($collection)) {
            $collection = $this->loadConversationMessagesByFallbackWindow($conversation);
        }

        $list = [];

        foreach ($collection as $message) {
            $body = trim((string) ($message->get('body') ?: $message->get('bodyPreview') ?: ''));

            if ($body === '') {
                continue;
            }

            $list[] = [
                'messageId' => (string) ($message->get('messageId') ?: $message->getId()),
                'body' => mb_substr($body, 0, 160),
                'fromMe' => (bool) ($message->get('fromMe') ?? false),
                'timestamp' => $message->get('timestamp')
                    ? (strtotime((string) $message->get('timestamp')) ?: null)
                    : null,
            ];

            if (count($list) >= 5) {
                break;
            }
        }

        return $list;
    }

    /**
     * @return iterable<Entity>
     */
    private function loadConversationMessagesByFallbackWindow(Entity $conversation): iterable
    {
        $chatId = (string) ($conversation->get('chatId') ?? '');

        if ($chatId === '') {
            return [];
        }

        $startedAtTimestamp = strtotime((string) ($conversation->get('startedAt') ?? '')) ?: null;
        $endedAtTimestamp = $conversation->get('endedAt')
            ? (strtotime((string) $conversation->get('endedAt')) ?: null)
            : null;
        $timeoutAtTimestamp = $conversation->get('timeoutAt')
            ? (strtotime((string) $conversation->get('timeoutAt')) ?: null)
            : null;
        $windowStart = $startedAtTimestamp ? max(0, $startedAtTimestamp - 120) : null;
        $windowEnd = $endedAtTimestamp ?: $timeoutAtTimestamp;

        $collection = $this->entityManager
            ->getRepository('WhatsAppMessage')
            ->where(['chatId' => $chatId])
            ->order('timestamp', 'ASC')
            ->limit(400)
            ->find();

        if (!$windowStart) {
            return $collection;
        }

        $list = [];

        foreach ($collection as $message) {
            $timestamp = $message->get('timestamp')
                ? (strtotime((string) $message->get('timestamp')) ?: null)
                : null;

            if (!$timestamp || $timestamp < $windowStart) {
                continue;
            }

            if ($windowEnd && $timestamp > ($windowEnd + 120)) {
                continue;
            }

            $list[] = $message;

            if (count($list) >= 20) {
                break;
            }
        }

        return $list;
    }

    /**
     * @param array<int, array<string, mixed>> $previewMessages
     */
    private function resolveConversationFirstMessageId(Entity $conversation, array $previewMessages): ?string
    {
        $storedId = trim((string) ($conversation->get('firstMessageMessageId') ?? ''));

        if ($storedId !== '') {
            $message = $this->entityManager
                ->getRepository('WhatsAppMessage')
                ->where(['messageId' => $storedId])
                ->findOne();

            if ($message) {
                return $storedId;
            }
        }

        if (!empty($previewMessages[0]['messageId'])) {
            return (string) $previewMessages[0]['messageId'];
        }

        return null;
    }

    private function splitContactName(string $displayName): array
    {
        $displayName = trim(preg_replace('/\s+/', ' ', $displayName));

        if ($displayName === '') {
            return [null, 'WhatsApp'];
        }

        $parts = explode(' ', $displayName);

        if (count($parts) === 1) {
            return [null, $parts[0]];
        }

        $lastName = array_pop($parts);
        $firstName = trim(implode(' ', $parts));

        return [$firstName ?: null, $lastName ?: 'WhatsApp'];
    }

    private function refreshConversationContactLink(string $chatId, string $contactLinkId): void
    {
        $collection = $this->entityManager
            ->getRepository('WhatsAppConversation')
            ->where(['chatId' => $chatId])
            ->order('startedAt', 'DESC')
            ->limit(50)
            ->find();

        foreach ($collection as $conversation) {
            if ((string) ($conversation->get('contactLinkId') ?? '') === $contactLinkId) {
                continue;
            }

            $conversation->set('contactLinkId', $contactLinkId);
            $this->entityManager->saveEntity($conversation);
        }
    }
}
