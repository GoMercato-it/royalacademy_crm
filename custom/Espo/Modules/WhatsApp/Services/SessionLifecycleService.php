<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;

class SessionLifecycleService
{
    private const DEFAULT_STATE = 'disconnected';

    private const CONNECTED_STATES = [
        'authenticated',
        'bootstrap_started',
        'contacts_syncing',
        'history_syncing',
        'avatars_syncing',
        'ready',
        'degraded',
    ];

    public function __construct(
        private EntityManager $entityManager,
        private WebSocketService $webSocketService,
        private Log $log
    ) {
    }

    public function syncTransportState(string $sessionId, string $rawState, array $context = []): Entity
    {
        return $this->recordState(
            $sessionId,
            $this->mapTransportState($rawState),
            [
                'rawState' => $rawState,
                'contextData' => $context,
            ]
        );
    }

    public function markQrReady(string $sessionId, array $context = []): Entity
    {
        return $this->recordState($sessionId, 'qr_ready', ['contextData' => $context]);
    }

    public function markDisconnected(string $sessionId, array $context = []): Entity
    {
        return $this->recordState($sessionId, 'disconnected', ['contextData' => $context]);
    }

    public function recordState(string $sessionId, string $state, array $attributes = []): Entity
    {
        $entity = $this->getOrCreateSession($sessionId);
        $normalizedState = $state ?: self::DEFAULT_STATE;
        $rawState = $attributes['rawState'] ?? $entity->get('rawState');
        $contextData = $attributes['contextData'] ?? $entity->get('contextData') ?? (object) [];
        $lastError = $attributes['lastError'] ?? $entity->get('lastError');
        $phoneNumber = $attributes['phoneNumber'] ?? $entity->get('phoneNumber');
        $bootstrapPhase = $attributes['bootstrapPhase'] ?? $entity->get('bootstrapPhase');
        $syncProgress = $attributes['syncProgress'] ?? $entity->get('syncProgress');
        $isConnected = in_array($normalizedState, self::CONNECTED_STATES, true);

        $previousState = $entity->get('lifecycleState');
        $previousRawState = $entity->get('rawState');
        $previousConnected = (bool) $entity->get('isConnected');
        $previousPhase = $entity->get('bootstrapPhase');
        $previousProgress = $entity->get('syncProgress');

        $hasChanged = $previousState !== $normalizedState ||
            $previousRawState !== $rawState ||
            $previousConnected !== $isConnected ||
            $previousPhase !== $bootstrapPhase ||
            (int) $previousProgress !== (int) $syncProgress ||
            $entity->get('phoneNumber') !== $phoneNumber ||
            $entity->get('lastError') !== $lastError ||
            json_encode($entity->get('contextData') ?? (object) []) !== json_encode($contextData ?? (object) []);

        if (!$hasChanged) {
            return $entity;
        }

        $now = date('Y-m-d H:i:s');

        $entity->set([
            'sessionId' => $sessionId,
            'lifecycleState' => $normalizedState,
            'rawState' => $rawState,
            'isConnected' => $isConnected,
            'phoneNumber' => $phoneNumber,
            'bootstrapPhase' => $bootstrapPhase,
            'syncProgress' => $syncProgress,
            'lastError' => $lastError,
            'contextData' => $contextData ?: (object) [],
            'lastEventAt' => $now,
        ]);

        if ($isConnected && !$entity->get('connectedAt')) {
            $entity->set('connectedAt', $now);
        }

        if ($normalizedState === 'ready' || str_ends_with($normalizedState, '_syncing')) {
            $entity->set('lastSyncAt', $now);
        }

        if (!$isConnected && $previousConnected) {
            $entity->set('disconnectedAt', $now);
        } elseif ($isConnected) {
            $entity->set('disconnectedAt', null);
        }

        $this->entityManager->saveEntity($entity);

        try {
            $this->webSocketService->broadcastLifecycleState($sessionId, $normalizedState, [
                'rawState' => $rawState,
                'bootstrapPhase' => $bootstrapPhase,
                'syncProgress' => $syncProgress,
                'isConnected' => $isConnected,
                'phoneNumber' => $phoneNumber,
                'lastError' => $lastError,
                'contextData' => $contextData ?: (object) [],
            ]);
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp lifecycle broadcast error: ' . $e->getMessage());
        }

        return $entity;
    }

    private function getOrCreateSession(string $sessionId): Entity
    {
        $entity = $this->entityManager
            ->getRepository('WhatsAppSession')
            ->where(['sessionId' => $sessionId])
            ->findOne();

        if ($entity) {
            return $entity;
        }

        return $this->entityManager->getEntity('WhatsAppSession');
    }

    private function mapTransportState(string $rawState): string
    {
        $state = strtoupper(trim($rawState));

        return match ($state) {
            'CONNECTED', 'AUTHENTICATED' => 'authenticated',
            'QR', 'QR_READY', 'SCAN_QR_CODE' => 'qr_ready',
            'STARTING', 'INITIALIZING', 'OPENING', 'AUTHENTICATING' => 'authenticating',
            'READY' => 'ready',
            'DISABLED' => 'disabled',
            'DISCONNECTED', 'FAILED', 'STOPPED', 'SESSION_NOT_FOUND' => 'disconnected',
            default => str_contains($state, 'QR') ? 'qr_ready' : (str_contains($state, 'AUTH') ? 'authenticating' : self::DEFAULT_STATE),
        };
    }
}
