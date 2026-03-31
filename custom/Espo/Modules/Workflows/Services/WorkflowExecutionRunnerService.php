<?php

namespace Espo\Modules\Workflows\Services;

use Espo\ORM\Entity;
use Throwable;

class WorkflowExecutionRunnerService
{
    public function __construct(
        private WorkflowRunner $workflowRunner,
        private WorkflowExecutionService $workflowExecutionService,
        private WorkflowConditionStateService $workflowConditionStateService
    ) {
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     */
    public function execute(
        Entity $execution,
        array $definition,
        string $triggerType,
        array $context,
        string $startMessage = 'Workflow execution started.'
    ): void {
        $this->workflowExecutionService->log(
            $execution->getId(),
            0,
            'system',
            'info',
            $startMessage,
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
                    $this->resolveSkippedMessage((string) ($result['reason'] ?? 'conditions_not_met')),
                    [
                        'conditions' => $definition['conditions'] ?? [],
                        'reason' => $result['reason'] ?? 'conditions_not_met',
                        'conditionPassed' => $result['conditionPassed'] ?? null,
                        'recurrence' => $result['recurrence'] ?? [],
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

                $this->workflowConditionStateService->rememberExecution(
                    (string) ($definition['id'] ?? ''),
                    (string) ($context['entityType'] ?? ''),
                    (string) ($context['entityId'] ?? ''),
                    $execution->getId()
                );
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
            throw $e;
        }
    }

    private function resolveSkippedMessage(string $reason): string
    {
        return match ($reason) {
            'recurrence_not_met' => 'Workflow skipped by update recurrence mode.',
            default => 'Workflow conditions not met.',
        };
    }
}
