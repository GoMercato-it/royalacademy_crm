<?php

namespace Espo\Modules\Workflows\Hooks\Common;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\Core\ORM\Entity as CoreEntity;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\ORM\Repository\Option\SaveOptions;
use Espo\Modules\Workflows\Services\WorkflowDefinitionService;
use Espo\Modules\Workflows\Services\WorkflowExecutionService;
use Espo\Modules\Workflows\Services\WorkflowExecutionRunnerService;
use Espo\Modules\Workflows\Services\WorkflowPendingJobService;

/**
 * @implements AfterSave<Entity>
 */
class WorkflowTrigger implements AfterSave
{
    public static int $order = 120;

    /**
     * @var string[]
     */
    private const INTERNAL_ENTITY_TYPE_LIST = [
        'WorkflowDefinition',
        'WorkflowExecution',
        'WorkflowExecutionLog',
        'WorkflowPendingJob',
        'WorkflowConditionState',
        'Note',
    ];

    public function __construct(
        private EntityManager $entityManager,
        private WorkflowDefinitionService $workflowDefinitionService,
        private WorkflowExecutionService $workflowExecutionService,
        private WorkflowExecutionRunnerService $workflowExecutionRunnerService,
        private WorkflowPendingJobService $workflowPendingJobService
    ) {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if (
            !$entity instanceof CoreEntity ||
            $options->get(SaveOption::SILENT) ||
            $options->get(SaveOption::SKIP_HOOKS) ||
            $options->get('skipWorkflows')
        ) {
            return;
        }

        $entityType = $entity->getEntityType();

        if (
            $entityType === '' ||
            in_array($entityType, self::INTERNAL_ENTITY_TYPE_LIST, true)
        ) {
            return;
        }

        $eventTriggerType = $entity->isNew() ? 'record_created' : 'record_updated';
        $triggerTypeList = $entity->isNew() ?
            ['record_created', 'record_saved_including_create'] :
            ['record_updated', 'record_saved_including_create'];

        $definitionList = $this->workflowDefinitionService->findActiveByTriggers($triggerTypeList, $entityType);

        if (count($definitionList) === 0) {
            return;
        }

        $context = $this->buildContext($entity, $eventTriggerType);
        $executionContext = $this->buildExecutionContext($context);

        foreach ($definitionList as $definitionEntity) {
            $definition = $this->workflowDefinitionService->toArray($definitionEntity);
            $definitionTriggerType = (string) ($definition['triggerType'] ?? $eventTriggerType);

            if (($definition['executionMode'] ?? 'sync') === 'queued') {
                $execution = $this->workflowExecutionService->queue(
                    $definition,
                    $definitionTriggerType,
                    $executionContext
                );

                $this->workflowExecutionService->log(
                    $execution->getId(),
                    0,
                    'system',
                    'info',
                    'Workflow execution queued.',
                    [
                        'workflowDefinitionId' => $definition['id'] ?? null,
                        'workflowDefinitionName' => $definition['name'] ?? null,
                        'triggerType' => $definitionTriggerType,
                        'eventTriggerType' => $eventTriggerType,
                    ]
                );

                $this->workflowPendingJobService->queue(
                    $execution,
                    $definition,
                    $definitionTriggerType,
                    $executionContext
                );

                continue;
            }

            $execution = $this->workflowExecutionService->start(
                $definition,
                $definitionTriggerType,
                $executionContext
            );

            $this->workflowExecutionRunnerService->execute($execution, $definition, $definitionTriggerType, $context);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function buildContext(CoreEntity $entity, string $eventTriggerType): array
    {
        $contextEntity = $this->entityManager->getEntityById($entity->getEntityType(), $entity->getId()) ?? $entity;
        $attributes = get_object_vars($contextEntity->getValueMap());

        return [
            'entity' => $contextEntity,
            'entityType' => $contextEntity->getEntityType(),
            'entityId' => $contextEntity->getId(),
            'attributes' => $attributes,
            'eventTriggerType' => $eventTriggerType,
        ];
    }

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function buildExecutionContext(array $context): array
    {
        $result = $context;
        unset($result['entity']);

        return $result;
    }
}
