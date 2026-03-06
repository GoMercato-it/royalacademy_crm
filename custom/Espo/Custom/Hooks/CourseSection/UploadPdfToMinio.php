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
        echo "HOOK UploadPdfToMinio Triggered!\n";
        $tmpPath = $entity->pdfTmpPath ?? $entity->get('_pdfTmpPath');
        $filename = $entity->pdfFilename ?? $entity->get('_pdfFilename');

        if (!$tmpPath || !file_exists($tmpPath)) {
            echo "HOOK ABORTED: No tmp path or file missing! _pdfTmpPath: " . var_export($tmpPath, true) . "\n";
            return;
        }

        echo "HOOK UPLOADING TO MINIO...\n";
        $key = $this->minioService->upload($entity, $tmpPath, $filename);

        // Salva la key e pulisci il file locale
        $entity->set('pdfMinioKey', $key);
        $this->entityManager->saveEntity($entity, [SaveOption::SKIP_HOOKS => true]);

        unlink($tmpPath);
    }
}
