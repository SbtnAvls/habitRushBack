import {
  evaluateAllUsersWithPendingRedemptions,
  processExpiredPendingRedemptions,
  notifyExpiringRedemptions,
  deactivateExpiredHabits,
  PendingRedemptionResult,
} from './habit-evaluation.service';
import { CronJobExecutionModel } from '../models/cron-job-execution.model';
import { format } from 'date-fns';

// Job ID for tracking in CRON_JOB_EXECUTIONS table
const DAILY_EVALUATION_JOB_ID = 'daily-evaluation';
const DAILY_EVALUATION_JOB_NAME = 'Daily Habit Evaluation';

/**
 * Servicio de evaluación diaria de hábitos
 * Debe ejecutarse todos los días después de medianoche (ej: 00:05)
 * para evaluar los hábitos del día anterior
 */
export class DailyEvaluationService {
  private isRunning: boolean = false;
  private lastExecutionDate: string | null = null;
  // HIGH FIX: Add lock to prevent race condition between isRunning check and set
  private executionLock: Promise<void> | null = null;

  /**
   * Calcula el tiempo hasta la próxima ejecución programada (00:05)
   */
  static getTimeUntilNextExecution(): number {
    const now = new Date();
    const next = new Date();

    // Configurar para las 00:05
    next.setHours(0, 5, 0, 0);

    // Si ya pasó la hora de hoy, configurar para mañana
    if (now > next) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime() - now.getTime();
  }

  /**
   * Runs the daily evaluation system with pending redemptions
   * 1. First processes expired pending redemptions (from previous days)
   * 2. Then creates new pending redemptions for missed habits
   * HIGH FIX: Uses execution lock to prevent TOCTOU race condition
   */
  async runDailyEvaluationWithPendingRedemptions(): Promise<void> {
    // HIGH FIX: Wait for any pending execution to complete first
    if (this.executionLock) {
      console.warn('[DailyEvaluation] Waiting for previous execution to complete...');
      await this.executionLock;
    }

    // HIGH FIX: Double-check after waiting (another call may have run while we waited)
    const today = format(new Date(), 'yyyy-MM-dd');
    if (this.lastExecutionDate === today) {
      console.warn(`[DailyEvaluation] Already executed today (${today}), skipping...`);
      return;
    }

    if (this.isRunning) {
      console.warn('[DailyEvaluation] Already running, skipping...');
      return;
    }

    // HIGH FIX: Set lock immediately before isRunning to prevent race
    let resolveLock: () => void;
    this.executionLock = new Promise<void>(resolve => {
      resolveLock = resolve;
    });

    try {
      this.isRunning = true;
      console.warn(`[DailyEvaluation] Starting daily evaluation for ${today}`);

      const startTime = Date.now();

      // Step 0: Deactivate habits with expired target_date
      console.warn('[DailyEvaluation] Step 0: Deactivating expired habits...');
      const deactivatedCount = await deactivateExpiredHabits();
      if (deactivatedCount > 0) {
        console.warn(`[DailyEvaluation] Deactivated ${deactivatedCount} habits with expired target_date`);
      }

      // Step 1: Process expired pending redemptions (user didn't decide yesterday)
      console.warn('[DailyEvaluation] Step 1: Processing expired pending redemptions...');
      const expiredCount = await processExpiredPendingRedemptions();
      if (expiredCount > 0) {
        console.warn(`[DailyEvaluation] Processed ${expiredCount} expired pending redemptions`);
      }

      // Step 2: Evaluate missed habits and create new pending redemptions
      console.warn('[DailyEvaluation] Step 2: Evaluating missed habits...');
      const results = await evaluateAllUsersWithPendingRedemptions();
      const endTime = Date.now();

      // Calculate statistics
      const totalUsers = results.length;
      const usersWithMissedHabits = results.filter((r: PendingRedemptionResult) => r.missed_habits.length > 0).length;
      const totalPendingCreated = results.reduce(
        (sum: number, r: PendingRedemptionResult) => sum + r.pending_redemptions_created,
        0,
      );

      console.warn(`[DailyEvaluation] Completed in ${endTime - startTime}ms`);
      console.warn(
        `[DailyEvaluation] Stats: users=${totalUsers}, missed=${usersWithMissedHabits}, pendingCreated=${totalPendingCreated}`,
      );
      // Record successful execution in database for catch-up tracking
      await CronJobExecutionModel.recordExecution(
        DAILY_EVALUATION_JOB_ID,
        DAILY_EVALUATION_JOB_NAME,
        'success'
      );
      console.warn('[DailyEvaluation] Execution recorded in CRON_JOB_EXECUTIONS');
    } catch (error) {
      console.error('[DailyEvaluation] Error during daily evaluation:', error);
      // Record failed execution
      await CronJobExecutionModel.recordExecution(
        DAILY_EVALUATION_JOB_ID,
        DAILY_EVALUATION_JOB_NAME,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      ).catch(e => console.error('[DailyEvaluation] Failed to record error:', e));
      throw error;
    } finally {
      // CRITICAL FIX: Always update lastExecutionDate to prevent double-runs on same day
      // Even if evaluation fails, we don't want to retry the same day's evaluation
      // (as that could cause double-charging or other issues)
      this.lastExecutionDate = today;
      this.isRunning = false;
      // HIGH FIX: Release the lock to allow waiting callers to proceed
      resolveLock!();
      this.executionLock = null;
    }
  }

  /**
   * Check if catch-up is needed and run if necessary
   * This handles the case where the server was down during scheduled execution time
   */
  async runCatchUpIfNeeded(): Promise<boolean> {
    try {
      const now = new Date();
      const currentHour = now.getHours();

      // Only consider catch-up if we're past the scheduled time (00:05)
      // This prevents running before the scheduled time on a fresh start
      if (currentHour < 1) {
        console.warn('[DailyEvaluation] Too early for catch-up check (before 01:00), skipping');
        return false;
      }

      // Check if evaluation already ran successfully today
      const hasRunToday = await CronJobExecutionModel.hasRunToday(DAILY_EVALUATION_JOB_ID);

      if (hasRunToday) {
        console.warn('[DailyEvaluation] Already ran successfully today, no catch-up needed');
        // Sync in-memory state with database
        this.lastExecutionDate = format(now, 'yyyy-MM-dd');
        return false;
      }

      console.warn('[DailyEvaluation] Catch-up needed! Running missed daily evaluation...');
      await this.runDailyEvaluationWithPendingRedemptions();
      console.warn('[DailyEvaluation] Catch-up completed successfully');
      return true;
    } catch (error) {
      console.error('[DailyEvaluation] Error during catch-up:', error);
      return false;
    }
  }

  /**
   * Start the new pending redemption system
   * Runs daily evaluation at 00:05
   * Also runs hourly notifications for expiring redemptions
   * CRITICAL FIX: Now includes catch-up logic on startup
   */
  startWithPendingRedemptions(): void {
    const timeUntilNext = DailyEvaluationService.getTimeUntilNextExecution();

    console.warn(`[DailyEvaluation] Scheduling daily evaluation in ${Math.round(timeUntilNext / 1000 / 60)} minutes`);

    // CRITICAL FIX: Run catch-up check on startup (with delay to ensure DB is ready)
    setTimeout(async () => {
      console.warn('[DailyEvaluation] Running startup catch-up check...');
      const didCatchUp = await this.runCatchUpIfNeeded();
      if (didCatchUp) {
        console.warn('[DailyEvaluation] Catch-up was executed on startup');
      }
    }, 8000); // 8 second delay to ensure DB connection is established

    setTimeout(() => {
      this.runDailyEvaluationWithPendingRedemptions().catch(error => {
        console.error('[DailyEvaluation] Error in first scheduled evaluation:', error);
      });

      // Then run every 24 hours
      setInterval(
        () => {
          this.runDailyEvaluationWithPendingRedemptions().catch(error => {
            console.error('[DailyEvaluation] Error in scheduled evaluation:', error);
          });
        },
        24 * 60 * 60 * 1000,
      );
    }, timeUntilNext);

    // Start hourly notification job for expiring redemptions
    this.startHourlyNotifications();
  }

  /**
   * Start hourly notifications for pending redemptions about to expire
   * Notifies users 3 hours before expiration
   */
  startHourlyNotifications(): void {
    console.warn('[DailyEvaluation] Starting hourly notification job for expiring redemptions');

    // Run immediately on startup
    this.runExpiringNotifications();

    // Then run every hour
    setInterval(
      () => {
        this.runExpiringNotifications();
      },
      60 * 60 * 1000,
    ); // Every hour
  }

  /**
   * Send notifications for pending redemptions about to expire
   */
  private async runExpiringNotifications(): Promise<void> {
    try {
      const notifiedCount = await notifyExpiringRedemptions(3); // 3 hours before expiry
      if (notifiedCount > 0) {
        console.warn(`[DailyEvaluation] Sent ${notifiedCount} expiring redemption notifications`);
      }
    } catch (error) {
      console.error('[DailyEvaluation] Error sending expiring notifications:', error);
    }
  }
}

// Exportar instancia singleton
export const dailyEvaluationService = new DailyEvaluationService();
