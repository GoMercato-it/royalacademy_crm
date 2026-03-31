<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\Formula\AttributeFetcher;
use Espo\Core\Formula\Manager as FormulaManager;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;

class WorkflowValueResolver
{
    public function __construct(
        private EntityManager $entityManager,
        private AttributeFetcher $attributeFetcher,
        private FormulaManager $formulaManager
    ) {
    }

    /**
     * @param array<int|string, mixed> $assignments
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function resolveAssignments(array $assignments, array $context = []): array
    {
        if (!array_is_list($assignments)) {
            return $this->resolveAssociativeAssignments($assignments, $context);
        }

        $attributes = [];

        foreach ($assignments as $item) {
            if (!is_array($item)) {
                continue;
            }

            $field = trim((string) ($item['field'] ?? ''));

            if ($field === '') {
                continue;
            }

            $attributes[$field] = $this->resolveValue($item, $context);
        }

        return $attributes;
    }

    /**
     * @param array<string, mixed> $context
     */
    public function resolveValue(mixed $valueDefinition, array $context = []): mixed
    {
        if (!is_array($valueDefinition)) {
            return $valueDefinition;
        }

        $sourceType = $this->normalizeSourceType($valueDefinition);

        return match ($sourceType) {
            'field' => $this->resolveFieldValue((string) ($valueDefinition['sourceField'] ?? ''), $context),
            'expression' => $this->resolveExpressionValue((string) ($valueDefinition['expression'] ?? ''), $context),
            default => $this->resolveConstantValue(
                $valueDefinition['value'] ?? $valueDefinition['constantValue'] ?? null,
                $context
            ),
        };
    }

    /**
     * @param array<string, mixed> $assignments
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function resolveAssociativeAssignments(array $assignments, array $context): array
    {
        $attributes = [];

        foreach ($assignments as $field => $valueDefinition) {
            if (!is_string($field) || trim($field) === '') {
                continue;
            }

            $attributes[$field] = $this->resolveValue($valueDefinition, $context);
        }

        return $attributes;
    }

    /**
     * @param array<string, mixed> $valueDefinition
     */
    private function normalizeSourceType(array $valueDefinition): string
    {
        $sourceType = strtolower(trim((string) ($valueDefinition['sourceType'] ?? '')));

        if ($sourceType !== '') {
            return $sourceType;
        }

        if (array_key_exists('expression', $valueDefinition) && trim((string) $valueDefinition['expression']) !== '') {
            return 'expression';
        }

        if (array_key_exists('sourceField', $valueDefinition) && trim((string) $valueDefinition['sourceField']) !== '') {
            return 'field';
        }

        return 'constant';
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveFieldValue(string $path, array $context): mixed
    {
        $path = trim($path);

        if ($path === '') {
            return null;
        }

        $entity = $this->resolveEntity($context);

        if ($entity) {
            return $this->attributeFetcher->fetch($entity, $path);
        }

        $attributes = $this->extractAttributes($context);

        return $attributes[$path] ?? null;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveExpressionValue(string $expression, array $context): mixed
    {
        $expression = trim($expression);

        if ($expression === '') {
            return null;
        }

        return $this->formulaManager->runSafe($expression, $this->resolveEntity($context), (object) []);
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveConstantValue(mixed $value, array $context): mixed
    {
        if (!is_string($value)) {
            return $value;
        }

        if (!str_contains($value, '${')) {
            return $value;
        }

        return preg_replace_callback('/\$\{([^}]+)\}/', function (array $matches) use ($context): string {
            $path = trim((string) ($matches[1] ?? ''));

            if ($path === '') {
                return '';
            }

            $resolved = $this->resolveFieldValue($path, $context);

            if ($resolved === null) {
                return '';
            }

            if (is_scalar($resolved)) {
                return (string) $resolved;
            }

            return '';
        }, $value) ?? $value;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveEntity(array $context): ?Entity
    {
        $entity = $context['entity'] ?? null;

        if ($entity instanceof Entity) {
            return $entity;
        }

        $entityType = (string) ($context['workflowEntityType'] ?? $context['entityType'] ?? '');

        if ($entityType === '') {
            return null;
        }

        $entity = $this->entityManager->getNewEntity($entityType);
        $attributes = $this->extractAttributes($context);

        if ($attributes !== []) {
            $entity->set($attributes);
        }

        return $entity;
    }

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function extractAttributes(array $context): array
    {
        if (isset($context['attributes']) && is_array($context['attributes'])) {
            return $context['attributes'];
        }

        $attributes = [];

        foreach ($context as $key => $value) {
            if (
                $key === 'entity' ||
                str_starts_with((string) $key, 'workflow')
            ) {
                continue;
            }

            if (is_scalar($value) || $value === null || is_array($value)) {
                $attributes[$key] = $value;
            }
        }

        return $attributes;
    }
}
