<?php

namespace Espo\Modules\WhatsApp\Entities;

use Espo\Core\ORM\Entity;
use Espo\Custom\Contracts\Uploadable;

class WhatsAppContactLink extends Entity implements Uploadable
{
    public const ENTITY_TYPE = 'WhatsAppContactLink';

    public function getBucketName(): string
    {
        return getenv('MINIO_BUCKET_WHATSAPP') ?: (getenv('MINIO_BUCKET') ?: 'royal-academy-courses');
    }

    public function getObjectKey(): string
    {
        $waId = (string) ($this->get('waId') ?? '');

        if ($waId !== '') {
            return 'whatsapp/contacts/' . sha1($waId) . '/avatar';
        }

        return 'whatsapp/contacts/' . ($this->getId() ?: 'pending') . '/avatar';
    }

    public function getAllowedMimeTypes(): array
    {
        return ['image/jpeg', 'image/png', 'image/webp'];
    }

    public function getMaxFileSizeMb(): int
    {
        return 5;
    }
}
