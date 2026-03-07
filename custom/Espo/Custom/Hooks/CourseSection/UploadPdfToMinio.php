<?php
namespace Espo\Custom\Hooks\CourseSection;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Repository\Option\SaveOptions;
use Espo\Custom\Services\MinioService;
use Espo\ORM\EntityManager;

class UploadPdfToMinio implements AfterSave
{
    public static int $order = 10;

    public function __construct(
        private MinioService $minioService,
        private EntityManager $entityManager
    ) {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if (!$entity->isAttributeChanged('pdfFileId')) {
            return;
        }

        $attachmentId = $entity->get('pdfFileId');
        if (!$attachmentId) {
            return;
        }

        $attachment = $this->entityManager->getEntityById('Attachment', $attachmentId);
        if (!$attachment) {
            return;
        }

        $localFilePath = 'data/upload/' . $attachmentId;
        if (!file_exists($localFilePath)) {
            return;
        }

        $filename = $attachment->get('name') ?: 'document.pdf';

        // Uses CourseSection's Uploadable interface (getBucketName, getObjectKey)
        $key = $this->minioService->upload($entity, $localFilePath, $filename);

        $entity->set('pdfMinioKey', $key);
        $this->entityManager->saveEntity($entity, [SaveOption::SKIP_HOOKS => true]);
    }
}
