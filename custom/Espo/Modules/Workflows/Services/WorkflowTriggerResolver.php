<?php

namespace Espo\Modules\Workflows\Services;

use RuntimeException;

class WorkflowTriggerResolver
{
    /**
     * @return string[]
     */
    public function getSupportedTriggers(): array
    {
        return [
            'manual',
            'record_created',
            'record_updated',
            'record_saved_including_create',
            'scheduled',
            'signal',
        ];
    }

    public function normalizeTrigger(string $trigger): string
    {
        $value = strtolower(trim($trigger));
        $value = str_replace(['-', ' '], '_', $value);

        if (!in_array($value, $this->getSupportedTriggers(), true)) {
            throw new RuntimeException('Unsupported workflow trigger: ' . $trigger);
        }

        return $value;
    }
}
