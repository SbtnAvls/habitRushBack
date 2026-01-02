import pool from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { format, subDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { NotificationModel } from '../models/notification.model';
import { LifeHistoryModel } from '../models/life-history.model';
import { onPendingExpired } from './stats.service';

export interface HabitEvaluationResult {
  user_id: string;
  date: string;
  missed_habits: string[];
  lives_lost: number;
  new_lives_total: number;
  habits_disabled: string[];
}

/**
 * Evalúa los hábitos fallados de un usuario para una fecha específica
 * y aplica las penalizaciones correspondientes (pérdida de vidas y deshabilitación)
 */
export async function evaluateMissedHabits(
  userId: string,
  evaluationDate: Date = new Date(),
): Promise<HabitEvaluationResult> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const dateStr = format(evaluationDate, 'yyyy-MM-dd');
    const dayOfWeek = evaluationDate.getDay();

    // 1. Obtener todos los hábitos activos del usuario programados para este día
    const [habits] = await connection.execute<RowDataPacket[]>(
      `SELECT id, title, frequency_type, frequency_days
       FROM HABITS
       WHERE user_id = UUID_TO_BIN(?)
       AND is_active = 1
       AND active_by_user = 1
       AND start_date <= ?
       AND (end_date IS NULL OR end_date >= ?)`,
      [userId, dateStr, dateStr],
    );

    const missedHabitIds: string[] = [];
    const habitsScheduledForToday = habits.filter((habit: RowDataPacket) => {
      const _habitId = Buffer.isBuffer(habit.id)
        ? habit.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
        : habit.id;

      // Verificar si el hábito estaba programado para hoy
      if (habit.frequency_type === 'daily') {
        return true;
      } else if (habit.frequency_type === 'weekly' && habit.frequency_days) {
        const days = JSON.parse(habit.frequency_days);
        return days.includes(dayOfWeek);
      }
      return false;
    });

    // 2. Verificar cuáles NO fueron completados
    for (const habit of habitsScheduledForToday) {
      const habitId = Buffer.isBuffer(habit.id)
        ? habit.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
        : habit.id;

      const [completions] = await connection.execute<RowDataPacket[]>(
        `SELECT completed
         FROM HABIT_COMPLETIONS
         WHERE habit_id = UUID_TO_BIN(?)
         AND user_id = UUID_TO_BIN(?)
         AND date = ?`,
        [habitId, userId, dateStr],
      );

      // Si no hay registro o está marcado como no completado
      if (completions.length === 0 || completions[0].completed === 0) {
        missedHabitIds.push(habitId);
      }
    }

    if (missedHabitIds.length === 0) {
      await connection.commit();
      return {
        user_id: userId,
        date: dateStr,
        missed_habits: [],
        lives_lost: 0,
        new_lives_total: 0,
        habits_disabled: [],
      };
    }

    // 3. Obtener el usuario actual
    const [users] = await connection.execute<RowDataPacket[]>(
      'SELECT lives, max_lives FROM USERS WHERE id = UUID_TO_BIN(?)',
      [userId],
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const currentLives = users[0].lives;
    const livesToLose = missedHabitIds.length;
    const newLives = Math.max(0, currentLives - livesToLose);

    // 4. Actualizar las vidas del usuario
    await connection.execute('UPDATE USERS SET lives = ? WHERE id = UUID_TO_BIN(?)', [newLives, userId]);

    // 5. Registrar en LIFE_HISTORY para cada hábito fallado
    for (const habitId of missedHabitIds) {
      const historyId = uuidv4();
      await connection.execute(
        `INSERT INTO LIFE_HISTORY
         (id, user_id, lives_change, current_lives, reason, related_habit_id, created_at)
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, UUID_TO_BIN(?), NOW())`,
        [historyId, userId, -1, newLives, 'habit_missed', habitId],
      );
    }

    // 6. Si el usuario se quedó sin vidas, deshabilitar TODOS sus hábitos activos
    const disabledHabits: string[] = [];
    if (newLives === 0) {
      // Obtener todos los hábitos activos (no solo los fallados)
      const [allActiveHabits] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM HABITS
         WHERE user_id = UUID_TO_BIN(?)
         AND is_active = 1`,
        [userId],
      );

      for (const habit of allActiveHabits) {
        const habitId = Buffer.isBuffer(habit.id)
          ? habit.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
          : habit.id;
        disabledHabits.push(habitId);
      }

      // Deshabilitar todos los hábitos
      await connection.execute(
        `UPDATE HABITS
         SET is_active = 0,
             disabled_at = NOW(),
             disabled_reason = 'no_lives'
         WHERE user_id = UUID_TO_BIN(?)
         AND is_active = 1`,
        [userId],
      );
    }

    await connection.commit();

    return {
      user_id: userId,
      date: dateStr,
      missed_habits: missedHabitIds,
      lives_lost: livesToLose,
      new_lives_total: newLives,
      habits_disabled: disabledHabits,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Evalúa todos los usuarios para detectar hábitos fallados del día anterior
 * Esta función debe ser llamada diariamente (ej: a las 00:05)
 */
export async function evaluateAllUsersDailyHabits(): Promise<HabitEvaluationResult[]> {
  const connection = await pool.getConnection();

  try {
    // Obtener todos los usuarios activos
    const [users] = await connection.execute<RowDataPacket[]>('SELECT id FROM USERS WHERE is_active = 1');

    const results: HabitEvaluationResult[] = [];
    const yesterday = subDays(new Date(), 1);

    for (const user of users) {
      const userId = Buffer.isBuffer(user.id)
        ? user.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
        : user.id;

      try {
        const result = await evaluateMissedHabits(userId, yesterday);
        results.push(result);
      } catch (error) {
        console.error(`Error evaluating habits for user ${userId}:`, error);
      }
    }

    return results;
  } finally {
    connection.release();
  }
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
    const [users] = await connection.execute<RowDataPacket[]>('SELECT max_lives FROM USERS WHERE id = UUID_TO_BIN(?)', [
      userId,
    ]);

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const maxLives = users[0].max_lives;

    // 2. Restaurar todas las vidas
    await connection.execute('UPDATE USERS SET lives = ? WHERE id = UUID_TO_BIN(?)', [maxLives, userId]);

    // 3. Reactivar todos los hábitos que fueron deshabilitados por falta de vidas
    await connection.execute(
      `UPDATE HABITS
       SET is_active = 1,
           disabled_at = NULL,
           disabled_reason = NULL
       WHERE user_id = UUID_TO_BIN(?)
       AND disabled_reason = 'no_lives'`,
      [userId],
    );

    // 4. Registrar la resurrección en LIFE_HISTORY
    const historyId = uuidv4();
    await connection.execute(
      `INSERT INTO LIFE_HISTORY
       (id, user_id, lives_change, current_lives, reason, created_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, NOW())`,
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
    const [habits] = await connection.query<RowDataPacket[]>(
      `SELECT id, name, frequency_type, frequency_days_of_week
       FROM HABITS
       WHERE user_id = ?
       AND is_active = 1
       AND active_by_user = 1
       AND start_date <= ?
       AND (target_date IS NULL OR target_date >= ?)
       AND deleted_at IS NULL`,
      [userId, dateStr, dateStr],
    );

    const missedHabitIds: string[] = [];
    const missedHabitNames: Map<string, string> = new Map();

    // Filter habits scheduled for today
    for (const habit of habits) {
      let isScheduledForToday = false;

      if (habit.frequency_type === 'daily') {
        isScheduledForToday = true;
      } else if (habit.frequency_type === 'weekly' && habit.frequency_days_of_week) {
        const days = habit.frequency_days_of_week.split(',').map(Number);
        isScheduledForToday = days.includes(dayOfWeek);
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

/**
 * Evaluates all users for missed habits and creates pending redemptions
 * This function should be called daily (e.g., at 00:05)
 */
export async function evaluateAllUsersWithPendingRedemptions(): Promise<PendingRedemptionResult[]> {
  const [users] = await pool.query<RowDataPacket[]>('SELECT id FROM USERS WHERE is_active = 1');

  const results: PendingRedemptionResult[] = [];
  const yesterday = subDays(new Date(), 1);

  for (const user of users) {
    try {
      const result = await evaluateMissedHabitsWithPendingRedemptions(user.id, yesterday);
      results.push(result);
    } catch (error) {
      console.error(`Error evaluating habits for user ${user.id}:`, error);
    }
  }

  return results;
}

/**
 * Process expired pending redemptions
 * Called at the start of daily evaluation - expires pendings from previous days
 */
export async function processExpiredPendingRedemptions(): Promise<number> {
  // Get pendings that were created before today (user didn't decide in time)
  const expired = await PendingRedemptionModel.getPendingToAutoExpire();
  let processedCount = 0;

  for (const pending of expired) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

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
      const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [
        pending.user_id,
      ]);
      const currentLives = userRows[0]?.lives ?? 0;

      // Record in LIFE_HISTORY
      await LifeHistoryModel.create(
        pending.user_id,
        -1,
        currentLives,
        'pending_expired',
        { habitId: pending.habit_id },
        connection,
      );

      // Apply extra discipline penalty for not deciding
      await onPendingExpired(pending.user_id, connection);

      // Create notification
      await NotificationModel.create(
        {
          user_id: pending.user_id,
          type: 'life_warning',
          title: 'Redenci\u00f3n expirada',
          message: `El tiempo para redimir tu h\u00e1bito fallado expir\u00f3. Perdiste 1 vida. Vidas restantes: ${currentLives}`,
          related_habit_id: pending.habit_id,
        },
        connection,
      );

      // Check if user died
      if (currentLives === 0) {
        await handleUserDeath(pending.user_id, connection);
      }

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
