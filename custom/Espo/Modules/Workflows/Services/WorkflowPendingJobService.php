<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use RuntimeException;
use Throwable;

class WorkflowPendingJobService
{
    public function __construct(
        private EntityManager $entityManager,
        private WorkflowDefinitionService $workflowDefinitionService,
        private WorkflowExecutionService $workflowExecutionService,
        private WorkflowExecutionRunnerService $workflowExecutionRunnerService
    ) {
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     */
    public function queue(Entity $execution, array $definition, string $triggerType, array $context, ?string $runAt = null): Entity
    {
        $queueKey = $this->buildQueueKey($definition, $triggerType, $context, $runAt);

        if ($queueKey) {
            $existing = $this->findByQueueKey($queueKey);

            if ($existing) {
                return $existing;
            }
        }

        $job = $this->entityManager->getNewEntity('WorkflowPendingJob');
        $job->set([
            'workflowDefinitionId' => (string) ($definition['id'] ?? ''),
            'workflowExecutionId' => $execution->getId(),
            'triggerType' => $triggerType,
            'relatedEntityType' => (string) ($context['entityType'] ?? $context['workflowEntityType'] ?? ''),
            'relatedEntityId' => (string) ($context['entityId'] ?? ''),
            'status' => 'queued',
            'runAt' => $runAt ?: date('Y-m-d H:i:s'),
            'attemptCount' => 0,
            'queueKey' => $queueKey,
            'payload' => $this->sanitize([
                'triggerType' => $triggerType,
                'context' => $context,
            ]),
            'lastError' => null,
        ]);

        $this->saveInternal($job);

        return $job;
    }

    public function hasQueueKey(string $queueKey): bool
    {
        return $this->findByQueueKey($queueKey) !== null;
    }

    /**
     * @return array<string, int>
     */
    public function processDueJobs(int $limit = 50): array
    {
        $processed = 0;
        $completed = 0;
        $failed = 0;
        $cancelled = 0;

        $jobList = $this->entityManager
            ->getRDBRepository('WorkflowPendingJob')
            ->where([
                'status' => 'queued',
                'runAt<=' => date('Y-m-d H:i:s'),
            ])
            ->order('runAt', 'asc')
            ->limit($limit)
            ->find();

        foreach ($jobList as $job) {
            $processed++;

            try {
                $this->markRunning($job);

                $definition = $this->workflowDefinitionService->getActiveDefinitionDataById(
                    (string) $job->get('workflowDefinitionId')
                );

                if (!$definition) {
                    $this->markCancelled($job, 'Workflow definition is inactive or missing.');
                    $this->cancelExecution((string) $job->get('workflowExecutionId'), 'Workflow definition is inactive or missing.');
                    $cancelled++;

                    continue;
                }

                $payload = $this->normalizeArray($job->get('payload') ?? []);
                $triggerType = (string) ($payload['triggerType'] ?? $definition['triggerType'] ?? 'scheduled');
                $context = $this->normalizeArray($payload['context'] ?? []);
                $execution = $this->resolveExecution((string) $job->get('workflowExecutionId'), $definition, $triggerType, $context);

                $this->workflowExecutionService->markRunning($execution);
                $this->workflowExecutionRunnerService->execute(
                    $execution,
                    $definition,
                    $triggerType,
                    $context,
                    'Queued workflow execution started.'
                );

                $this->markCompleted($job);
                $completed++;
            } catch (Throwable $e) {
                $this->markFailed($job, $e->getMessage());
                $this->failExecution((string) $job->get('workflowExecutionId'), $e);
                $failed++;
            }
        }

        return [
            'processed' => $processed,
            'completed' => $completed,
            'failed' => $failed,
            'cancelled' => $cancelled,
        ];
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     */
    private function resolveExecution(string $executionId, array $definition, string $triggerType, array $context): Entity
    {
        if ($executionId !== '') {
            $execution = $this->entityManager->getEntityById('WorkflowExecution', $executionId);

            if ($execution) {
                return $execution;
            }
        }

        return $this->workflowExecutionService->queue($definition, $triggerType, $context);
    }

    private function cancelExecution(string $executionId, string $message): void
    {
        if ($executionId === '') {
            return;
        }

        $execution = $this->entityManager->getEntityById('WorkflowExecution', $executionId);

        if ($execution) {
            $this->workflowExecutionService->cancel($execution, $message);
        }
    }

    private function failExecution(string $executionId, Throwable $error): void
    {
        if ($executionId === '') {
            return;
        }

        $execution = $this->entityManager->getEntityById('WorkflowExecution', $executionId);

        if ($execution) {
            $this->workflowExecutionService->fail($execution, $error);
        }
    }

    private function markRunning(Entity $job): void
    {
        $job->set([
            'status' => 'running',
            'attemptCount' => (int) $job->get('attemptCount') + 1,
            'lastError' => null,
        ]);

        $this->saveInternal($job);
    }

    private function markCompleted(Entity $job): void
    {
        $job->set([
            'status' => 'completed',
            'lastError' => null,
        ]);

        $this->saveInternal($job);
    }

    private function markFailed(Entity $job, string $message): void
    {
        $job->set([
            'status' => 'failed',
            'lastError' => $message,
        ]);

        $this->saveInternal($job);
    }

    private function markCancelled(Entity $job, string $message): void
    {
        $job->set([
            'status' => 'cancelled',
            'lastError' => $message,
        ]);

        $this->saveInternal($job);
    }

    private function saveInternal(Entity $entity): void
    {
        $this->entityManager->saveEntity($entity, [
            SaveOption::SKIP_HOOKS => true,
            SaveOption::NO_STREAM => true,
            SaveOption::NO_NOTIFICATIONS => true,
            SaveOption::SKIP_AUDITED => true,
        ]);
    }

    private function findByQueueKey(string $queueKey): ?Entity
    {
        if ($queueKey === '') {
            return null;
        }

        return $this->entityManager
            ->getRDBRepository('WorkflowPendingJob')
            ->where([
                'queueKey' => $queueKey,
            ])
            ->findOne();
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     */
    private function buildQueueKey(array $definition, string $triggerType, array $context, ?string $runAt): ?string
    {
        if ($triggerType !== 'scheduled') {
            return null;
        }

        $workflowDefinitionId = (string) ($definition['id'] ?? '');
        $relatedEntityType = (string) ($context['entityType'] ?? $context['workflowEntityType'] ?? '');
        $relatedEntityId = (string) ($context['entityId'] ?? '');
        $slot = (string) ($runAt ?: '');

        if ($workflowDefinitionId === '' || $relatedEntityType === '' || $relatedEntityId === '' || $slot === '') {
            return null;
        }

        return sha1(implode('|', [
            'scheduled',
            $workflowDefinitionId,
            $relatedEntityType,
            $relatedEntityId,
            $slot,
        ]));
    }

    /**
     * @return array<string, mixed>
     */
    private function sanitize(mixed $value): array
    {
        $normalized = json_decode(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true);

        if (!is_array($normalized)) {
            throw new RuntimeException('Workflow pending payload could not be normalized.');
        }

        return $normalized;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeArray(mixed $value): array
    {
        $normalized = json_decode(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true);

        return is_array($normalized) ? $normalized : [];
    }
}
