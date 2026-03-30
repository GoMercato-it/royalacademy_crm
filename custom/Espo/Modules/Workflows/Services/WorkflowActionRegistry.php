<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use Espo\Modules\Workflows\Providers\EmailActionProvider;
use Espo\Modules\Workflows\Providers\RecordActionProvider;
use Espo\Modules\Workflows\Providers\WhatsAppActionProvider;
use RuntimeException;

class WorkflowActionRegistry
{
    /**
     * @var array<string, WorkflowActionProvider>
     */
    private array $providers;

    public function __construct(
        WhatsAppActionProvider $whatsAppActionProvider,
        EmailActionProvider $emailActionProvider,
        RecordActionProvider $recordActionProvider
    ) {
        $this->providers = [
            $whatsAppActionProvider->getProviderName() => $whatsAppActionProvider,
            $emailActionProvider->getProviderName() => $emailActionProvider,
            $recordActionProvider->getProviderName() => $recordActionProvider,
        ];
    }

    /**
     * @return array<string, string[]>
     */
    public function getProviderMap(): array
    {
        $result = [];

        foreach ($this->providers as $name => $provider) {
            $result[$name] = $provider->getSupportedActions();
        }

        return $result;
    }

    public function getProvider(string $providerName): WorkflowActionProvider
    {
        $key = strtolower(trim($providerName));

        if (!isset($this->providers[$key])) {
            throw new RuntimeException('Unsupported workflow provider: ' . $providerName);
        }

        return $this->providers[$key];
    }
}
