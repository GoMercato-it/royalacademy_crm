<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\Utils\Log;
use Espo\Custom\Core\WhatsApp\WhatsAppClient;
use Espo\Custom\Services\MinioService;

class AvatarStorageService
{
    private const CACHE_TTL_SECONDS = 604800;

    public function __construct(
        private EntityManager $entityManager,
        private MinioService $minioService,
        private WhatsAppClient $whatsappClient,
        private Log $log
    ) {
    }

    public function ensureAvatar(string $waId): ?Entity
    {
        $link = $this->getOrCreateContactLink($waId);

        if ($this->hasFreshAvatar($link)) {
            return $link;
        }

        $source = $this->whatsappClient->getProfilePicUrl($waId);

        if (!$source) {
            return $this->hasStoredAvatar($link) ? $link : null;
        }

        $downloaded = $this->downloadAvatarPayload($source);

        if (!$downloaded) {
            return $this->hasStoredAvatar($link) ? $link : null;
        }

        $filename = 'avatar.' . $this->guessExtension($downloaded['contentType']);
        $objectKey = $this->minioService->uploadContents(
            $link,
            $downloaded['body'],
            $filename,
            $downloaded['contentType']
        );

        $link->set([
            'avatarStorage' => 'minio',
            'avatarObjectKey' => $objectKey,
            'avatarMimeType' => $downloaded['contentType'],
            'avatarFetchedAt' => date('Y-m-d H:i:s'),
            'normalizedPhone' => $this->normalizePhoneFromWaId($waId),
        ]);

        $this->entityManager->saveEntity($link);

        return $link;
    }

    public function getAvatarContent(string $waId): ?array
    {
        $link = $this->entityManager
            ->getRepository('WhatsAppContactLink')
            ->where(['waId' => $waId])
            ->findOne();

        if (!$link || !$this->hasStoredAvatar($link)) {
            return null;
        }

        try {
            return $this->minioService->getObject(
                $link->getBucketName(),
                (string) $link->get('avatarObjectKey')
            );
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp avatar fetch from MinIO failed: ' . $e->getMessage());
            return null;
        }
    }

    public function getAvatarVersion(string $waId): ?int
    {
        $link = $this->entityManager
            ->getRepository('WhatsAppContactLink')
            ->where(['waId' => $waId])
            ->findOne();

        if (!$link || !$link->get('avatarFetchedAt')) {
            return null;
        }

        return strtotime((string) $link->get('avatarFetchedAt')) ?: null;
    }

    private function getOrCreateContactLink(string $waId): Entity
    {
        $entity = $this->entityManager
            ->getRepository('WhatsAppContactLink')
            ->where(['waId' => $waId])
            ->findOne();

        if ($entity) {
            return $entity;
        }

        $entity = $this->entityManager->getEntity('WhatsAppContactLink');
        $entity->set('waId', $waId);

        return $entity;
    }

    private function hasStoredAvatar(Entity $link): bool
    {
        return (bool) $link->get('avatarObjectKey');
    }

    private function hasFreshAvatar(Entity $link): bool
    {
        if (!$this->hasStoredAvatar($link)) {
            return false;
        }

        $fetchedAt = $link->get('avatarFetchedAt');

        if (!$fetchedAt) {
            return false;
        }

        $timestamp = strtotime((string) $fetchedAt);

        if (!$timestamp) {
            return false;
        }

        return (time() - $timestamp) < self::CACHE_TTL_SECONDS;
    }

    private function normalizePhoneFromWaId(string $waId): string
    {
        $value = preg_replace('/@.+$/', '', $waId);

        return preg_replace('/[^0-9]/', '', (string) $value);
    }

    private function downloadAvatarPayload(string $source): ?array
    {
        if (str_starts_with($source, 'data:image/')) {
            $parts = explode(',', $source, 2);

            if (count($parts) !== 2) {
                return null;
            }

            $meta = $parts[0];
            $body = base64_decode($parts[1], true);

            if ($body === false || $body === '') {
                return null;
            }

            preg_match('#^data:(image/[^;]+)#', $meta, $matches);

            return [
                'body' => $body,
                'contentType' => $matches[1] ?? 'image/jpeg',
            ];
        }

        $ch = curl_init($source);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/jpeg';
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            $this->log->error('WhatsApp avatar download cURL error: ' . $error);
            return null;
        }

        if ($httpCode !== 200 || !$body) {
            return null;
        }

        return [
            'body' => $body,
            'contentType' => $contentType,
        ];
    }

    private function guessExtension(string $mimeType): string
    {
        return match (strtolower(trim($mimeType))) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            default => 'jpg',
        };
    }
}
