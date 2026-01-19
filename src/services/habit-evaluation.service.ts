import pool from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { format, subDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { PendingRedemptionModel, PendingRedemption } from '../models/pending-redemption.model';
import { PendingValidationModel } from '../models/pending-validation.model';
import { NotificationModel } from '../models/notification.model';
import { LifeHistoryModel } from '../models/life-history.model';
import { onPendingExpired, onChallengeCompleted } from './stats.service';

/**
 * Deactivates habits whose target_date has passed.
 * These habits are no longer relevant and should be marked as inactive.
 * Should be called as part of daily evaluation.
 */
export async function deactivateExpiredHabits(): Promise<number> {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE HABITS
     SET is_active = 0,
         active_by_user = 0,
         disabled_at = NOW(),
         disabled_reason = 'manual'
     WHERE is_active = 1
     AND target_date IS NOT NULL
     AND target_date < ?
     AND deleted_at IS NULL`,
    [today],
  );

  if (result.affectedRows > 0) {
    console.info(`[DeactivateExpired] Deactivated ${result.affectedRows} habits with expired target_date`);
  }

  return result.affectedRows;
}

/**
 * Revive al usuario con todas sus vidas máximas y reactiva sus hábitos
 * Se llama cuando el usuario completa un challenge estando sin vidas
 */
export async function reviveUser(userId: string): Promise<void> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Obtener las vidas máximas del usuario
    // NOTE: DB uses CHAR(36) for UUIDs, not BINARY(16), so no UUID_TO_BIN needed
    const [users] = await connection.execute<RowDataPacket[]>('SELECT max_lives FROM USERS WHERE id = ?', [userId]);

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const maxLives = users[0].max_lives;

    // 2. Restaurar todas las vidas
    await connection.execute('UPDATE USERS SET lives = ? WHERE id = ?', [maxLives, userId]);

    // 3. Reactivar todos los hábitos que fueron deshabilitados por falta de vidas
    await connection.execute(
      `UPDATE HABITS
       SET is_active = 1,
           disabled_at = NULL,
           disabled_reason = NULL
       WHERE user_id = ?
       AND disabled_reason = 'no_lives'`,
      [userId],
    );

    // 4. Registrar la resurrección en LIFE_HISTORY
    const historyId = uuidv4();
    await connection.execute(
      `INSERT INTO LIFE_HISTORY
       (id, user_id, lives_change, current_lives, reason, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [historyId, userId, maxLives, maxLives, 'user_revived'],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Maneja la desactivación manual de un hábito por el usuario
 * Borra todo el progreso excepto las notas e imágenes
 */
export async function deactivateHabitManually(habitId: string, userId: string): Promise<void> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Desactivar el hábito y resetear su progreso
    await connection.execute<ResultSetHeader>(
      `UPDATE HABITS
       SET active_by_user = 0,
           disabled_at = NOW(),
           disabled_reason = 'manual',
           current_streak = 0,
           last_completed_date = NULL
       WHERE id = ?
       AND user_id = ?`,
      [habitId, userId],
    );

    // 2. Resetear completamientos que tienen notas O imágenes (preservarlos)
    await connection.execute<ResultSetHeader>(
      `UPDATE HABIT_COMPLETIONS hc
       SET hc.completed = 0,
           hc.progress_value = NULL,
           hc.target_value = NULL,
           hc.completed_at = NULL
       WHERE hc.habit_id = ?
       AND hc.user_id = ?
       AND (
         hc.notes IS NOT NULL
         OR EXISTS (
           SELECT 1 FROM COMPLETION_IMAGES ci
           WHERE ci.completion_id = hc.id
         )
       )`,
      [habitId, userId],
    );

    // 3. Eliminar completamientos que NO tienen notas NI imágenes
    await connection.execute<ResultSetHeader>(
      `DELETE FROM HABIT_COMPLETIONS
       WHERE habit_id = ?
       AND user_id = ?
       AND notes IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM COMPLETION_IMAGES ci
         WHERE ci.completion_id = HABIT_COMPLETIONS.id
       )`,
      [habitId, userId],
    );

    // 4. Eliminar challenges asignados a este hábito
    await connection.execute<ResultSetHeader>(
      `UPDATE USER_CHALLENGES
       SET status = 'expired'
       WHERE habit_id = ?
       AND user_id = ?
       AND status = 'assigned'`,
      [habitId, userId],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================================
// NEW PENDING REDEMPTION SYSTEM
// ============================================================================

export interface PendingRedemptionResult {
  user_id: string;
  date: string;
  missed_habits: string[];
  pending_redemptions_created: number;
}

/**
 * Evaluates missed habits for a user and creates pending redemptions (24h grace period)
 * instead of immediately deducting lives.
 * Uses CHAR(36) UUID format consistent with the database schema.
 */
export async function evaluateMissedHabitsWithPendingRedemptions(
  userId: string,
  evaluationDate: Date = new Date(),
): Promise<PendingRedemptionResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const dateStr = format(evaluationDate, 'yyyy-MM-dd');
    const dayOfWeek = evaluationDate.getDay();

    // 1. Get all active habits for the user scheduled for this day
    // NOTE: We also check that the habit was created BEFORE the evaluation date
    // to give users a 24h grace period for newly created habits
    const [habits] = await connection.query<RowDataPacket[]>(
      `SELECT id, name, frequency_type, frequency_days_of_week
       FROM HABITS
       WHERE user_id = ?
       AND is_active = 1
       AND active_by_user = 1
       AND start_date <= ?
       AND (target_date IS NULL OR target_date >= ?)
       AND DATE(created_at) < ?
       AND deleted_at IS NULL`,
      [userId, dateStr, dateStr, dateStr],
    );

    const missedHabitIds: string[] = [];
    const missedHabitNames: Map<string, string> = new Map();

    // Filter habits scheduled for today
    for (const habit of habits) {
      let isScheduledForToday = false;

      if (habit.frequency_type === 'daily') {
        isScheduledForToday = true;
      } else if (habit.frequency_type === 'weekly' || habit.frequency_type === 'custom') {
        // Handle both 'weekly' and 'custom' frequency types
        // Frontend sends 'custom' for: Entre semana, Fines de semana, Personalizado
        if (habit.frequency_days_of_week) {
          const days = habit.frequency_days_of_week.split(',').map(Number);
          isScheduledForToday = days.includes(dayOfWeek);
        } else {
          // WARNING: Custom/weekly habit without frequency_days_of_week
          // This is a data integrity issue - log it and treat as daily to not silently skip
          console.warn(
            `[HabitEvaluation] Habit ${habit.id} has frequency_type='${habit.frequency_type}' but no frequency_days_of_week. Treating as daily.`,
          );
          isScheduledForToday = true;
        }
      }

      if (!isScheduledForToday) continue;

      // 2. Check if the habit was completed
      const [completions] = await connection.query<RowDataPacket[]>(
        `SELECT completed FROM HABIT_COMPLETIONS
         WHERE habit_id = ? AND user_id = ? AND date = ?`,
        [habit.id, userId, dateStr],
      );

      // If no record or not completed
      if (completions.length === 0 || completions[0].completed === 0) {
        missedHabitIds.push(habit.id);
        missedHabitNames.set(habit.id, habit.name);
      }
    }

    if (missedHabitIds.length === 0) {
      await connection.commit();
      return {
        user_id: userId,
        date: dateStr,
        missed_habits: [],
        pending_redemptions_created: 0,
      };
    }

    // 3. Create pending redemptions for each missed habit
    // (only if the habit doesn't already have an active pending - was blocked)
    let pendingCreated = 0;
    for (const habitId of missedHabitIds) {
      // Check if habit already has an active pending (was blocked, user couldn't complete it)
      // Both 'pending' and 'challenge_assigned' mean the habit is blocked
      const [activePending] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM PENDING_REDEMPTIONS
         WHERE user_id = ? AND habit_id = ? AND status IN ('pending', 'challenge_assigned')`,
        [userId, habitId],
      );

      // If habit was blocked (has active pending), skip creating another one
      if (activePending.length > 0) {
        continue;
      }

      // Check if a pending redemption already exists for this specific date
      const [existingForDate] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM PENDING_REDEMPTIONS
         WHERE user_id = ? AND habit_id = ? AND failed_date = ?`,
        [userId, habitId, dateStr],
      );

      if (existingForDate.length === 0) {
        // Create pending redemption
        await PendingRedemptionModel.create(userId, habitId, evaluationDate, connection);
        pendingCreated++;

        // Create notification
        const habitName = missedHabitNames.get(habitId) || 'tu h\u00e1bito';
        await NotificationModel.create(
          {
            user_id: userId,
            type: 'pending_redemption',
            title: 'H\u00e1bito fallado',
            message: `Fallaste "${habitName}". Tienes hasta el final del d\u00eda para decidir: perder una vida o completar un challenge.`,
            related_habit_id: habitId,
          },
          connection,
        );
      }
    }

    await connection.commit();

    return {
      user_id: userId,
      date: dateStr,
      missed_habits: missedHabitIds,
      pending_redemptions_created: pendingCreated,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Batch size for user processing to avoid memory issues with large user bases
const USER_BATCH_SIZE = 100;

/**
 * Evaluates all users for missed habits and creates pending redemptions
 * This function should be called daily (e.g., at 00:05)
 * Uses pagination to avoid loading all users into memory
 */
export async function evaluateAllUsersWithPendingRedemptions(): Promise<PendingRedemptionResult[]> {
  const results: PendingRedemptionResult[] = [];
  const yesterday = subDays(new Date(), 1);

  let offset = 0;
  let hasMoreUsers = true;

  while (hasMoreUsers) {
    // CRITICAL FIX: Paginate user query to avoid OOM with large user bases
    const [users] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM USERS ORDER BY id LIMIT ? OFFSET ?',
      [USER_BATCH_SIZE, offset],
    );

    if (users.length === 0) {
      hasMoreUsers = false;
      break;
    }

    for (const user of users) {
      try {
        const result = await evaluateMissedHabitsWithPendingRedemptions(user.id, yesterday);
        results.push(result);
      } catch (error) {
        console.error(`Error evaluating habits for user ${user.id}:`, error);
      }
    }

    offset += USER_BATCH_SIZE;

    // If we got fewer users than batch size, we're done
    if (users.length < USER_BATCH_SIZE) {
      hasMoreUsers = false;
    }
  }

  return results;
}

// Maximum days a pending redemption can exist before forced expiration (even if AI fails)
const MAX_PENDING_DAYS = 3;

/**
 * Helper function to expire a pending redemption within a connection/transaction
 * Extracts common expiration logic to avoid duplication
 */
async function expireWithConnection(pending: PendingRedemption, connection: PoolConnection): Promise<void> {
  // Mark as expired
  await PendingRedemptionModel.markAsExpired(pending.id, connection);

  // If user had assigned a challenge, mark it as expired too
  if (pending.challenge_id) {
    await connection.query(
      `UPDATE USER_CHALLENGES
       SET status = 'expired', completed_at = NOW()
       WHERE user_id = ? AND challenge_id = ? AND status = 'assigned'`,
      [pending.user_id, pending.challenge_id],
    );
  }

  // Deduct one life from the user
  await connection.query('UPDATE USERS SET lives = GREATEST(0, lives - 1) WHERE id = ?', [pending.user_id]);

  // Get current lives
  const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [pending.user_id]);
  const currentLives = userRows[0]?.lives ?? 0;

  // Record in LIFE_HISTORY
  await LifeHistoryModel.create(pending.user_id, -1, currentLives, 'pending_expired', { habitId: pending.habit_id }, connection);

  // Apply extra discipline penalty for not deciding
  await onPendingExpired(pending.user_id, connection);

  // Create notification
  await NotificationModel.create(
    {
      user_id: pending.user_id,
      type: 'life_warning',
      title: 'Redención expirada',
      message: `El tiempo para redimir tu hábito fallado expiró. Perdiste 1 vida. Vidas restantes: ${currentLives}`,
      related_habit_id: pending.habit_id,
    },
    connection,
  );

  // Check if user died
  if (currentLives === 0) {
    await handleUserDeath(pending.user_id, connection);
  }
}

/**
 * Process expired pending redemptions
 * Called at the start of daily evaluation - expires pendings from previous days
 *
 * IMPORTANT: Before expiring, checks if there's a pending validation in progress.
 * If so, processes it with AI first to avoid unfairly penalizing users who submitted
 * proof but haven't been reviewed yet.
 *
 * SAFETY: If a pending has existed for more than MAX_PENDING_DAYS days, it will be
 * force-expired even if AI validation fails, to prevent users from getting stuck.
 */
export async function processExpiredPendingRedemptions(): Promise<number> {
  // Get pendings that were created before today (user didn't decide in time)
  const expired = await PendingRedemptionModel.getPendingToAutoExpire();
  let processedCount = 0;

  for (const pending of expired) {
    // Calculate how many days this pending has existed
    const pendingAgeDays = Math.floor(
      (Date.now() - new Date(pending.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const forceExpire = pendingAgeDays >= MAX_PENDING_DAYS;

    if (forceExpire) {
      console.warn(
        `[ExpiredRedemptions] Pending ${pending.id} is ${pendingAgeDays} days old (max: ${MAX_PENDING_DAYS}), forcing expiration`,
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // CRITICAL FIX: Lock the pending redemption row FIRST to prevent race conditions
      const [currentPending] = await connection.query<RowDataPacket[]>(
        `SELECT status FROM PENDING_REDEMPTIONS WHERE id = ? FOR UPDATE`,
        [pending.id],
      );

      if (!currentPending[0] || !['pending', 'challenge_assigned'].includes(currentPending[0].status)) {
        // Pending was already resolved by user or another process, skip
        await connection.commit();
        connection.release();
        continue;
      }

      // CRITICAL FIX: Check for pending validation INSIDE transaction after lock
      const pendingValidation = await PendingValidationModel.findByPendingRedemptionId(pending.id);

      if (pendingValidation && pendingValidation.status === 'pending_review') {
        // There's a validation waiting to be reviewed - release lock and process with AI
        // We release the lock because AI processing can take 30+ seconds
        await connection.commit();
        connection.release();

        console.info(`[ExpiredRedemptions] Found pending validation for ${pending.id}, processing with AI first`);

        try {
          // Dynamically import to avoid circular dependency
          const { processValidationWithAI } = await import('./validation-processor.service');
          const aiResult = await processValidationWithAI(pendingValidation);

          if (aiResult.is_valid) {
            // AI approved - the validation processor already resolved the redemption
            console.info(`[ExpiredRedemptions] AI approved validation for ${pending.id}, skipping expiration`);
            processedCount++;
            continue; // Skip expiration - user successfully completed challenge
          }
          // AI rejected - need to re-acquire lock and continue with expiration
          console.info(`[ExpiredRedemptions] AI rejected validation for ${pending.id}, proceeding with expiration`);
        } catch (error) {
          console.error(`[ExpiredRedemptions] Error processing validation for ${pending.id}:`, error);
          // If AI fails and pending is not too old, give benefit of the doubt
          if (!forceExpire) {
            console.info(`[ExpiredRedemptions] Skipping ${pending.id} for now, will retry next cycle`);
            continue;
          }
          // Pending is too old - force expire it
          console.warn(`[ExpiredRedemptions] Force expiring ${pending.id} despite AI failure (too old)`);
        }

        // Re-acquire connection and lock for expiration
        const expireConnection = await pool.getConnection();
        try {
          await expireConnection.beginTransaction();

          // Re-check status after AI processing
          const [recheckPending] = await expireConnection.query<RowDataPacket[]>(
            `SELECT status FROM PENDING_REDEMPTIONS WHERE id = ? FOR UPDATE`,
            [pending.id],
          );

          if (!recheckPending[0] || !['pending', 'challenge_assigned'].includes(recheckPending[0].status)) {
            // Status changed during AI processing (maybe approved), skip
            await expireConnection.commit();
            expireConnection.release();
            continue;
          }

          // Proceed with expiration using expireConnection
          await expireWithConnection(pending, expireConnection);
          await expireConnection.commit();
          processedCount++;
        } catch (innerError) {
          await expireConnection.rollback();
          throw innerError;
        } finally {
          expireConnection.release();
        }
        continue;
      }

      // No pending validation - proceed with expiration directly using helper
      await expireWithConnection(pending, connection);
      await connection.commit();
      processedCount++;
    } catch (error) {
      await connection.rollback();
      console.error(`Error processing expired pending ${pending.id}:`, error);
    } finally {
      connection.release();
    }
  }

  return processedCount;
}

/**
 * Handle user death (when lives reach 0)
 * Disables all active habits and creates death notification
 */
export async function handleUserDeath(userId: string, connection: PoolConnection): Promise<void> {
  // Cancel all pending redemptions (user is already dead, can't lose more lives)
  const cancelledCount = await PendingRedemptionModel.cancelAllForUser(userId, connection);
  if (cancelledCount > 0) {
    console.warn(`[handleUserDeath] Cancelled ${cancelledCount} pending redemptions for user ${userId}`);
  }

  // Also mark any assigned challenges as expired (user died before completing them)
  await connection.query(
    `UPDATE USER_CHALLENGES SET status = 'expired', completed_at = NOW()
     WHERE user_id = ? AND status = 'assigned'`,
    [userId],
  );

  // Disable all active habits
  await connection.query(
    `UPDATE HABITS
     SET is_active = 0,
         disabled_at = NOW(),
         disabled_reason = 'no_lives'
     WHERE user_id = ?
     AND is_active = 1`,
    [userId],
  );

  // Create death notification
  await NotificationModel.create(
    {
      user_id: userId,
      type: 'death',
      title: '\u00a1Has perdido todas tus vidas!',
      message:
        'Todos tus h\u00e1bitos han sido desactivados. Debes completar una penitencia para revivir o empezar de cero.',
    },
    connection,
  );
}

/**
 * Send notifications for pending redemptions about to expire
 * This should be called every hour
 */
export async function notifyExpiringRedemptions(hoursBeforeExpiry: number = 3): Promise<number> {
  const expiring = await PendingRedemptionModel.getExpiringWithinHours(hoursBeforeExpiry);
  let notifiedCount = 0;

  for (const pending of expiring) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Create notification
      const timeRemaining = Math.ceil((new Date(pending.expires_at).getTime() - Date.now()) / (1000 * 60 * 60));
      await NotificationModel.create(
        {
          user_id: pending.user_id,
          type: 'pending_expiring',
          title: '\u00a1Tiempo limitado!',
          message: `Te quedan aproximadamente ${timeRemaining} horas para redimir "${pending.habit_name}". Decide antes de que expire.`,
          related_habit_id: pending.habit_id,
        },
        connection,
      );

      // Mark as notified
      await PendingRedemptionModel.markAsNotified(pending.id, connection);

      await connection.commit();
      notifiedCount++;
    } catch (error) {
      await connection.rollback();
      console.error(`Error notifying for pending ${pending.id}:`, error);
    } finally {
      connection.release();
    }
  }

  return notifiedCount;
}
