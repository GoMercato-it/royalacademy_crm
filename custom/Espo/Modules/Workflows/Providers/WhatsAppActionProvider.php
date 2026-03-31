<?php

namespace Espo\Modules\Workflows\Providers;

use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use Espo\Modules\Workflows\Services\WorkflowValueResolver;
use Espo\Modules\WhatsApp\Services\WorkflowActionService as WhatsAppWorkflowActionService;

class WhatsAppActionProvider implements WorkflowActionProvider
{
    public function __construct(
        private WhatsAppWorkflowActionService $workflowActionService,
        private WorkflowValueResolver $workflowValueResolver
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
        if (array_key_exists('waId', $payload) || array_key_exists('chatId', $payload) || array_key_exists('phone', $payload)) {
            $payload['waId'] = $this->workflowValueResolver->resolveValue(
                $payload['waId'] ?? $payload['chatId'] ?? $payload['phone'] ?? '',
                $context
            );
        }

        if (array_key_exists('body', $payload) || array_key_exists('message', $payload) || array_key_exists('text', $payload)) {
            $payload['body'] = $this->workflowValueResolver->resolveValue(
                $payload['body'] ?? $payload['message'] ?? $payload['text'] ?? '',
                $context
            );
        }

        return $this->workflowActionService->execute($action, $payload + ['context' => $context]);
    }
}
