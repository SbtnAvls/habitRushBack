import { Request, Response, NextFunction } from 'express';
import { CronJobExecutionModel } from '../models/cron-job-execution.model';

// Map of endpoint patterns to cron job IDs
const ENDPOINT_TO_JOB_MAP: Record<string, { id: string; name: string }> = {
  '/leagues/admin/simulate-bots': { id: 'simulate-bots-xp', name: 'Simulate Bot XP' },
  '/leagues/admin/update-positions': { id: 'update-league-positions', name: 'Update League Positions' },
  '/leagues/admin/end-week': { id: 'end-league-week', name: 'End League Week' },
  '/leagues/admin/start-week': { id: 'start-league-week', name: 'Start New League Week' },
  '/leagues/admin/cleanup': { id: 'cleanup-old-league-weeks', name: 'Cleanup Old League Weeks' },
  '/habits/admin/cleanup-inactive': { id: 'cleanup-inactive-habits', name: 'Cleanup Inactive Habits' },
};

/**
 * Middleware that tracks cron job executions.
 * Should be applied to admin routes that are called by cron jobs.
 */
export const cronTrackingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Get the base path without query parameters
  const basePath = req.baseUrl + req.path.replace(/\/$/, '');
  const jobInfo = ENDPOINT_TO_JOB_MAP[basePath];

  if (!jobInfo) {
    // Not a tracked cron endpoint
    return next();
  }

  // Track execution when response finishes
  res.on('finish', () => {
    const success = res.statusCode >= 200 && res.statusCode < 300;

    CronJobExecutionModel.recordExecution(
      jobInfo.id,
      jobInfo.name,
      success ? 'success' : 'failed',
      !success ? `HTTP ${res.statusCode}` : undefined
    )
      .then(() => {
        console.log(`[CronTracking] Recorded ${success ? 'success' : 'failure'} for job: ${jobInfo.id}`);
      })
      .catch(err => {
        console.error(`[CronTracking] Failed to record execution for ${jobInfo.id}:`, err);
      });
  });

  next();
};
