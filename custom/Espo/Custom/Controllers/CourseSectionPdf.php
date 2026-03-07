<?php
namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Exceptions\NotFound;
use Espo\ORM\EntityManager;
use Espo\Entities\User;
use Espo\Custom\Services\MinioService;

class CourseSectionPdf
{
    public function __construct(
        private EntityManager $entityManager,
        private MinioService $minioService,
        private User $user
    ) {
    }

    /**
     * GET /api/v1/CourseSectionPdf/:id/url
     * Returns section metadata (startPage, endPage) for the viewer.
     */
    public function getActionUrl(Request $request, Response $response): object
    {
        $id = $request->getRouteParam('id');

        $section = $this->entityManager->getEntityById('CourseSection', $id);
        if (!$section || !$section->get('isActive')) {
            throw new NotFound('Section not found or inactive.');
        }

        if (!$this->user->isAdmin()) {
            $userId = $this->user->getId();
            $student = $this->entityManager
                ->getRDBRepository('Student')
                ->where(['userId' => $userId])
                ->findOne();

            if (!$student) {
                throw new Forbidden('No student profile found.');
            }

            $access = $this->entityManager
                ->getRDBRepository('CourseAccess')
                ->where([
                    'courseId' => $section->get('courseId'),
                    'studentId' => $student->getId(),
                    'isActive' => true,
                ])
                ->findOne();

            if (!$access) {
                throw new Forbidden('No active course access.');
            }
        }

        $pdfMinioKey = $section->get('pdfMinioKey');
        if (!$pdfMinioKey) {
            throw new NotFound('No PDF uploaded for this section.');
        }

        // Return proxy URL pointing back to our own server
        return (object) [
            'url' => 'api/v1/CourseSectionPdf/' . $id . '/stream',
            'startPage' => $section->get('startPage'),
            'endPage' => $section->get('endPage')
        ];
    }

    /**
     * GET /api/v1/CourseSectionPdf/:id/stream
     * Proxies the PDF binary from MinIO through the CRM server.
     */
    public function getActionStream(Request $request, Response $response): void
    {
        $id = $request->getRouteParam('id');

        $section = $this->entityManager->getEntityById('CourseSection', $id);
        if (!$section || !$section->get('isActive')) {
            throw new NotFound('Section not found or inactive.');
        }

        // Same access control
        if (!$this->user->isAdmin()) {
            $userId = $this->user->getId();
            $student = $this->entityManager
                ->getRDBRepository('Student')
                ->where(['userId' => $userId])
                ->findOne();

            if (!$student) {
                throw new Forbidden('No student profile found.');
            }

            $access = $this->entityManager
                ->getRDBRepository('CourseAccess')
                ->where([
                    'courseId' => $section->get('courseId'),
                    'studentId' => $student->getId(),
                    'isActive' => true,
                ])
                ->findOne();

            if (!$access) {
                throw new Forbidden('No active course access.');
            }
        }

        $pdfMinioKey = $section->get('pdfMinioKey');
        if (!$pdfMinioKey) {
            throw new NotFound('No PDF uploaded.');
        }

        $bucket = getenv('MINIO_BUCKET') ?: 'royal-academy-courses';

        // Get the file content from MinIO
        $content = $this->minioService->getFileContent($bucket, $pdfMinioKey);

        $response->setHeader('Content-Type', 'application/pdf');
        $response->setHeader('Content-Disposition', 'inline');
        $response->setHeader('Cache-Control', 'private, max-age=3600');
        $response->writeBody($content);
    }
}
