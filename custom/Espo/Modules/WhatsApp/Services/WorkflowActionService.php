<?php

namespace Espo\Modules\WhatsApp\Services;

use RuntimeException;

class WorkflowActionService
{
    public function __construct(
        private MessageDispatchService $messageDispatchService
    ) {
    }

    public function execute(string $action, array $payload): array
    {
        $normalizedAction = $this->normalizeAction($action);

        return match ($normalizedAction) {
            'send_message' => $this->executeSendMessage($payload),
            default => throw new RuntimeException('Unsupported WhatsApp action: ' . $action),
        };
    }

    private function executeSendMessage(array $payload): array
    {
        $chatId = (string) ($payload['chatId'] ?? $payload['phone'] ?? $payload['waId'] ?? '');
        $message = (string) ($payload['message'] ?? $payload['text'] ?? $payload['body'] ?? '');

        if ($chatId === '' || $message === '') {
            throw new RuntimeException('chatId/phone and message are required for WhatsApp send_message action');
        }

        return $this->messageDispatchService->sendMessage($chatId, $message);
    }

    private function normalizeAction(string $action): string
    {
        $value = trim($action);

        if ($value === '') {
            throw new RuntimeException('WhatsApp action is required');
        }

        $value = preg_replace('/(?<!^)[A-Z]/', '_$0', $value);
        $value = strtolower((string) $value);

        return str_replace(['-', ' '], '_', $value);
    }
}
