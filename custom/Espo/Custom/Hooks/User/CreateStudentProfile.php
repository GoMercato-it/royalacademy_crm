<?php
namespace Espo\Custom\Hooks\User;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\ORM\Repository\Option\SaveOptions;

class CreateStudentProfile implements AfterSave
{
    public static int $order = 20;

    public function __construct(private EntityManager $entityManager)
    {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        if (!$entity->isNew()) {
            return;
        }

        // Recuperiamo i ruoli dall'entità prima che vengano salvati nel DB
        // dato che in $entity->isNew() le relazioni Many-to-Many non sono ancora state persistite
        $rolesIds = $entity->get('rolesIds');
        if (!$rolesIds || !is_array($rolesIds)) {
            return;
        }

        $studentRole = $this->entityManager
            ->getRDBRepository('Role')
            ->where(['name' => 'StudentRole'])
            ->findOne();

        if (!$studentRole || !in_array($studentRole->getId(), $rolesIds)) {
            return;
        }

        // Controlla che non esista già uno Student per questo User
        $existing = $this->entityManager
            ->getRDBRepository('Student')
            ->where(['userId' => $entity->getId()])
            ->findOne();

        if ($existing) {
            return;
        }

        // Crea il profilo Student
        $student = $this->entityManager->getNewEntity('Student');
        $student->set([
            'userId' => $entity->getId(),
            'firstName' => $entity->get('firstName'),
            'lastName' => $entity->get('lastName'),
            'email' => $entity->get('emailAddress'),
            'enrollmentDate' => date('Y-m-d'),
            'status' => 'Attiva',
            'languagePreference' => 'Italiano',
        ]);

        $this->entityManager->saveEntity($student);
    }
}
