import pool from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { format, subDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

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
