<?php

namespace Espo\Modules\Workflows\Providers;

use Espo\Core\ORM\Repository\Option\SaveContext;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\Core\Utils\SystemUser;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Modules\Workflows\Contracts\WorkflowActionProvider;
use Espo\Modules\Workflows\Services\WorkflowStreamAnnotationService;
use RuntimeException;

class RecordActionProvider implements WorkflowActionProvider
{
    public function __construct(
        private EntityManager $entityManager,
        private WorkflowStreamAnnotationService $workflowStreamAnnotationService,
        private SystemUser $systemUser
    ) {
    }

    public function getProviderName(): string
    {
        return 'record';
    }

    public function getSupportedActions(): array
    {
        return [
            'create_record',
            'update_record',
            'assign_owner',
        ];
    }

    public function execute(string $action, array $payload, array $context = []): array
    {
        $normalizedAction = $this->normalizeAction($action);

        return match ($normalizedAction) {
            'create_record' => $this->executeCreateRecord($payload, $context),
            'update_record' => $this->executeUpdateRecord($payload, $context),
            'assign_owner' => $this->executeAssignOwner($payload, $context),
            default => throw new RuntimeException('Unsupported record workflow action: ' . $action),
        };
    }

    private function executeCreateRecord(array $payload, array $context): array
    {
        $entityType = (string) ($payload['entityType'] ?? $payload['scope'] ?? '');
        $attributes = $this->normalizeAttributes($payload['attributes'] ?? $payload['data'] ?? []);

        if ($entityType === '') {
            throw new RuntimeException('entityType is required for record create_record');
        }

        /** @var Entity $entity */
        $entity = $this->entityManager->getNewEntity($entityType);
        $entity->set($attributes);

        $saveContext = $this->createWorkflowSaveContext(
            $entity,
            $context,
            fn () => $this->workflowStreamAnnotationService->annotateLatestCreateNote(
                $entityType,
                $entity->getId(),
                (string) ($context['workflowDefinitionId'] ?? ''),
                (string) ($context['workflowDefinitionName'] ?? '')
            )
        );

        $this->entityManager->saveEntity($entity, [
            ...$this->getWorkflowSaveOptions(true),
            'skipWorkflows' => true,
            SaveContext::NAME => $saveContext,
        ]);

        return [
            'entityType' => $entityType,
            'id' => $entity->getId(),
            'action' => 'create_record',
        ];
    }

    private function executeUpdateRecord(array $payload, array $context): array
    {
        $entityType = (string) ($payload['entityType'] ?? $payload['scope'] ?? '');
        $id = (string) ($payload['id'] ?? $payload['recordId'] ?? '');
        $attributes = $this->normalizeAttributes($payload['attributes'] ?? $payload['data'] ?? []);

        if ($entityType === '' || $id === '') {
            throw new RuntimeException('entityType and id are required for record update_record');
        }

        $entity = $this->entityManager->getEntityById($entityType, $id);

        if (!$entity) {
            throw new RuntimeException("Record not found for workflow update: {$entityType}:{$id}");
        }

        $entity->set($attributes);

        $saveContext = $this->createWorkflowSaveContext(
            $entity,
            $context,
            fn () => $this->workflowStreamAnnotationService->annotateLatestUpdateNote(
                $entityType,
                $id,
                (string) ($context['workflowDefinitionId'] ?? ''),
                (string) ($context['workflowDefinitionName'] ?? '')
            )
        );

        $this->entityManager->saveEntity($entity, [
            ...$this->getWorkflowSaveOptions(false),
            'skipWorkflows' => true,
            SaveContext::NAME => $saveContext,
        ]);

        return [
            'entityType' => $entityType,
            'id' => $id,
            'action' => 'update_record',
            'updatedFields' => array_keys($attributes),
        ];
    }

    private function executeAssignOwner(array $payload, array $context): array
    {
        $assignedUserId = (string) ($payload['assignedUserId'] ?? $payload['ownerUserId'] ?? '');

        if ($assignedUserId === '') {
            throw new RuntimeException('assignedUserId is required for record assign_owner');
        }

        return $this->executeUpdateRecord([
            'entityType' => $payload['entityType'] ?? $payload['scope'] ?? '',
            'id' => $payload['id'] ?? $payload['recordId'] ?? '',
            'attributes' => [
                'assignedUserId' => $assignedUserId,
            ],
        ], $context);
    }

    private function createWorkflowSaveContext(Entity $entity, array $context, callable $deferredAction): SaveContext
    {
        $saveContext = new SaveContext();
        $workflowDefinitionId = (string) ($context['workflowDefinitionId'] ?? '');
        $workflowDefinitionName = (string) ($context['workflowDefinitionName'] ?? '');

        if (
            $entity->getEntityType() !== '' &&
            $workflowDefinitionId !== '' &&
            $workflowDefinitionName !== ''
        ) {
            $saveContext->addDeferredAction(static function () use ($deferredAction): void {
                $deferredAction();
            });
        }

        return $saveContext;
    }

    /**
     * @return array<string, string>
     */
    private function getWorkflowSaveOptions(bool $isCreate): array
    {
        $systemUserId = $this->systemUser->getId();

        $options = [
            SaveOption::MODIFIED_BY_ID => $systemUserId,
        ];

        if ($isCreate) {
            $options[SaveOption::CREATED_BY_ID] = $systemUserId;
        }

        return $options;
    }

    private function normalizeAction(string $action): string
    {
        $value = trim($action);

        if ($value === '') {
            throw new RuntimeException('Record action is required');
        }

        $value = preg_replace('/(?<!^)[A-Z]/', '_$0', $value);
        $value = strtolower((string) $value);

        return str_replace(['-', ' '], '_', $value);
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeAttributes(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        if (!array_is_list($value)) {
            return $value;
        }

        $attributes = [];

        foreach ($value as $item) {
            if (!is_array($item)) {
                continue;
            }

            $field = trim((string) ($item['field'] ?? ''));

            if ($field === '') {
                continue;
            }

            $attributes[$field] = $item['value'] ?? null;
        }

        return $attributes;
    }
}
