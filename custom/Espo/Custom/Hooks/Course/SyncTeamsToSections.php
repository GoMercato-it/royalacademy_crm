<?php
namespace Espo\Custom\Hooks\Course;

use Espo\Core\Hook\Hook\AfterSave;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\ORM\Repository\Option\SaveOptions;

/**
 * When a Course is saved, synchronize its Teams to all its Sections.
 * This ensures that if a Team is granted access to a Course,
 * they also gain visibility to its Sections in the portal.
 */
class SyncTeamsToSections implements AfterSave
{
    public function __construct(private EntityManager $entityManager)
    {
    }

    public function afterSave(Entity $entity, SaveOptions $options): void
    {
        error_log("SyncTeamsToSections: Hook triggered for Course " . $entity->getId());

        // Get Teams assigned to the Course
        $teams = $this->entityManager
            ->getRDBRepository('Course')
            ->getRelation($entity, 'teams')
            ->find();

        $teamIds = [];
        foreach ($teams as $team) {
            $teamIds[] = $team->getId();
        }
        error_log("SyncTeamsToSections: Course Teams count: " . count($teamIds));

        // Get Sections related to this Course
        $sections = $this->entityManager
            ->getRDBRepository('Course')
            ->getRelation($entity, 'sections')
            ->find();
        error_log("SyncTeamsToSections: Found " . count($sections) . " sections via relation");

        foreach ($sections as $section) {
            // Get current teams of the section
            $sectionTeams = $this->entityManager
                ->getRDBRepository('CourseSection')
                ->getRelation($section, 'teams')
                ->find();
            
            $currentSectionTeamIds = [];
            foreach ($sectionTeams as $st) {
                $currentSectionTeamIds[] = $st->getId();
            }

            // Sync: relate teams that are in Course but not in Section
            foreach ($teamIds as $tId) {
                if (!in_array($tId, $currentSectionTeamIds)) {
                    error_log("SyncTeamsToSections: Relating team " . $tId . " to section " . $section->getId());
                    $this->entityManager
                        ->getRDBRepository('CourseSection')
                        ->getRelation($section, 'teams')
                        ->relateById($tId);
                }
            }

            // Unrelate teams that are in Section but not in Course
            foreach ($currentSectionTeamIds as $stId) {
                if (!in_array($stId, $teamIds)) {
                    error_log("SyncTeamsToSections: Unrelating team " . $stId . " from section " . $section->getId());
                    $this->entityManager
                        ->getRDBRepository('CourseSection')
                        ->getRelation($section, 'teams')
                        ->unrelateById($stId);
                }
            }
        }
    }
}
