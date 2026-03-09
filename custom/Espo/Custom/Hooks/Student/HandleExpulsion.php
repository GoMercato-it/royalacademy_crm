<?php
namespace Espo\Custom\Hooks\Student;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Repository\Option\SaveOptions;

/**
 * When a Student's status changes to "Espulsa":
 * 1. Remove the linked User from all Teams
 * 2. Deactivate the linked User (isActive = false)
 * 3. Deactivate all CourseAccess records for this student (isActive = false)
 */
class HandleExpulsion implements AfterSave
{
    public function __construct(private EntityManager $entityManager)
    {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if (!$entity->isAttributeChanged('status')) {
            return;
        }

        if ($entity->get('status') !== 'Espulsa') {
            return;
        }

        // 1. Get linked User and remove from all teams
        $userId = $entity->get('userId');
        if ($userId) {
            $user = $this->entityManager->getEntityById('User', $userId);
            if ($user) {
                // Remove from all teams
                $teams = $this->entityManager
                    ->getRDBRepository('User')
                    ->getRelation($user, 'teams')
                    ->find();

                foreach ($teams as $team) {
                    $this->entityManager
                        ->getRDBRepository('User')
                        ->getRelation($user, 'teams')
                        ->unrelate($team);
                }

                // 2. Deactivate the user
                $user->set('isActive', false);
                $this->entityManager->saveEntity($user, [SaveOption::SKIP_HOOKS => true]);
            }
        }

        // 3. Deactivate all CourseAccess records
        $courseAccesses = $this->entityManager
            ->getRDBRepository('CourseAccess')
            ->where(['studentId' => $entity->getId(), 'isActive' => true])
            ->find();

        foreach ($courseAccesses as $courseAccess) {
            $courseAccess->set('isActive', false);
            $this->entityManager->saveEntity($courseAccess, [SaveOption::SKIP_HOOKS => true]);
        }
    }
}
