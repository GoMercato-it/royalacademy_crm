<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\Entities\Note;
use Espo\ORM\EntityManager;

class WorkflowStreamAnnotationService
{
    public function __construct(
        private EntityManager $entityManager
    ) {
    }

    public function annotateLatestUpdateNote(
        string $entityType,
        string $entityId,
        string $workflowDefinitionId,
        string $workflowDefinitionName
    ): bool {
        return $this->annotateLatestNoteByTypeList(
            $entityType,
            $entityId,
            [Note::TYPE_UPDATE],
            $workflowDefinitionId,
            $workflowDefinitionName
        );
    }

    public function annotateLatestCreateNote(
        string $entityType,
        string $entityId,
        string $workflowDefinitionId,
        string $workflowDefinitionName
    ): bool {
        return $this->annotateLatestNoteByTypeList(
            $entityType,
            $entityId,
            [Note::TYPE_CREATE],
            $workflowDefinitionId,
            $workflowDefinitionName
        );
    }

    /**
     * @param string[] $typeList
     */
    private function annotateLatestNoteByTypeList(
        string $entityType,
        string $entityId,
        array $typeList,
        string $workflowDefinitionId,
        string $workflowDefinitionName
    ): bool {
        if ($entityType === '' || $entityId === '' || $workflowDefinitionName === '') {
            return false;
        }

        $note = $this->entityManager
            ->getRDBRepository(Note::ENTITY_TYPE)
            ->where([
                'parentType' => $entityType,
                'parentId' => $entityId,
                'type' => $typeList,
            ])
            ->order('number', 'DESC')
            ->findOne();

        if (!$note) {
            return false;
        }

        $data = $note->getData();

        if (
            ($data->workflowDefinitionId ?? null) === $workflowDefinitionId &&
            ($data->workflowDefinitionName ?? null) === $workflowDefinitionName
        ) {
            return true;
        }

        $data->workflowDefinitionId = $workflowDefinitionId;
        $data->workflowDefinitionName = $workflowDefinitionName;

        $note->set('data', $data);

        $this->entityManager->saveEntity($note, [
            SaveOption::SKIP_HOOKS => true,
            SaveOption::NO_STREAM => true,
            SaveOption::NO_NOTIFICATIONS => true,
            SaveOption::SKIP_AUDITED => true,
        ]);

        return true;
    }
}
