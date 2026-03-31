<?php

namespace Espo\Modules\Workflows\Services;

class WorkflowRunner
{
    public function __construct(
        private WorkflowTriggerResolver $workflowTriggerResolver,
        private WorkflowConditionEvaluator $workflowConditionEvaluator,
        private WorkflowActionExecutor $workflowActionExecutor,
        private WorkflowConditionStateService $workflowConditionStateService
    ) {
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function run(array $definition, array $context = []): array
    {
        $trigger = $this->workflowTriggerResolver->normalizeTrigger((string) ($definition['triggerType'] ?? 'manual'));
        $conditions = (array) ($definition['conditions'] ?? []);
        $actions = (array) ($definition['actions'] ?? []);
        $context = array_merge($context, [
            'workflowDefinitionId' => (string) ($definition['id'] ?? $definition['workflowDefinitionId'] ?? ''),
            'workflowDefinitionName' => (string) ($definition['name'] ?? $definition['workflowDefinitionName'] ?? ''),
            'workflowEntityType' => (string) ($definition['entityType'] ?? ''),
        ]);

        $passes = $this->workflowConditionEvaluator->passes($conditions, $context);
        $recurrence = $this->workflowConditionStateService->evaluate($definition, $context, $passes);

        if (($recurrence['shouldExecute'] ?? false) !== true) {
            return [
                'trigger' => $trigger,
                'executed' => false,
                'reason' => (string) ($recurrence['reason'] ?? 'conditions_not_met'),
                'conditionPassed' => $passes,
                'recurrence' => $recurrence,
                'results' => [],
            ];
        }

        return [
            'trigger' => $trigger,
            'executed' => true,
            'conditionPassed' => $passes,
            'recurrence' => $recurrence,
            'results' => $this->workflowActionExecutor->executeActions($actions, $context),
        ];
    }
}
