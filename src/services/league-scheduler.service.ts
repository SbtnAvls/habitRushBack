import { getCurrentLeagueWeek, startNewLeagueWeek } from './league-management.service';
import {
  simulateBotHabitCompletion,
  resetDailyBotXp,
  updateAllLeaguePositions,
  fillAllLeaguesWithBots,
  getCurrentHourActivityInfo,
} from './league-bot.service';
import { processWeekEnd, resetWeeklyXp, cleanupOldLeagueWeeks } from './league-weekly-processor.service';
import { CronJobExecutionModel } from '../models/cron-job-execution.model';

// Job IDs for tracking in CRON_JOB_EXECUTIONS table
const DAILY_BOT_RESET_JOB_ID = 'daily-bot-reset';
const DAILY_BOT_RESET_JOB_NAME = 'Daily Bot XP Reset';

/**
 * League Scheduler Service
 * Handles automatic execution of league-related cron jobs
 *
 * Jobs:
 * - Bot Simulation: Reset daily targets at 00:00, simulate habit completions every 30-45 min (7am-11pm)
 * - Daily: Update league positions at 08:00
 * - Weekly: End league week (Sunday), Start new week (Monday)
 * - Monthly: Cleanup old league weeks
 */
export class LeagueSchedulerService {
  private isRunning: boolean = false;
  private weeklyCheckInterval: NodeJS.Timeout | null = null;
  private monthlyInterval: NodeJS.Timeout | null = null;
  private monthlyCleanupTimeout: NodeJS.Timeout | null = null; // BUG-4 FIX: Save initial timeout
  private positionUpdateInterval: NodeJS.Timeout | null = null;
  private positionUpdateTimeout: NodeJS.Timeout | null = null; // BUG-2 FIX: Save initial timeout
  private botSimulationInterval: NodeJS.Timeout | null = null;
  private dailyResetTimeout: NodeJS.Timeout | null = null;
  private dailyResetInterval: NodeJS.Timeout | null = null;

  /**
   * Start all league schedulers
   * CRITICAL FIX: Now includes catch-up logic for daily bot reset on startup
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[LeagueScheduler] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.warn('[LeagueScheduler] Starting league scheduler service...');

    // CRITICAL FIX: Run catch-up check on startup (with delay to ensure DB is ready)
    setTimeout(async () => {
      console.warn('[LeagueScheduler] Running startup catch-up check for daily bot reset...');
      const didCatchUp = await this.runBotResetCatchUpIfNeeded();
      if (didCatchUp) {
        console.warn('[LeagueScheduler] Bot reset catch-up was executed on startup');
      }
    }, 10000); // 10 second delay to ensure DB connection is established

    // Start bot simulation jobs (frequent habit completion + daily reset)
    this.startBotSimulationJobs();

    // Start daily position updates at 08:00
    this.startPositionUpdateJob();

    // Start weekly job checker (end week on Sunday, start week on Monday)
    this.startWeeklyJobs();

    // Start monthly cleanup
    this.startMonthlyCleanup();

    console.warn('[LeagueScheduler] All schedulers started successfully');
  }

  /**
   * Stop all schedulers
   */
  stop(): void {
    if (this.botSimulationInterval) {
      clearTimeout(this.botSimulationInterval); // setTimeout, not setInterval
      this.botSimulationInterval = null;
    }
    if (this.dailyResetTimeout) {
      clearTimeout(this.dailyResetTimeout);
      this.dailyResetTimeout = null;
    }
    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
      this.dailyResetInterval = null;
    }
    // BUG-2 FIX: Clear position update timeout
    if (this.positionUpdateTimeout) {
      clearTimeout(this.positionUpdateTimeout);
      this.positionUpdateTimeout = null;
    }
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
    if (this.weeklyCheckInterval) {
      clearInterval(this.weeklyCheckInterval);
      this.weeklyCheckInterval = null;
    }
    // BUG-4 FIX: Clear monthly cleanup timeout
    if (this.monthlyCleanupTimeout) {
      clearTimeout(this.monthlyCleanupTimeout);
      this.monthlyCleanupTimeout = null;
    }
    if (this.monthlyInterval) {
      clearInterval(this.monthlyInterval);
      this.monthlyInterval = null;
    }
    this.isRunning = false;
    console.warn('[LeagueScheduler] All schedulers stopped');
  }

  /**
   * Calculate milliseconds until a specific hour of the day
   */
  private getTimeUntilHour(targetHour: number, targetMinute: number = 0): number {
    const now = new Date();
    const target = new Date();
    target.setHours(targetHour, targetMinute, 0, 0);

    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  /**
   * Generate random interval between min and max minutes
   */
  private getRandomIntervalMs(minMinutes: number, maxMinutes: number): number {
    const minutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
    return minutes * 60 * 1000;
  }

  /**
   * Check if current hour is within active hours for bot simulation (7am-11pm)
   */
  private isActiveHour(): boolean {
    const hour = new Date().getHours();
    return hour >= 7 && hour <= 23;
  }

  /**
   * Start bot simulation jobs:
   * - Daily reset at 00:00 (set daily targets for all bots)
   * - Frequent simulation every 30-45 minutes during active hours (7am-11pm)
   */
  private startBotSimulationJobs(): void {
    // 1. Schedule daily reset at 00:00
    const timeUntilReset = this.getTimeUntilHour(0, 0);
    console.warn(
      `[LeagueScheduler] Daily bot reset scheduled in ${Math.round(timeUntilReset / 1000 / 60)} minutes (at 00:00)`,
    );

    this.dailyResetTimeout = setTimeout(() => {
      this.runDailyBotReset();
      // Then run every 24 hours
      this.dailyResetInterval = setInterval(
        () => {
          this.runDailyBotReset();
        },
        24 * 60 * 60 * 1000,
      );
    }, timeUntilReset);

    // 2. Start frequent bot habit simulation
    // Run immediately if within active hours, then schedule recurring
    if (this.isActiveHour()) {
      console.warn('[LeagueScheduler] Starting bot simulation immediately (within active hours)');
      this.runBotHabitSimulation();
    } else {
      console.warn('[LeagueScheduler] Outside active hours (7am-11pm), bot simulation will start at 7am');
    }

    // Schedule recurring simulation every 30-45 minutes
    this.scheduleBotSimulation();
  }

  /**
   * Schedule the next bot simulation with random interval (30-45 minutes)
   */
  private scheduleBotSimulation(): void {
    const interval = this.getRandomIntervalMs(30, 45);
    console.warn(
      `[LeagueScheduler] Next bot simulation in ${Math.round(interval / 1000 / 60)} minutes`,
    );

    this.botSimulationInterval = setTimeout(() => {
      if (this.isActiveHour()) {
        this.runBotHabitSimulation();
      } else {
        const activityInfo = getCurrentHourActivityInfo();
        console.warn(
          `[LeagueScheduler] Skipping bot simulation - hour ${activityInfo.hour} is outside active hours (7am-11pm)`,
        );
      }
      // Schedule next execution with new random interval
      this.scheduleBotSimulation();
    }, interval);
  }

  /**
   * Start daily position update job at 08:00
   */
  private startPositionUpdateJob(): void {
    const timeUntilPositions = this.getTimeUntilHour(8, 0);
    console.warn(
      `[LeagueScheduler] Position updates scheduled in ${Math.round(timeUntilPositions / 1000 / 60)} minutes (at 08:00)`,
    );

    // BUG-2 FIX: Save timeout in variable so stop() can cancel it
    this.positionUpdateTimeout = setTimeout(() => {
      this.runPositionUpdates();
      // Then run every 24 hours
      this.positionUpdateInterval = setInterval(
        () => {
          this.runPositionUpdates();
        },
        24 * 60 * 60 * 1000,
      );
    }, timeUntilPositions);
  }

  /**
   * Start weekly jobs: Check every hour if we need to end/start a week
   */
  private startWeeklyJobs(): void {
    // Check every hour for weekly tasks
    console.warn('[LeagueScheduler] Weekly job checker started (checks every hour)');

    // Run immediately on startup
    this.checkWeeklyTasks();

    // Then check every hour
    this.weeklyCheckInterval = setInterval(
      () => {
        this.checkWeeklyTasks();
      },
      60 * 60 * 1000,
    );
  }

  /**
   * Start monthly cleanup job
   */
  private startMonthlyCleanup(): void {
    // Run on the 1st of each month at 03:00
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 0, 0);
    const timeUntilCleanup = nextMonth.getTime() - now.getTime();

    console.warn(
      `[LeagueScheduler] Monthly cleanup scheduled in ${Math.round(timeUntilCleanup / 1000 / 60 / 60 / 24)} days`,
    );

    // BUG-4 FIX: Save timeout in variable so stop() can cancel it
    this.monthlyCleanupTimeout = setTimeout(() => {
      this.runMonthlyCleanup();
      // Then run every ~30 days (will recalculate on each run)
      this.monthlyInterval = setInterval(
        () => {
          this.runMonthlyCleanup();
        },
        30 * 24 * 60 * 60 * 1000,
      );
    }, timeUntilCleanup);
  }

  /**
   * Run daily bot reset (at 00:00)
   * Sets daily XP targets for all bots based on their profiles
   */
  private async runDailyBotReset(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Running daily bot XP reset...');
      const currentWeek = await getCurrentLeagueWeek();

      if (!currentWeek) {
        console.warn('[LeagueScheduler] No active league week found, skipping bot reset');
        return;
      }

      const result = await resetDailyBotXp(currentWeek.id);
      console.warn(
        `[LeagueScheduler] Bot reset complete: ${result.botsReset} bots with targets, ${result.botsSkippingToday} bots skipping today`,
      );

      // Record successful execution for catch-up tracking
      await CronJobExecutionModel.recordExecution(
        DAILY_BOT_RESET_JOB_ID,
        DAILY_BOT_RESET_JOB_NAME,
        'success'
      );
    } catch (error) {
      console.error('[LeagueScheduler] Error in daily bot reset:', error);
      // Record failed execution
      await CronJobExecutionModel.recordExecution(
        DAILY_BOT_RESET_JOB_ID,
        DAILY_BOT_RESET_JOB_NAME,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      ).catch(e => console.error('[LeagueScheduler] Failed to record error:', e));
    }
  }

  /**
   * Check if daily bot reset catch-up is needed and run if necessary
   * This handles the case where the server was down during scheduled execution time (00:00)
   */
  async runBotResetCatchUpIfNeeded(): Promise<boolean> {
    try {
      const now = new Date();
      const currentHour = now.getHours();

      // Only consider catch-up if we're past the scheduled time (00:00)
      // but before the next scheduled time. After 00:00 but within same day.
      if (currentHour < 1) {
        console.warn('[LeagueScheduler] Too early for bot reset catch-up check (before 01:00), skipping');
        return false;
      }

      // Check if bot reset already ran successfully today
      const hasRunToday = await CronJobExecutionModel.hasRunToday(DAILY_BOT_RESET_JOB_ID);

      if (hasRunToday) {
        console.warn('[LeagueScheduler] Daily bot reset already ran today, no catch-up needed');
        return false;
      }

      console.warn('[LeagueScheduler] Bot reset catch-up needed! Running missed daily bot reset...');
      await this.runDailyBotReset();
      console.warn('[LeagueScheduler] Bot reset catch-up completed successfully');
      return true;
    } catch (error) {
      console.error('[LeagueScheduler] Error during bot reset catch-up:', error);
      return false;
    }
  }

  /**
   * Run bot habit simulation (every 30-45 minutes during active hours)
   * Simulates individual habit completions for bots that are active
   */
  private async runBotHabitSimulation(): Promise<void> {
    try {
      const currentWeek = await getCurrentLeagueWeek();

      if (!currentWeek) {
        return; // Silent return - no need to log every 30 min when no week exists
      }

      const activityInfo = getCurrentHourActivityInfo();
      const result = await simulateBotHabitCompletion(currentWeek.id);

      // Only log if there was meaningful activity
      if (result.botsUpdated > 0 || result.totalXpAdded > 0) {
        console.warn(
          `[LeagueScheduler] Bot simulation (hour ${activityInfo.hour}, ${activityInfo.expectedActivity} activity): ` +
            `${result.botsUpdated} habits completed, ${result.totalXpAdded} XP added, ` +
            `${result.botsAtLimit} at daily limit, ${result.botsSkippedByHour} skipped by hour pattern`,
        );
      }
    } catch (error) {
      console.error('[LeagueScheduler] Error in bot habit simulation:', error);
    }
  }

  /**
   * Run daily position updates
   */
  private async runPositionUpdates(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Running daily position updates...');
      const currentWeek = await getCurrentLeagueWeek();

      if (!currentWeek) {
        console.warn('[LeagueScheduler] No active league week found, skipping position updates');
        return;
      }

      const result = await updateAllLeaguePositions(currentWeek.id);
      console.warn(
        `[LeagueScheduler] Position updates complete: ${result.usersSynced} users synced, ${result.groupsUpdated} groups updated`,
      );
    } catch (error) {
      console.error('[LeagueScheduler] Error in position updates:', error);
    }
  }

  /**
   * Check if we need to run weekly tasks (end week on Sunday night, start week on Monday)
   */
  private async checkWeeklyTasks(): Promise<void> {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
    const hour = now.getHours();

    try {
      // Sunday at 23:00-23:59: End the current week
      if (dayOfWeek === 0 && hour === 23) {
        await this.runEndWeek();
      }

      // Monday at 00:00-00:59: Start new week
      if (dayOfWeek === 1 && hour === 0) {
        await this.runStartWeek();
      }
    } catch (error) {
      console.error('[LeagueScheduler] Error in weekly tasks check:', error);
    }
  }

  /**
   * End the current league week (Sunday night)
   */
  private async runEndWeek(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Running end of week processing...');
      const currentWeek = await getCurrentLeagueWeek();

      if (!currentWeek) {
        console.warn('[LeagueScheduler] No active league week found');
        return;
      }

      const result = await processWeekEnd(currentWeek.id);

      if (result.alreadyProcessed) {
        console.warn('[LeagueScheduler] Week already processed, skipping');
        return;
      }

      console.warn(
        `[LeagueScheduler] Week end processed: ${result.totalProcessed} users in ${result.totalGroups} groups`,
      );

      // Reset weekly XP for all users
      const resetCount = await resetWeeklyXp();
      console.warn(`[LeagueScheduler] Reset weekly XP for ${resetCount} users`);
    } catch (error) {
      console.error('[LeagueScheduler] Error in end week processing:', error);
    }
  }

  /**
   * Start a new league week (Monday morning)
   * Complete flow: create week -> distribute users -> fill with bots -> update positions
   */
  private async runStartWeek(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Starting new league week...');

      // Calculate the Monday of this week
      const now = new Date();
      const monday = new Date(now);
      monday.setHours(0, 0, 0, 0);

      // Check if week already exists
      const currentWeek = await getCurrentLeagueWeek();
      if (currentWeek) {
        const currentWeekStart = new Date(currentWeek.week_start);
        if (
          currentWeekStart.getFullYear() === monday.getFullYear() &&
          currentWeekStart.getMonth() === monday.getMonth() &&
          currentWeekStart.getDate() === monday.getDate()
        ) {
          console.warn('[LeagueScheduler] Week already started for today, skipping');
          return;
        }
      }

      // 1. Create week and distribute users
      const result = await startNewLeagueWeek(monday);
      console.warn(
        `[LeagueScheduler] New week started: ID=${result.weekId}, ${result.distributed} users distributed`,
      );

      // Log distribution by league
      for (const [leagueId, stats] of Object.entries(result.byLeague)) {
        if (stats.users > 0) {
          console.warn(`[LeagueScheduler]   League ${leagueId}: ${stats.users} users in ${stats.groups} groups`);
        }
      }

      // 2. Fill all league groups with bots
      const botsResult = await fillAllLeaguesWithBots(result.weekId);
      console.warn(`[LeagueScheduler] Bots created: ${botsResult.totalCreated} bots in ${botsResult.byLeagueGroup.length} groups`);

      // 3. Update initial positions
      const posResult = await updateAllLeaguePositions(result.weekId);
      console.warn(`[LeagueScheduler] Initial positions set: ${posResult.usersSynced} users, ${posResult.groupsUpdated} groups`);

    } catch (error) {
      console.error('[LeagueScheduler] Error starting new week:', error);
    }
  }

  /**
   * Run monthly cleanup of old league weeks
   */
  private async runMonthlyCleanup(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Running monthly cleanup...');
      const result = await cleanupOldLeagueWeeks(12); // Keep last 12 weeks

      if (result.weeksDeleted > 0) {
        console.warn(
          `[LeagueScheduler] Cleanup complete: ${result.weeksDeleted} weeks deleted, ${result.competitorsDeleted} competitors removed`,
        );
      } else {
        console.warn('[LeagueScheduler] No old weeks to clean up');
      }
    } catch (error) {
      console.error('[LeagueScheduler] Error in monthly cleanup:', error);
    }
  }

  /**
   * Manually trigger bot habit simulation (for testing)
   * Simulates a single cycle of habit completions
   */
  async triggerBotHabitSimulation(): Promise<{
    botsUpdated: number;
    totalXpAdded: number;
    botsAtLimit: number;
    botsSkippedByHour: number;
  } | null> {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) return null;
    return simulateBotHabitCompletion(currentWeek.id);
  }

  /**
   * Manually trigger daily bot reset (for testing)
   * Sets daily targets for all bots
   */
  async triggerDailyBotReset(): Promise<{
    botsReset: number;
    botsSkippingToday: number;
  } | null> {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) return null;
    return resetDailyBotXp(currentWeek.id);
  }

  /**
   * Manually trigger position updates (for testing)
   */
  async triggerPositionUpdates(): Promise<{ usersSynced: number; groupsUpdated: number } | null> {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) return null;
    return updateAllLeaguePositions(currentWeek.id);
  }
}

// Export singleton instance
export const leagueSchedulerService = new LeagueSchedulerService();
