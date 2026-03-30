<?php

namespace Espo\Modules\Workflows\Services;

use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Tools\DynamicLogic\ConditionCheckerFactory;
use Espo\Tools\DynamicLogic\Exceptions\BadCondition;
use Espo\Tools\DynamicLogic\Item;
use RuntimeException;
use stdClass;

class WorkflowConditionEvaluator
{
    public function __construct(
        private EntityManager $entityManager,
        private ConditionCheckerFactory $conditionCheckerFactory,
    ) {
    }

    public function passes(array $conditions, array $context = []): bool
    {
        if ($conditions === []) {
            return true;
        }

        if (array_key_exists('conditionGroup', $conditions)) {
            return $this->passesDynamicLogic($conditions, $context);
        }

        foreach ($conditions as $condition) {
            if (!$this->evaluateCondition((array) $condition, $context)) {
                return false;
            }
        }

        return true;
    }

    private function passesDynamicLogic(array $conditions, array $context): bool
    {
        $conditionGroup = $conditions['conditionGroup'] ?? null;

        if (!is_array($conditionGroup) || $conditionGroup === []) {
            return true;
        }

        $entity = $this->resolveEntity($context);

        if (!$entity) {
            return false;
        }

        $checker = $this->conditionCheckerFactory->create($entity);

        try {
            $item = Item::fromGroupDefinition($this->toStdClassArray($conditionGroup));

            return $checker->check($item);
        } catch (BadCondition $e) {
            throw new RuntimeException('Bad workflow dynamic-logic conditions.', 0, $e);
        }
    }

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

    /**
     * @param array<int, mixed> $items
     * @return stdClass[]
     */
    private function toStdClassArray(array $items): array
    {
        return array_map(
            fn ($item) => $this->toStdClass($item),
            $items
        );
    }

    private function toStdClass(mixed $value): stdClass
    {
        if ($value instanceof stdClass) {
            return $value;
        }

        if (!is_array($value)) {
            return (object) [];
        }

        $object = new stdClass();

        foreach ($value as $key => $itemValue) {
            if (is_array($itemValue)) {
                $isList = array_is_list($itemValue);
                $object->{$key} = $isList
                    ? array_map(fn ($nested) => is_array($nested) ? $this->toStdClass($nested) : $nested, $itemValue)
                    : $this->toStdClass($itemValue);

                continue;
            }

            $object->{$key} = $itemValue;
        }

        return $object;
    }

    private function evaluateCondition(array $condition, array $context): bool
    {
        $field = (string) ($condition['field'] ?? '');
        $operator = strtolower((string) ($condition['operator'] ?? 'equals'));
        $expected = $condition['value'] ?? null;
        $actual = $context[$field] ?? null;

        return match ($operator) {
            'equals', 'eq' => $actual == $expected,
            'not_equals', 'neq' => $actual != $expected,
            'in' => in_array($actual, (array) $expected, true),
            'contains' => is_string($actual) && str_contains($actual, (string) $expected),
            'is_true' => (bool) $actual === true,
            'is_false' => (bool) $actual === false,
            'greater_than', 'gt' => $actual > $expected,
            'less_than', 'lt' => $actual < $expected,
            default => throw new RuntimeException('Unsupported workflow condition operator: ' . $operator),
        };
    }
}
