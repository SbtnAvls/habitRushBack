import {
  evaluateAllUsersDailyHabits,
  evaluateAllUsersWithPendingRedemptions,
  processExpiredPendingRedemptions,
  notifyExpiringRedemptions,
  PendingRedemptionResult,
} from './habit-evaluation.service';
import { format } from 'date-fns';

/**
 * Servicio de evaluación diaria de hábitos
 * Debe ejecutarse todos los días después de medianoche (ej: 00:05)
 * para evaluar los hábitos del día anterior
 */
export class DailyEvaluationService {
  private isRunning: boolean = false;
  private lastExecutionDate: string | null = null;

  /**
   * Ejecuta la evaluación diaria de hábitos para todos los usuarios
   */
  async runDailyEvaluation(): Promise<void> {
    if (this.isRunning) {
      console.warn('[DailyEvaluation] Already running, skipping...');
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');

    if (this.lastExecutionDate === today) {
      console.warn(`[DailyEvaluation] Already executed today (${today}), skipping...`);
      return;
    }

    try {
      this.isRunning = true;
      console.warn(`[DailyEvaluation] Starting daily evaluation for ${today}`);

      const startTime = Date.now();
      const results = await evaluateAllUsersDailyHabits();
      const endTime = Date.now();

      // Calcular estadísticas
      const totalUsers = results.length;
      const usersWithMissedHabits = results.filter(r => r.missed_habits.length > 0).length;
      const totalLivesLost = results.reduce((sum, r) => sum + r.lives_lost, 0);
      const totalHabitsDisabled = results.reduce((sum, r) => sum + r.habits_disabled.length, 0);

      console.warn(`[DailyEvaluation] Completed in ${endTime - startTime}ms`);
      console.warn(
        `[DailyEvaluation] Stats: users=${totalUsers}, missed=${usersWithMissedHabits}, livesLost=${totalLivesLost}, habitsDisabled=${totalHabitsDisabled}`,
      );

      // Registrar usuarios que perdieron todas sus vidas
      const usersWithNoLives = results.filter(r => r.new_lives_total === 0);
      if (usersWithNoLives.length > 0) {
        console.warn(`[DailyEvaluation] ${usersWithNoLives.length} users have no lives left`);
      }

      this.lastExecutionDate = today;
    } catch (error) {
      console.error('[DailyEvaluation] Error during evaluation:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Inicia el servicio con programación automática
   * @param intervalMs - Intervalo en milisegundos (default: 24 horas)
   * @param runImmediately - Si debe ejecutarse inmediatamente al iniciar
   */
  startScheduled(intervalMs: number = 24 * 60 * 60 * 1000, runImmediately: boolean = false): NodeJS.Timeout {
    console.warn(`[DailyEvaluation] Starting scheduled service (interval: ${intervalMs}ms)`);

    if (runImmediately) {
      this.runDailyEvaluation().catch(error => {
        console.error('[DailyEvaluation] Error in immediate execution:', error);
      });
    }

    // Programar ejecución periódica
    const intervalId = setInterval(() => {
      this.runDailyEvaluation().catch(error => {
        console.error('[DailyEvaluation] Error in scheduled execution:', error);
      });
    }, intervalMs);

    return intervalId;
  }

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
   * Inicia el servicio para ejecutarse diariamente a las 00:05
   */
  startDailyAt0005(): NodeJS.Timeout {
    const timeUntilNext = DailyEvaluationService.getTimeUntilNextExecution();

    console.warn(`[DailyEvaluation] Scheduling first execution in ${Math.round(timeUntilNext / 1000 / 60)} minutes`);

    // Ejecutar la primera vez en el momento programado
    setTimeout(() => {
      this.runDailyEvaluation().catch(error => {
        console.error('[DailyEvaluation] Error in first scheduled execution:', error);
      });

      // Luego programar cada 24 horas
      this.startScheduled(24 * 60 * 60 * 1000, false);
    }, timeUntilNext);

    // Retornar un timeout vacío para mantener consistencia
    return setTimeout(() => {}, 0);
  }

  // ============================================================================
  // NEW PENDING REDEMPTION SYSTEM METHODS
  // ============================================================================

  /**
   * Runs the new evaluation system with pending redemptions
   * 1. First processes expired pending redemptions (from previous days)
   * 2. Then creates new pending redemptions for missed habits
   */
  async runDailyEvaluationWithPendingRedemptions(): Promise<void> {
    if (this.isRunning) {
      console.warn('[DailyEvaluation] Already running, skipping...');
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');

    if (this.lastExecutionDate === today) {
      console.warn(`[DailyEvaluation] Already executed today (${today}), skipping...`);
      return;
    }

    try {
      this.isRunning = true;
      console.warn(`[DailyEvaluation] Starting daily evaluation for ${today}`);

      const startTime = Date.now();

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

      this.lastExecutionDate = today;
    } catch (error) {
      console.error('[DailyEvaluation] Error during daily evaluation:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the new pending redemption system
   * Runs daily evaluation at 00:05
   * Also runs hourly notifications for expiring redemptions
   */
  startWithPendingRedemptions(): void {
    const timeUntilNext = DailyEvaluationService.getTimeUntilNextExecution();

    console.warn(`[DailyEvaluation] Scheduling daily evaluation in ${Math.round(timeUntilNext / 1000 / 60)} minutes`);

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
