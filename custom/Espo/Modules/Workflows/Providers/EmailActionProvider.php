<?php

namespace Espo\Modules\Workflows\Providers;

use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use RuntimeException;

class EmailActionProvider implements WorkflowActionProvider
{
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
        throw new RuntimeException('Email workflow actions are not implemented yet: ' . $action);
    }
}
