<?php

namespace Espo\Modules\Workflows\Services;

class WorkflowActionExecutor
{
    public function __construct(
        private WorkflowActionRegistry $workflowActionRegistry
    ) {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function executeActions(array $actions, array $context = []): array
    {
        $results = [];

        foreach ($actions as $actionConfig) {
            if (is_string($actionConfig)) {
                $actionConfig = $this->normalizeStringAction($actionConfig);
            }

            $providerName = (string) ($actionConfig['provider'] ?? '');
            $actionName = (string) ($actionConfig['action'] ?? '');
            $payload = (array) ($actionConfig['payload'] ?? []);

            $provider = $this->workflowActionRegistry->getProvider($providerName);

            $results[] = [
                'provider' => $providerName,
                'action' => $actionName,
                'result' => $provider->execute($actionName, $payload, $context),
            ];
        }

        return $results;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeStringAction(string $value): array
    {
        $normalized = trim($value);
        $parts = explode('.', $normalized, 2);

        return [
            'provider' => $parts[0] ?? '',
            'action' => $parts[1] ?? $normalized,
            'payload' => [],
        ];
    }
}
