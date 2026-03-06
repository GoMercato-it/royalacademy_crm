<?php
namespace Espo\Custom\Entities;

use Espo\Core\ORM\Entity;
use Espo\Custom\Contracts\Uploadable;

class CourseSection extends Entity implements Uploadable
{
    public const ENTITY_TYPE = 'CourseSection';

    public function getBucketName(): string
    {
        return getenv('MINIO_BUCKET') ?: 'royal-academy-courses';
    }

    public function getObjectKey(): string
    {
        return 'sections/' . $this->getId();
    }

    public function getAllowedMimeTypes(): array
    {
        return ['application/pdf'];
    }

    public function getMaxFileSizeMb(): int
    {
        return 100;
    }
}
