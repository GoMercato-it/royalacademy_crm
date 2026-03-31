<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

class WorkflowConditionStateService
{
    public function __construct(
        private EntityManager $entityManager
    ) {
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function evaluate(array $definition, array $context, bool $conditionPassed): array
    {
        $triggerType = (string) ($definition['triggerType'] ?? '');
        $mode = (string) ($definition['updateRecurrenceMode'] ?? 'every_time_true');

        if ($triggerType !== 'record_updated') {
            return [
                'mode' => $mode,
                'previousState' => null,
                'currentState' => $conditionPassed,
                'shouldExecute' => $conditionPassed,
                'reason' => $conditionPassed ? 'ready' : 'conditions_not_met',
                'transition' => $conditionPassed ? 'true' : 'false',
            ];
        }

        $workflowDefinitionId = (string) ($definition['id'] ?? $definition['workflowDefinitionId'] ?? '');
        $entityType = (string) ($context['entityType'] ?? $context['workflowEntityType'] ?? '');
        $entityId = (string) ($context['entityId'] ?? '');

        if ($workflowDefinitionId === '' || $entityType === '' || $entityId === '') {
            return [
                'mode' => $mode,
                'previousState' => null,
                'currentState' => $conditionPassed,
                'shouldExecute' => $conditionPassed,
                'reason' => $conditionPassed ? 'ready' : 'conditions_not_met',
                'transition' => $conditionPassed ? 'true' : 'false',
            ];
        }

        $stateEntity = $this->findStateEntity($workflowDefinitionId, $entityType, $entityId);
        $previousState = $stateEntity ? (bool) $stateEntity->get('lastConditionState') : false;
        $transition = $this->resolveTransition($previousState, $conditionPassed);

        $shouldExecute = false;
        $reason = 'conditions_not_met';

        if ($conditionPassed) {
            if ($mode === 'first_false_to_true') {
                $shouldExecute = !$previousState;
                $reason = $shouldExecute ? 'ready' : 'recurrence_not_met';
            } else {
                $shouldExecute = true;
                $reason = 'ready';
            }
        }

        $stateEntity ??= $this->entityManager->getNewEntity('WorkflowConditionState');
        $stateEntity->set([
            'workflowDefinitionId' => $workflowDefinitionId,
            'relatedEntityType' => $entityType,
            'relatedEntityId' => $entityId,
            'lastConditionState' => $conditionPassed,
            'lastEvaluatedAt' => date('Y-m-d H:i:s'),
        ]);

        if ($shouldExecute) {
            $stateEntity->set('lastTriggeredAt', date('Y-m-d H:i:s'));
        }

        $this->saveStateEntity($stateEntity);

        return [
            'mode' => $mode,
            'previousState' => $stateEntity->getFetched('lastConditionState') ?? $previousState,
            'currentState' => $conditionPassed,
            'shouldExecute' => $shouldExecute,
            'reason' => $reason,
            'transition' => $transition,
        ];
    }

    public function rememberExecution(string $workflowDefinitionId, string $entityType, string $entityId, string $executionId): void
    {
        if ($workflowDefinitionId === '' || $entityType === '' || $entityId === '' || $executionId === '') {
            return;
        }

        $stateEntity = $this->findStateEntity($workflowDefinitionId, $entityType, $entityId);

        if (!$stateEntity) {
            return;
        }

        $stateEntity->set('lastExecutionId', $executionId);

        $this->saveStateEntity($stateEntity);
    }

    private function findStateEntity(string $workflowDefinitionId, string $entityType, string $entityId): ?Entity
    {
        /** @var ?Entity $entity */
        $entity = $this->entityManager
            ->getRDBRepository('WorkflowConditionState')
            ->where([
                'workflowDefinitionId' => $workflowDefinitionId,
                'relatedEntityType' => $entityType,
                'relatedEntityId' => $entityId,
            ])
            ->findOne();

        return $entity;
    }

    private function saveStateEntity(Entity $entity): void
    {
        $this->entityManager->saveEntity($entity, [
            SaveOption::SKIP_HOOKS => true,
            SaveOption::NO_STREAM => true,
            SaveOption::NO_NOTIFICATIONS => true,
            SaveOption::SKIP_AUDITED => true,
        ]);
    }

    private function resolveTransition(bool $previousState, bool $currentState): string
    {
        return match (true) {
            $previousState === false && $currentState === true => 'false_to_true',
            $previousState === true && $currentState === false => 'true_to_false',
            $currentState === true => 'true',
            default => 'false',
        };
    }
}
