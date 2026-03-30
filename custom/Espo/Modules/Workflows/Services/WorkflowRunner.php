<?php

namespace Espo\Modules\Workflows\Services;

class WorkflowRunner
{
    public function __construct(
        private WorkflowTriggerResolver $workflowTriggerResolver,
        private WorkflowConditionEvaluator $workflowConditionEvaluator,
        private WorkflowActionExecutor $workflowActionExecutor
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

        if (!$passes) {
            return [
                'trigger' => $trigger,
                'executed' => false,
                'reason' => 'conditions_not_met',
                'results' => [],
            ];
        }

        return [
            'trigger' => $trigger,
            'executed' => true,
            'results' => $this->workflowActionExecutor->executeActions($actions, $context),
        ];
    }
}
