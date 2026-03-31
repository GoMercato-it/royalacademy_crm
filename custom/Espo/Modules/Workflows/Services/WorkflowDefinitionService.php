<?php

namespace Espo\Modules\Workflows\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

class WorkflowDefinitionService
{
    public function __construct(
        private EntityManager $entityManager
    ) {
    }

    public function findActiveByTrigger(string $triggerType, string $entityType): iterable
    {
        return $this->entityManager
            ->getRDBRepository('WorkflowDefinition')
            ->where([
                'status' => 'active',
                'isEnabled' => true,
                'triggerType' => $triggerType,
                'entityType' => $entityType,
            ])
            ->find();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function getActiveDefinitionDataById(string $id): ?array
    {
        if ($id === '') {
            return null;
        }

        $entity = $this->entityManager->getEntityById('WorkflowDefinition', $id);

        if (
            !$entity ||
            $entity->get('status') !== 'active' ||
            !$entity->get('isEnabled')
        ) {
            return null;
        }

        return $this->toArray($entity);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Entity $definitionEntity): array
    {
        return [
            'id' => $definitionEntity->getId(),
            'name' => (string) $definitionEntity->get('name'),
            'status' => (string) $definitionEntity->get('status'),
            'triggerType' => (string) $definitionEntity->get('triggerType'),
            'entityType' => (string) $definitionEntity->get('entityType'),
            'executionMode' => (string) $definitionEntity->get('executionMode'),
            'updateRecurrenceMode' => (string) $definitionEntity->get('updateRecurrenceMode'),
            'isEnabled' => (bool) $definitionEntity->get('isEnabled'),
            'conditions' => $this->normalizeStructuredValue($definitionEntity->get('conditions')),
            'actions' => $this->normalizeStructuredValue($definitionEntity->get('actions')),
            'metadata' => $this->normalizeStructuredValue($definitionEntity->get('metadata')),
        ];
    }

    private function normalizeStructuredValue(mixed $value): mixed
    {
        return json_decode(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), true);
    }
}
