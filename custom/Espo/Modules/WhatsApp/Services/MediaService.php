<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Core\Utils\Log;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;
use Espo\ORM\Entity;
use Throwable;

class MediaService
{
    private const MAX_FILE_SIZE = 16777216;

    private const ALLOWED_IMAGE_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ];

    private const ALLOWED_VIDEO_TYPES = [
        'video/mp4',
        'video/3gpp',
        'video/quicktime',
    ];

    private const ALLOWED_AUDIO_TYPES = [
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
    ];

    private const ALLOWED_DOCUMENT_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
    ];

    public function __construct(
        private WhatsAppClient $whatsAppClient,
        private MessageDispatchService $messageDispatchService,
        private ChatListSnapshotService $chatListSnapshotService,
        private WebSocketService $webSocketService,
        private Log $log
    ) {}

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendImage(string $chatId, string $imageUrl, ?string $caption = null, array $options = []): array
    {
        $this->validateMediaUrl($imageUrl, self::ALLOWED_IMAGE_TYPES);

        return $this->sendAndStore(
            'image',
            $chatId,
            $caption,
            $imageUrl,
            fn (): array => $this->whatsAppClient->sendImage($chatId, $imageUrl, $caption, $options),
            ['options' => $options]
        );
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendVideo(string $chatId, string $videoUrl, ?string $caption = null, array $options = []): array
    {
        $this->validateMediaUrl($videoUrl, self::ALLOWED_VIDEO_TYPES);

        return $this->sendAndStore(
            'video',
            $chatId,
            $caption,
            $videoUrl,
            fn (): array => $this->whatsAppClient->sendVideo($chatId, $videoUrl, $caption, $options),
            ['options' => $options]
        );
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendAudio(string $chatId, string $audioUrl, bool $asVoice = false, array $options = []): array
    {
        $this->validateMediaUrl($audioUrl, self::ALLOWED_AUDIO_TYPES);

        return $this->sendAndStore(
            $asVoice ? 'voice' : 'audio',
            $chatId,
            null,
            $audioUrl,
            fn (): array => $this->whatsAppClient->sendAudio($chatId, $audioUrl, $asVoice, $options),
            ['options' => $options]
        );
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendVoiceNote(string $chatId, string $audioUrl, array $options = []): array
    {
        return $this->sendAudio($chatId, $audioUrl, true, $options);
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendDocument(
        string $chatId,
        string $documentUrl,
        string $filename,
        ?string $caption = null,
        array $options = []
    ): array {
        $this->validateMediaUrl($documentUrl, self::ALLOWED_DOCUMENT_TYPES);

        return $this->sendAndStore(
            'document',
            $chatId,
            $caption ?: $filename,
            $documentUrl,
            fn (): array => $this->whatsAppClient->sendDocument($chatId, $documentUrl, $filename, $caption, $options),
            [
                'filename' => $filename,
                'options' => $options,
            ]
        );
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function sendSticker(string $chatId, string $stickerUrl, array $options = []): array
    {
        $this->validateMediaUrl($stickerUrl, self::ALLOWED_IMAGE_TYPES);

        return $this->sendAndStore(
            'sticker',
            $chatId,
            null,
            $stickerUrl,
            fn (): array => $this->whatsAppClient->sendSticker($chatId, $stickerUrl, $options),
            ['options' => $options]
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function downloadMedia(string $chatId, string $messageId): array
    {
        if (trim($chatId) === '' || trim($messageId) === '') {
            throw new \InvalidArgumentException('chatId and messageId are required');
        }

        return $this->whatsAppClient->downloadMedia($chatId, $messageId);
    }

    /**
     * @param string[] $allowedTypes
     */
    private function validateMediaUrl(string $url, array $allowedTypes): void
    {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('Invalid media URL');
        }

        $ch = curl_init($url);

        if (!$ch) {
            throw new \InvalidArgumentException('Unable to initialize URL validation');
        }

        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_HEADER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentLength = (int) curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);

        if ($response === false || $httpCode < 200 || $httpCode >= 400) {
            throw new \InvalidArgumentException('Unable to read media URL (HTTP ' . $httpCode . ')');
        }

        if ($contentLength > 0 && $contentLength > self::MAX_FILE_SIZE) {
            throw new \InvalidArgumentException('File size exceeds maximum allowed 16MB');
        }

        $normalizedContentType = $this->normalizeContentType($contentType ?: null);

        if ($normalizedContentType === '' || !in_array($normalizedContentType, $allowedTypes, true)) {
            throw new \InvalidArgumentException('Unsupported file type: ' . ($normalizedContentType ?: 'unknown'));
        }
    }

    /**
     * @param callable(): array<string, mixed> $send
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    private function sendAndStore(
        string $mediaType,
        string $chatId,
        ?string $caption,
        string $mediaUrl,
        callable $send,
        array $meta = []
    ): array {
        try {
            $result = $send();
        } catch (Throwable $e) {
            $this->log->error('WhatsApp MediaService send failed: ' . $e->getMessage());

            throw $e;
        }

        if (!($result['success'] ?? false)) {
            return $result;
        }

        $messagePayload = $result['message'] ?? $result['data'] ?? $result['result'] ?? [];
        $messageId = $this->extractMessageId($messagePayload['id'] ?? null) ?: uniqid('media_');
        $storedMessage = $this->messageDispatchService->storeMessage([
            'body' => $caption ?: '[' . ucfirst($mediaType) . ']',
            'chatId' => $chatId,
            'fromMe' => true,
            'timestamp' => time(),
            'status' => 'Sent',
            'messageId' => $messageId,
            'payloadMeta' => array_merge($meta, [
                'source' => 'sendMedia',
                'mediaType' => $mediaType,
                'mediaUrl' => $mediaUrl,
                'sortSequence' => (int) round(microtime(true) * 1000),
            ]),
        ]);

        $message = $this->normalizeMessageEntity($storedMessage);
        $this->chatListSnapshotService->clearSnapshot();
        $this->broadcastMessage($chatId, $message);

        return array_merge($result, [
            'messageId' => $message['messageId'],
            'message' => $message,
        ]);
    }

    private function readHeader(array $headers, string $name): ?string
    {
        $value = $headers[$name] ?? $headers[strtolower($name)] ?? null;

        if (is_array($value)) {
            $value = end($value);
        }

        if ($value === null || $value === false) {
            return null;
        }

        return trim((string) $value);
    }

    private function normalizeContentType(?string $contentType): string
    {
        if (!$contentType) {
            return '';
        }

        return strtolower(trim(explode(';', $contentType, 2)[0]));
    }

    private function extractMessageId(mixed $value): ?string
    {
        if (is_array($value)) {
            return $value['_serialized'] ?? $value['id'] ?? null;
        }

        if (is_object($value)) {
            return $value->_serialized ?? $value->id ?? null;
        }

        return $value ? (string) $value : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeMessageEntity(Entity $message): array
    {
        $fromMe = (bool) $message->get('fromMe');

        return [
            'id' => $message->get('messageId') ?: $message->getId(),
            'messageId' => $message->get('messageId') ?: $message->getId(),
            'body' => $message->get('body') ?? '',
            'bodyPreview' => $message->get('bodyPreview') ?? '',
            'chatId' => $message->get('chatId') ?? '',
            'fromMe' => $fromMe,
            'timestamp' => $message->get('timestamp') ? strtotime((string) $message->get('timestamp')) : time(),
            'ack' => $fromMe ? 1 : 0,
            'status' => $message->get('status') ?? 'Sent',
            'sessionId' => $message->get('sessionId'),
            'conversationId' => $message->get('conversationId'),
            'payloadMeta' => $message->get('payloadMeta') ?: (object) [],
        ];
    }

    private function broadcastMessage(string $chatId, array $message): void
    {
        try {
            $this->webSocketService->broadcastMessage($chatId, $message);
        } catch (Throwable $e) {
            $this->log->error('WhatsApp MediaService broadcast failed: ' . $e->getMessage());
        }
    }
}
