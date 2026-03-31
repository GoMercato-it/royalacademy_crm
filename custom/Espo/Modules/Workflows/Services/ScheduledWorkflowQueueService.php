<?php

namespace Espo\Modules\Workflows\Services;

use Cron\CronExpression;
use DateTimeImmutable;
use DateTimeZone;
use Espo\Core\Job\ConfigDataProvider;
use Espo\Core\Utils\Log;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use RuntimeException;
use Throwable;

class ScheduledWorkflowQueueService
{
    public function __construct(
        private EntityManager $entityManager,
        private WorkflowDefinitionService $workflowDefinitionService,
        private WorkflowConditionEvaluator $workflowConditionEvaluator,
        private WorkflowExecutionService $workflowExecutionService,
        private WorkflowPendingJobService $workflowPendingJobService,
        private ConfigDataProvider $jobConfigDataProvider,
        private Log $log
    ) {
    }

    /**
     * @return array<string, int>
     */
    public function processDueDefinitions(int $definitionLimit = 100, int $recordBatchSize = 200): array
    {
        $stats = [
            'scannedDefinitions' => 0,
            'dueDefinitions' => 0,
            'queuedExecutions' => 0,
            'skippedDefinitions' => 0,
            'skippedRecords' => 0,
            'duplicateJobs' => 0,
            'errors' => 0,
        ];

        $slotUtc = $this->resolveQueueSlotUtc();

        foreach ($this->workflowDefinitionService->findActiveScheduled() as $definitionEntity) {
            if ($stats['scannedDefinitions'] >= $definitionLimit) {
                break;
            }

            $stats['scannedDefinitions']++;
            $definition = $this->workflowDefinitionService->toArray($definitionEntity);

            try {
                if (!$this->isDefinitionDue($definition)) {
                    continue;
                }

                $stats['dueDefinitions']++;
                $result = $this->queueDefinition($definition, $slotUtc, $recordBatchSize);

                $stats['queuedExecutions'] += $result['queuedExecutions'];
                $stats['skippedRecords'] += $result['skippedRecords'];
                $stats['duplicateJobs'] += $result['duplicateJobs'];
            } catch (Throwable $e) {
                $stats['errors']++;

                $this->log->error(
                    'Scheduled workflow queueing failed: ' . $e->getMessage(),
                    [
                        'workflowDefinitionId' => $definition['id'] ?? null,
                        'workflowDefinitionName' => $definition['name'] ?? null,
                        'exception' => $e,
                    ]
                );
            }
        }

        $stats['skippedDefinitions'] = $stats['scannedDefinitions'] - $stats['dueDefinitions'];

        return $stats;
    }

    /**
     * @param array<string, mixed> $definition
     * @return array<string, int>
     */
    private function queueDefinition(array $definition, string $slotUtc, int $recordBatchSize): array
    {
        $entityType = trim((string) ($definition['entityType'] ?? ''));

        if ($entityType === '') {
            throw new RuntimeException('Scheduled workflow requires entityType.');
        }

        $stats = [
            'queuedExecutions' => 0,
            'skippedRecords' => 0,
            'duplicateJobs' => 0,
        ];

        $offset = 0;

        while (true) {
            $entityList = $this->entityManager
                ->getRDBRepository($entityType)
                ->order('id', 'asc')
                ->limit($offset, $recordBatchSize)
                ->find();

            if (!$entityList->count()) {
                break;
            }

            foreach ($entityList as $entity) {
                $context = $this->buildContext($entity, $entityType);

                if (!$this->workflowConditionEvaluator->passes((array) ($definition['conditions'] ?? []), $context)) {
                    $stats['skippedRecords']++;

                    continue;
                }

                $queueKey = sha1(implode('|', [
                    'scheduled',
                    (string) ($definition['id'] ?? ''),
                    $entityType,
                    $entity->getId(),
                    $slotUtc,
                ]));

                if ($this->workflowPendingJobService->hasQueueKey($queueKey)) {
                    $stats['duplicateJobs']++;

                    continue;
                }

                $executionContext = $context;
                unset($executionContext['entity']);

                $execution = $this->workflowExecutionService->queue(
                    $definition,
                    'scheduled',
                    $executionContext
                );

                $this->workflowExecutionService->log(
                    $execution->getId(),
                    0,
                    'system',
                    'info',
                    'Workflow execution queued by scheduled trigger.',
                    [
                        'workflowDefinitionId' => $definition['id'] ?? null,
                        'workflowDefinitionName' => $definition['name'] ?? null,
                        'triggerType' => 'scheduled',
                        'scheduledSlot' => $slotUtc,
                    ]
                );

                $this->workflowPendingJobService->queue(
                    $execution,
                    $definition,
                    'scheduled',
                    $executionContext,
                    $slotUtc
                );

                $stats['queuedExecutions']++;
            }

            if ($entityList->count() < $recordBatchSize) {
                break;
            }

            $offset += $recordBatchSize;
        }

        return $stats;
    }

    /**
     * @param array<string, mixed> $definition
     */
    private function isDefinitionDue(array $definition): bool
    {
        $scheduling = trim((string) ($definition['scheduling'] ?? ''));

        if ($scheduling === '') {
            return false;
        }

        try {
            $cron = CronExpression::factory($scheduling);
        } catch (Throwable $e) {
            throw new RuntimeException(
                sprintf(
                    'Invalid workflow scheduling expression "%s": %s',
                    $scheduling,
                    $e->getMessage()
                ),
                0,
                $e
            );
        }

        $timeZone = $this->jobConfigDataProvider->getTimeZone();
        $now = new DateTimeImmutable('now', new DateTimeZone($timeZone));

        return $cron->isDue($now, $timeZone);
    }

    private function resolveQueueSlotUtc(): string
    {
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

        return $now->setTime(
            (int) $now->format('H'),
            (int) $now->format('i'),
            0
        )->format('Y-m-d H:i:s');
    }

    /**
     * @return array<string, mixed>
     */
    private function buildContext(Entity $entity, string $entityType): array
    {
        return [
            'entity' => $entity,
            'entityType' => $entityType,
            'entityId' => $entity->getId(),
            'attributes' => get_object_vars($entity->getValueMap()),
        ];
    }
}
