<?php

namespace Espo\Custom\Hooks\Common;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\Core\ORM\Entity as CoreEntity;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\ORM\Repository\Option\SaveOptions;
use Espo\Modules\Workflows\Services\WorkflowExecutionService;
use Espo\Modules\Workflows\Services\WorkflowRunner;
use Throwable;

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
        'Note',
    ];

    public function __construct(
        private EntityManager $entityManager,
        private WorkflowRunner $workflowRunner,
        private WorkflowExecutionService $workflowExecutionService
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

        $triggerType = $entity->isNew() ? 'record_created' : 'record_updated';
        $definitionList = $this->entityManager
            ->getRDBRepository('WorkflowDefinition')
            ->where([
                'status' => 'active',
                'isEnabled' => true,
                'triggerType' => $triggerType,
                'entityType' => $entityType,
            ])
            ->find();

        if (!$definitionList->count()) {
            return;
        }

        $context = $this->buildContext($entity);

        foreach ($definitionList as $definitionEntity) {
            $definition = $this->buildDefinition($definitionEntity);
            $execution = $this->workflowExecutionService->start(
                $definition,
                $triggerType,
                $this->buildExecutionContext($context)
            );

            $this->workflowExecutionService->log(
                $execution->getId(),
                0,
                'system',
                'info',
                'Workflow execution started.',
                [
                    'workflowDefinitionId' => $definition['id'] ?? null,
                    'workflowDefinitionName' => $definition['name'] ?? null,
                    'triggerType' => $triggerType,
                ]
            );

            try {
                $result = $this->workflowRunner->run($definition, $context);

                if (($result['executed'] ?? false) === false) {
                    $this->workflowExecutionService->log(
                        $execution->getId(),
                        1,
                        'condition',
                        'skipped',
                        'Workflow conditions not met.',
                        [
                            'conditions' => $definition['conditions'] ?? [],
                            'reason' => $result['reason'] ?? 'conditions_not_met',
                        ]
                    );
                } else {
                    foreach ((array) ($result['results'] ?? []) as $index => $item) {
                        $this->workflowExecutionService->log(
                            $execution->getId(),
                            $index + 1,
                            'action',
                            'success',
                            'Workflow action executed.',
                            (array) ($item['result'] ?? []),
                            (string) ($item['provider'] ?? ''),
                            (string) ($item['action'] ?? '')
                        );
                    }
                }

                $this->workflowExecutionService->complete($execution, $result);
            } catch (Throwable $e) {
                $this->workflowExecutionService->log(
                    $execution->getId(),
                    1,
                    'system',
                    'failed',
                    'Workflow execution failed.',
                    ['exception' => $e->getMessage()]
                );

                $this->workflowExecutionService->fail($execution, $e);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function buildContext(CoreEntity $entity): array
    {
        $attributes = get_object_vars($entity->getValueMap());

        return [
            'entity' => $entity,
            'entityType' => $entity->getEntityType(),
            'entityId' => $entity->getId(),
            'attributes' => $attributes,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildDefinition(Entity $definitionEntity): array
    {
        return [
            'id' => $definitionEntity->getId(),
            'name' => (string) $definitionEntity->get('name'),
            'status' => (string) $definitionEntity->get('status'),
            'triggerType' => (string) $definitionEntity->get('triggerType'),
            'entityType' => (string) $definitionEntity->get('entityType'),
            'executionMode' => (string) $definitionEntity->get('executionMode'),
            'isEnabled' => (bool) $definitionEntity->get('isEnabled'),
            'conditions' => $this->normalizeStructuredValue($definitionEntity->get('conditions')),
            'actions' => $this->normalizeStructuredValue($definitionEntity->get('actions')),
            'metadata' => $this->normalizeStructuredValue($definitionEntity->get('metadata')),
        ];
    }

    private function normalizeStructuredValue(mixed $value): mixed
    {
        return json_decode(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true);
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
