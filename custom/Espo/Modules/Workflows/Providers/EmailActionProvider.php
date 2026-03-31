<?php

namespace Espo\Modules\Workflows\Providers;

use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use Espo\Modules\Workflows\Services\WorkflowEmailDispatchService;

class EmailActionProvider implements WorkflowActionProvider
{
    public function __construct(
        private WorkflowEmailDispatchService $workflowEmailDispatchService
    ) {
    }

    public function getProviderName(): string
    {
        return 'email';
    }

    public function getSupportedActions(): array
    {
        return [
            'send_email',
            'queue_email',
            'send_template',
        ];
    }

    public function execute(string $action, array $payload, array $context = []): array
    {
        return match ($this->normalizeAction($action)) {
            'send_email' => $this->workflowEmailDispatchService->sendEmail($payload, $context),
            'queue_email' => $this->workflowEmailDispatchService->queueEmail($payload, $context),
            'send_template' => $this->workflowEmailDispatchService->sendTemplate($payload, $context),
            default => throw new \RuntimeException('Unsupported email workflow action: ' . $action),
        };
    }

    private function normalizeAction(string $action): string
    {
        $value = trim($action);

        if ($value === '') {
            return '';
        }

        if (str_starts_with($value, 'email.')) {
            return substr($value, 6);
        }

        return $value;
    }
}
