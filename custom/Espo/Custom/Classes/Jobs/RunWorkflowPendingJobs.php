<?php

namespace Espo\Custom\Classes\Jobs;

use Espo\Core\Job\JobDataLess;
use Espo\Core\Utils\Log;
use Espo\Modules\Workflows\Services\WorkflowPendingJobService;
use Throwable;

class RunWorkflowPendingJobs implements JobDataLess
{
    public function __construct(
        private WorkflowPendingJobService $workflowPendingJobService,
        private Log $log
    ) {
    }

    public function run(): void
    {
        try {
            $stats = $this->workflowPendingJobService->processDueJobs();

            $this->log->info('RunWorkflowPendingJobs completed.', $stats);
        } catch (Throwable $e) {
            $this->log->error(
                'RunWorkflowPendingJobs failed: ' . $e->getMessage(),
                ['exception' => $e]
            );

            throw $e;
        }
    }
}
