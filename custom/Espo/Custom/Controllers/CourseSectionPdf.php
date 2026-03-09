<?php
namespace Espo\Custom\Controllers;

use Espo\Core\Api\Request;
use Espo\Core\Api\Response;
use Espo\Core\Exceptions\Forbidden;
use Espo\Core\Exceptions\NotFound;
use Espo\ORM\EntityManager;
use Espo\ORM\Entity;
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
     * Verify that the current user has access to the course section.
     * Access is granted if:
     * 1. User is admin, OR
     * 2. Student has an active CourseAccess record for the course, OR
     * 3. User belongs to a Team assigned to the course's studentTeams
     */
    private function checkAccess(Entity $section): void
    {
        if ($this->user->isAdmin()) {
            return;
        }

        $userId = $this->user->getId();
        $courseId = $section->get('courseId');

        // Check 1: direct CourseAccess record
        $student = $this->entityManager
            ->getRDBRepository('Student')
            ->where(['userId' => $userId])
            ->findOne();

        if ($student) {
            $access = $this->entityManager
                ->getRDBRepository('CourseAccess')
                ->where([
                    'courseId' => $courseId,
                    'studentId' => $student->getId(),
                    'isActive' => true,
                ])
                ->findOne();

            if ($access) {
                return;
            }
        }

        // Check 2: team membership — user is in a Team assigned to the course
        $course = $this->entityManager->getEntityById('Course', $courseId);
        if ($course) {
            // Get team IDs assigned to this course via standard teams link
            $courseTeams = $this->entityManager
                ->getRDBRepository('Course')
                ->getRelation($course, 'teams')
                ->find();

            $courseTeamIds = [];
            foreach ($courseTeams as $team) {
                $courseTeamIds[] = $team->getId();
            }

            if (!empty($courseTeamIds)) {
                // Get teams the current user belongs to
                $userTeams = $this->entityManager
                    ->getRDBRepository('User')
                    ->getRelation($this->user, 'teams')
                    ->find();

                foreach ($userTeams as $userTeam) {
                    if (in_array($userTeam->getId(), $courseTeamIds)) {
                        return;
                    }
                }
            }
        }

        throw new Forbidden('No active course access.');
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

        $this->checkAccess($section);

        $pdfMinioKey = $section->get('pdfMinioKey');
        if (!$pdfMinioKey) {
            throw new NotFound('No PDF uploaded for this section.');
        }

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

        $this->checkAccess($section);

        $pdfMinioKey = $section->get('pdfMinioKey');
        if (!$pdfMinioKey) {
            throw new NotFound('No PDF uploaded.');
        }

        $bucket = getenv('MINIO_BUCKET') ?: 'royal-academy-courses';

        $content = $this->minioService->getFileContent($bucket, $pdfMinioKey);

        $response->setHeader('Content-Type', 'application/pdf');
        $response->setHeader('Content-Disposition', 'inline');
        $response->setHeader('Cache-Control', 'private, max-age=3600');
        $response->writeBody($content);
    }
}
