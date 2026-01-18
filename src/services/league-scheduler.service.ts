import { getCurrentLeagueWeek, startNewLeagueWeek } from './league-management.service';
import { simulateDailyBotXp, updateAllLeaguePositions } from './league-bot.service';
import { processWeekEnd, resetWeeklyXp, cleanupOldLeagueWeeks } from './league-weekly-processor.service';

/**
 * League Scheduler Service
 * Handles automatic execution of league-related cron jobs
 *
 * Jobs:
 * - Daily: Simulate bot XP, Update league positions
 * - Weekly: End league week (Sunday), Start new week (Monday)
 * - Monthly: Cleanup old league weeks
 */
export class LeagueSchedulerService {
  private isRunning: boolean = false;
  private dailyInterval: NodeJS.Timeout | null = null;
  private weeklyCheckInterval: NodeJS.Timeout | null = null;
  private monthlyInterval: NodeJS.Timeout | null = null;

  /**
   * Start all league schedulers
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[LeagueScheduler] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.warn('[LeagueScheduler] Starting league scheduler service...');

    // Start daily jobs (bot XP simulation + position updates)
    this.startDailyJobs();

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
    if (this.dailyInterval) {
      clearInterval(this.dailyInterval);
      this.dailyInterval = null;
    }
    if (this.weeklyCheckInterval) {
      clearInterval(this.weeklyCheckInterval);
      this.weeklyCheckInterval = null;
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
   * Start daily jobs: Bot XP simulation at 00:10 and position updates at 08:00
   */
  private startDailyJobs(): void {
    // Schedule bot XP simulation at 00:10 daily
    const timeUntilBotXp = this.getTimeUntilHour(0, 10);
    console.warn(
      `[LeagueScheduler] Bot XP simulation scheduled in ${Math.round(timeUntilBotXp / 1000 / 60)} minutes`,
    );

    setTimeout(() => {
      this.runDailyBotXpSimulation();
      // Then run every 24 hours
      this.dailyInterval = setInterval(
        () => {
          this.runDailyBotXpSimulation();
        },
        24 * 60 * 60 * 1000,
      );
    }, timeUntilBotXp);

    // Schedule position updates at 08:00 daily
    const timeUntilPositions = this.getTimeUntilHour(8, 0);
    console.warn(
      `[LeagueScheduler] Position updates scheduled in ${Math.round(timeUntilPositions / 1000 / 60)} minutes`,
    );

    setTimeout(() => {
      this.runPositionUpdates();
      // Then run every 24 hours
      setInterval(
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

    setTimeout(() => {
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
   * Run daily bot XP simulation
   */
  private async runDailyBotXpSimulation(): Promise<void> {
    try {
      console.warn('[LeagueScheduler] Running daily bot XP simulation...');
      const currentWeek = await getCurrentLeagueWeek();

      if (!currentWeek) {
        console.warn('[LeagueScheduler] No active league week found, skipping bot simulation');
        return;
      }

      const result = await simulateDailyBotXp(currentWeek.id);
      console.warn(
        `[LeagueScheduler] Bot XP simulation complete: ${result.botsUpdated} bots updated, ${result.totalXpAdded} XP added`,
      );
    } catch (error) {
      console.error('[LeagueScheduler] Error in bot XP simulation:', error);
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
   * Manually trigger bot XP simulation (for testing)
   */
  async triggerBotXpSimulation(): Promise<{ botsUpdated: number; totalXpAdded: number } | null> {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) return null;
    return simulateDailyBotXp(currentWeek.id);
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
