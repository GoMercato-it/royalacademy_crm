<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Throwable;

class WorkflowExecutionService
{
    public function __construct(
        private EntityManager $entityManager
    ) {
    }

    /**
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $context
     */
    public function start(array $definition, string $triggerType, array $context = []): Entity
    {
        $execution = $this->entityManager->getNewEntity('WorkflowExecution');
        $execution->set([
            'workflowDefinitionId' => (string) ($definition['id'] ?? ''),
            'status' => 'running',
            'triggerType' => $triggerType,
            'relatedEntityType' => (string) ($context['entityType'] ?? $context['workflowEntityType'] ?? ''),
            'relatedEntityId' => (string) ($context['entityId'] ?? ''),
            'contextData' => $this->sanitizeValue($context),
            'startedAt' => date('Y-m-d H:i:s'),
        ]);

        $this->saveInternal($execution);

        return $execution;
    }

    /**
     * @param array<string, mixed> $result
     */
    public function complete(Entity $execution, array $result): void
    {
        $execution->set([
            'status' => 'completed',
            'resultData' => $this->sanitizeValue($result),
            'finishedAt' => date('Y-m-d H:i:s'),
            'errorMessage' => null,
        ]);

        $this->saveInternal($execution);
    }

    public function fail(Entity $execution, Throwable|string $error): void
    {
        $message = $error instanceof Throwable ? $error->getMessage() : (string) $error;

        $execution->set([
            'status' => 'failed',
            'finishedAt' => date('Y-m-d H:i:s'),
            'errorMessage' => $message,
        ]);

        $this->saveInternal($execution);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function log(
        string $workflowExecutionId,
        int $stepIndex,
        string $stepType,
        string $status,
        string $message,
        array $payload = [],
        ?string $provider = null,
        ?string $actionName = null
    ): void {
        $log = $this->entityManager->getNewEntity('WorkflowExecutionLog');
        $log->set([
            'workflowExecutionId' => $workflowExecutionId,
            'stepIndex' => $stepIndex,
            'stepType' => $stepType,
            'provider' => $provider,
            'actionName' => $actionName,
            'status' => $status,
            'message' => $message,
            'payload' => $this->sanitizeValue($payload),
        ]);

        $this->saveInternal($log);
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

    /**
     * @return array<string, mixed>
     */
    private function sanitizeValue(mixed $value): array
    {
        $normalized = json_decode(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true);

        return is_array($normalized) ? $normalized : [];
    }
}
