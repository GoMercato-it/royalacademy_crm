<?php
namespace Espo\Modules\WhatsApp\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\BadRequest;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Modules\WhatsApp\Services\WebSocketService;
use Espo\Modules\WhatsApp\Services\MessageDispatchService;

/**
 * WhatsApp Module Controller with WebSocket real-time support
 * 
 * All message operations broadcast updates via WebSocket for instant UI updates
 */
class WhatsApp
{
    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private WebSocketService $webSocketService,
        private MessageDispatchService $messageDispatchService
    ) {}

    /**
     * Send a message via WhatsApp
     * Broadcasts immediately via WebSocket to all subscribers
     */
    public function postActionSendMessage(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? $data->phone ?? null;
        $message = $data->message ?? null;

        if (!$chatId || !$message) {
            throw new BadRequest('chatId and message are required');
        }

        return $this->messageDispatchService->sendMessage($chatId, $message);
    }

    /**
     * Broadcast a message acknowledgment (delivery/read status)
     */
    public function postActionBroadcastAck(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $messageId = $data->messageId ?? null;
        $ack = $data->ack ?? 1;
        $status = $data->status ?? null;

        if (!$chatId || !$messageId) {
            throw new BadRequest('chatId and messageId are required');
        }

        try {
            $this->webSocketService->broadcastMessageAck($chatId, $messageId, $ack, $status);
            
            return [
                'success' => true,
                'message' => 'ACK broadcasted'
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Broadcast typing indicator
     */
    public function postActionBroadcastTyping(Request $request, Response $response): array
    {
        $data = $request->getParsedBody();
        $chatId = $data->chatId ?? null;
        $isTyping = $data->isTyping ?? true;

        if (!$chatId) {
            throw new BadRequest('chatId is required');
        }

        try {
            $this->webSocketService->broadcastTyping($chatId, $isTyping);
            
            return [
                'success' => true,
                'message' => 'Typing status broadcasted'
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }
}
