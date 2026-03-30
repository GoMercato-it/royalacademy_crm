<?php

namespace Espo\Modules\Workflows\Contracts;

interface WorkflowActionProvider
{
    public function getProviderName(): string;

    /**
     * @return string[]
     */
    public function getSupportedActions(): array;

    public function execute(string $action, array $payload, array $context = []): array;
}
