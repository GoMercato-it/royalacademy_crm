<?php

namespace Espo\Modules\WhatsApp\Services;

use Espo\Entities\Preferences;
use Espo\Entities\User;
use Espo\ORM\EntityManager;
use RuntimeException;
use stdClass;

class ChatFolderService
{
    public function __construct(
        private EntityManager $entityManager,
        private User $user
    ) {}

    public function getFolderList(): array
    {
        return $this->loadFolders();
    }

    public function createFolder(string $name): array
    {
        $name = $this->normalizeName($name);
        $folderList = $this->loadFolders();
        $normalizedName = mb_strtolower($name);

        foreach ($folderList as $folder) {
            if (mb_strtolower($folder['name']) === $normalizedName) {
                throw new RuntimeException('Folder already exists.');
            }
        }

        $folderList[] = [
            'id' => $this->generateFolderId(),
            'name' => $name,
            'chatIdList' => [],
            'sortOrder' => $this->getNextSortOrder($folderList),
        ];

        $this->saveFolders($folderList);

        return $this->loadFolders();
    }

    public function deleteFolder(string $folderId): array
    {
        $folderList = array_values(
            array_filter(
                $this->loadFolders(),
                fn (array $folder): bool => $folder['id'] !== $folderId
            )
        );

        $this->saveFolders($folderList);

        return $this->loadFolders();
    }

    public function setFolderMembership(string $folderId, string $chatId, bool $enabled): array
    {
        if ($chatId === '') {
            throw new RuntimeException('chatId is required.');
        }

        $folderList = $this->loadFolders();
        $isUpdated = false;

        foreach ($folderList as &$folder) {
            if ($folder['id'] !== $folderId) {
                continue;
            }

            $chatIdList = $folder['chatIdList'];

            if ($enabled && !in_array($chatId, $chatIdList, true)) {
                $chatIdList[] = $chatId;
            }

            if (!$enabled) {
                $chatIdList = array_values(
                    array_filter(
                        $chatIdList,
                        fn (string $item): bool => $item !== $chatId
                    )
                );
            }

            $folder['chatIdList'] = array_values(array_unique($chatIdList));
            $isUpdated = true;
            break;
        }
        unset($folder);

        if (!$isUpdated) {
            throw new RuntimeException('Folder not found.');
        }

        $this->saveFolders($folderList);

        return $this->loadFolders();
    }

    private function loadFolders(): array
    {
        $preferences = $this->getPreferences();
        $rawFolderList = $preferences->get('whatsappChatFolders');

        if (!is_array($rawFolderList)) {
            return [];
        }

        $folderList = [];

        foreach ($rawFolderList as $index => $item) {
            $data = $this->toArray($item);
            $id = trim((string) ($data['id'] ?? ''));
            $name = trim((string) ($data['name'] ?? ''));

            if ($id === '' || $name === '') {
                continue;
            }

            $chatIdList = is_array($data['chatIdList'] ?? null) ? $data['chatIdList'] : [];
            $sortOrder = isset($data['sortOrder']) ? (int) $data['sortOrder'] : $index + 1;

            $folderList[] = [
                'id' => $id,
                'name' => $name,
                'chatIdList' => array_values(
                    array_unique(
                        array_values(
                            array_filter(
                                array_map(
                                    fn ($chatId): string => trim((string) $chatId),
                                    $chatIdList
                                ),
                                fn (string $chatId): bool => $chatId !== ''
                            )
                        )
                    )
                ),
                'sortOrder' => $sortOrder,
            ];
        }

        usort(
            $folderList,
            function (array $a, array $b): int {
                $byOrder = ($a['sortOrder'] <=> $b['sortOrder']);

                if ($byOrder !== 0) {
                    return $byOrder;
                }

                return strcasecmp($a['name'], $b['name']);
            }
        );

        return $folderList;
    }

    private function saveFolders(array $folderList): void
    {
        $preferences = $this->getPreferences();
        $preferences->set('whatsappChatFolders', array_values($folderList));
        $this->entityManager->saveEntity($preferences);
    }

    private function getPreferences(): Preferences
    {
        /** @var ?Preferences $preferences */
        $preferences = $this->entityManager->getEntityById(Preferences::ENTITY_TYPE, $this->user->getId());

        if (!$preferences) {
            throw new RuntimeException('Preferences not found.');
        }

        return $preferences;
    }

    private function normalizeName(string $value): string
    {
        $value = trim($value);

        if ($value === '') {
            throw new RuntimeException('Folder name is required.');
        }

        return mb_substr($value, 0, 60);
    }

    private function getNextSortOrder(array $folderList): int
    {
        $max = 0;

        foreach ($folderList as $folder) {
            $max = max($max, (int) ($folder['sortOrder'] ?? 0));
        }

        return $max + 10;
    }

    private function generateFolderId(): string
    {
        return 'wa-folder-' . bin2hex(random_bytes(6));
    }

    /**
     * @return array<string, mixed>
     */
    private function toArray(mixed $item): array
    {
        if (is_array($item)) {
            return $item;
        }

        if ($item instanceof stdClass) {
            return get_object_vars($item);
        }

        return [];
    }
}
