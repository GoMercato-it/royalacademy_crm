<?php
namespace Espo\Custom\Hooks\CourseAccess;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Repository\Option\SaveOptions;

class SetAssignedAt implements AfterSave
{
    public function __construct(private EntityManager $entityManager)
    {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if ($entity->isNew() && !$entity->get('assignedAt')) {
            $entity->set('assignedAt', date('Y-m-d H:i:s'));
            $this->entityManager->saveEntity($entity, [SaveOption::SKIP_HOOKS => true]);
        }
    }
}
