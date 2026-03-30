<?php

namespace Espo\Modules\Workflows\Providers;

use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use Espo\Modules\WhatsApp\Services\WorkflowActionService as WhatsAppWorkflowActionService;

class WhatsAppActionProvider implements WorkflowActionProvider
{
    public function __construct(
        private WhatsAppWorkflowActionService $workflowActionService
    ) {
    }

    public function getProviderName(): string
    {
        return 'whatsapp';
    }

    public function getSupportedActions(): array
    {
        return [
            'send_message',
            'schedule_follow_up',
            'link_chat_to_entity',
            'assign_conversation_owner',
            'close_conversation',
        ];
    }

    public function execute(string $action, array $payload, array $context = []): array
    {
        return $this->workflowActionService->execute($action, $payload + ['context' => $context]);
    }
}
