<?php

namespace Espo\Custom\Classes\Jobs;

use Espo\Core\Job\JobDataLess;
use Espo\Core\Utils\Log;
use Espo\Modules\Workflows\Services\ScheduledWorkflowQueueService;
use Throwable;

class QueueScheduledWorkflows implements JobDataLess
{
    public function __construct(
        private ScheduledWorkflowQueueService $scheduledWorkflowQueueService,
        private Log $log
    ) {
    }

    public function run(): void
    {
        try {
            $stats = $this->scheduledWorkflowQueueService->processDueDefinitions();

            $this->log->info('QueueScheduledWorkflows completed.', $stats);
        } catch (Throwable $e) {
            $this->log->error(
                'QueueScheduledWorkflows failed: ' . $e->getMessage(),
                ['exception' => $e]
            );

            throw $e;
        }
    }
}
