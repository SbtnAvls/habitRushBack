import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';

export type LifeChallengeStatus = 'pending' | 'obtained' | 'redeemed';

export interface UserLifeChallengeStatus {
  life_challenge_id: string;
  title: string;
  description: string;
  reward: number;
  redeemable_type: 'once' | 'unlimited';
  icon: string;
  status: LifeChallengeStatus;
  obtained_at?: Date;
  redeemed_at?: Date;
  can_redeem: boolean;
}

/**
 * Funciones de verificación para cada Life Challenge
 * Cada función verifica si el usuario cumple con los requisitos específicos
 */
const verificationFunctions: { [key: string]: (userId: string, connection: PoolConnection) => Promise<boolean> } = {
  // Mantén un hábito durante una semana completa sin perder vidas
  // Evalúa la SEMANA ANTERIOR completa para evitar falsos positivos
  verifyWeekWithoutLosingLives: async (userId: string, connection: PoolConnection) => {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });

    // Evaluar la semana anterior (ya completada)
    const lastWeekStart = subDays(currentWeekStart, 7);
    const lastWeekEnd = subDays(currentWeekStart, 1);

    // Verificar que el usuario tenía al menos un hábito activo durante esa semana
    const [habits] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as habit_count
       FROM HABITS
       WHERE user_id = UUID_TO_BIN(?)
       AND is_active = 1
       AND start_date <= ?`,
      [userId, format(lastWeekStart, 'yyyy-MM-dd')],
    );

    if ((habits[0].habit_count as number) === 0) {
      return false;
    }

    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as lost_lives_count
       FROM LIFE_HISTORY
       WHERE user_id = UUID_TO_BIN(?)
       AND reason = 'habit_missed'
       AND created_at BETWEEN ? AND ?`,
      [userId, format(lastWeekStart, 'yyyy-MM-dd'), format(lastWeekEnd, 'yyyy-MM-dd 23:59:59')],
    );

    return (result[0].lost_lives_count as number) === 0;
  },

  // Mantén un hábito durante un mes completo sin perder vidas
  // Evalúa el MES ANTERIOR completo para evitar falsos positivos
  verifyMonthWithoutLosingLives: async (userId: string, connection: PoolConnection) => {
    const today = new Date();
    const currentMonthStart = startOfMonth(today);

    // Evaluar el mes anterior (ya completado)
    const lastMonthStart = startOfMonth(subDays(currentMonthStart, 1));
    const lastMonthEnd = endOfMonth(lastMonthStart);

    // Verificar que el usuario tenía al menos un hábito activo durante ese mes
    const [habits] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as habit_count
       FROM HABITS
       WHERE user_id = UUID_TO_BIN(?)
       AND is_active = 1
       AND start_date <= ?`,
      [userId, format(lastMonthStart, 'yyyy-MM-dd')],
    );

    if ((habits[0].habit_count as number) === 0) {
      return false;
    }

    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as lost_lives_count
       FROM LIFE_HISTORY
       WHERE user_id = UUID_TO_BIN(?)
       AND reason = 'habit_missed'
       AND created_at BETWEEN ? AND ?`,
      [userId, format(lastMonthStart, 'yyyy-MM-dd'), format(lastMonthEnd, 'yyyy-MM-dd 23:59:59')],
    );

    return (result[0].lost_lives_count as number) === 0;
  },

  // Completa un hábito faltando menos de 1 hora para acabar el día
  verifyLastHourSave: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as late_completions
       FROM HABIT_COMPLETIONS
       WHERE user_id = UUID_TO_BIN(?)
       AND completed = 1
       AND TIME(completed_at) >= '23:00:00'`,
      [userId],
    );

    return (result[0].late_completions as number) > 0;
  },

  // Registra progreso de un hábito antes de las 6 AM
  verifyEarlyBird: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as early_completions
       FROM HABIT_COMPLETIONS
       WHERE user_id = UUID_TO_BIN(?)
       AND completed = 1
       AND TIME(completed_at) <= '06:00:00'`,
      [userId],
    );

    return (result[0].early_completions as number) > 0;
  },

  // Completa al menos 3 hábitos durante una semana completa sin faltar
  // Evalúa la SEMANA ANTERIOR completa para evitar falsos positivos
  verifyThreeHabitsWeek: async (userId: string, connection: PoolConnection) => {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });

    // Evaluar la semana anterior (ya completada)
    const lastWeekStart = subDays(currentWeekStart, 7);
    const lastWeekEnd = subDays(currentWeekStart, 1);

    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT h.id) as completed_habits
       FROM HABITS h
       WHERE h.user_id = UUID_TO_BIN(?)
       AND h.is_active = 1
       AND h.start_date <= ?
       AND NOT EXISTS (
         SELECT 1 FROM (
           SELECT DATE(DATE_ADD(?, INTERVAL seq.seq DAY)) as check_date
           FROM (
             SELECT 0 as seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
             UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
           ) seq
         ) dates
         WHERE NOT EXISTS (
           SELECT 1 FROM HABIT_COMPLETIONS hc
           WHERE hc.habit_id = h.id
           AND hc.date = dates.check_date
           AND hc.completed = 1
         )
         AND dates.check_date BETWEEN ? AND ?
       )`,
      [userId, format(lastWeekStart, 'yyyy-MM-dd'), format(lastWeekStart, 'yyyy-MM-dd'), format(lastWeekStart, 'yyyy-MM-dd'), format(lastWeekEnd, 'yyyy-MM-dd')],
    );

    return (result[0].completed_habits as number) >= 3;
  },

  // Completa un hábito llegando a su fecha objetivo (mínimo 4 meses)
  verifyTargetDateReached: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as target_reached
       FROM HABITS h
       WHERE h.user_id = UUID_TO_BIN(?)
       AND h.target_date IS NOT NULL
       AND h.target_date <= CURDATE()
       AND DATEDIFF(h.target_date, h.start_date) >= 120
       AND EXISTS (
         SELECT 1 FROM HABIT_COMPLETIONS hc
         WHERE hc.habit_id = h.id
         AND hc.date = h.target_date
         AND hc.completed = 1
       )`,
      [userId],
    );

    return (result[0].target_reached as number) > 0;
  },

  // Completa 5 retos redimibles solo una vez
  verifyFiveOnceChallenges: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT lcr.life_challenge_id) as redeemed_once_challenges
       FROM LIFE_CHALLENGE_REDEMPTIONS lcr
       JOIN LIFE_CHALLENGES lc ON lcr.life_challenge_id = lc.id
       WHERE lcr.user_id = UUID_TO_BIN(?)
       AND lc.redeemable_type = 'once'`,
      [userId],
    );

    return (result[0].redeemed_once_challenges as number) >= 5;
  },

  // No te quedes sin vidas durante 2 meses seguidos
  verifyTwoMonthsAlive: async (userId: string, connection: PoolConnection) => {
    const twoMonthsAgo = subDays(new Date(), 60);

    // Verificar que la cuenta tenga al menos 60 días de antigüedad
    const [accountAge] = await connection.execute<RowDataPacket[]>(
      `SELECT created_at FROM USERS WHERE id = UUID_TO_BIN(?)`,
      [userId],
    );

    if (accountAge.length === 0) {
      return false;
    }

    const accountCreatedAt = new Date(accountAge[0].created_at);
    const daysSinceCreation = Math.floor(
      (new Date().getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // La cuenta debe tener al menos 60 días
    if (daysSinceCreation < 60) {
      return false;
    }

    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as zero_lives_moments
       FROM LIFE_HISTORY
       WHERE user_id = UUID_TO_BIN(?)
       AND current_lives = 0
       AND created_at >= ?`,
      [userId, format(twoMonthsAgo, 'yyyy-MM-dd')],
    );

    return (result[0].zero_lives_moments as number) === 0;
  },

  // Acumula 1000 horas en un hábito
  verify1000Hours: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT SUM(hc.progress_value) as total_minutes
       FROM HABIT_COMPLETIONS hc
       JOIN HABITS h ON hc.habit_id = h.id
       WHERE hc.user_id = UUID_TO_BIN(?)
       AND h.progress_type = 'time'
       AND hc.completed = 1
       GROUP BY h.id
       ORDER BY total_minutes DESC
       LIMIT 1`,
      [userId],
    );

    if (result.length === 0) {
      return false;
    }
    const totalHours = ((result[0].total_minutes as number) || 0) / 60;
    return totalHours >= 1000;
  },

  // Escribe 200 notas entre todos tus hábitos
  verify200Notes: async (userId: string, connection: PoolConnection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as notes_count
       FROM HABIT_COMPLETIONS
       WHERE user_id = UUID_TO_BIN(?)
       AND notes IS NOT NULL
       AND notes != ''`,
      [userId],
    );

    return (result[0].notes_count as number) >= 200;
  },
};

/**
 * Evalúa si el usuario ha cumplido con algún Life Challenge
 * Se ejecuta después de cada completamiento de hábito
 */
export async function evaluateLifeChallenges(userId: string): Promise<UserLifeChallengeStatus[]> {
  const connection = await pool.getConnection();

  try {
    // 1. Obtener todos los Life Challenges activos
    const [lifeChallenges] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM LIFE_CHALLENGES WHERE is_active = 1',
    );

    const userStatuses: UserLifeChallengeStatus[] = [];

    for (const challenge of lifeChallenges) {
      const challengeId = Buffer.isBuffer(challenge.id)
        ? challenge.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
        : challenge.id;

      // 2. Verificar si ya fue redimido (para challenges 'once')
      const [redemptions] = await connection.execute<RowDataPacket[]>(
        `SELECT * FROM LIFE_CHALLENGE_REDEMPTIONS
         WHERE user_id = UUID_TO_BIN(?)
         AND life_challenge_id = UUID_TO_BIN(?)
         ORDER BY redeemed_at DESC
         LIMIT 1`,
        [userId, challengeId],
      );

      const wasRedeemed = redemptions.length > 0;
      const lastRedemption = wasRedeemed ? redemptions[0] : null;

      // 3. Evaluar si cumple los requisitos actualmente
      const verificationFunc = verificationFunctions[challenge.verification_function];
      let isCurrentlyEligible = false;

      if (verificationFunc) {
        try {
          isCurrentlyEligible = await verificationFunc(userId, connection);
        } catch (_error) {
          // Skip evaluation error for this challenge
        }
      }

      // 4. Determinar el estado
      let status: LifeChallengeStatus;
      let canRedeem = false;

      if (challenge.redeemable_type === 'once') {
        if (wasRedeemed) {
          status = 'redeemed';
          canRedeem = false;
        } else if (isCurrentlyEligible) {
          status = 'obtained';
          canRedeem = true;
        } else {
          status = 'pending';
          canRedeem = false;
        }
      } else {
        // unlimited
        if (wasRedeemed && !isCurrentlyEligible) {
          status = 'redeemed';
          canRedeem = false;
        } else if (isCurrentlyEligible) {
          status = 'obtained';
          canRedeem = true;
        } else {
          status = 'pending';
          canRedeem = false;
        }
      }

      userStatuses.push({
        life_challenge_id: challengeId,
        title: challenge.title,
        description: challenge.description,
        reward: challenge.reward,
        redeemable_type: challenge.redeemable_type,
        icon: challenge.icon,
        status,
        obtained_at: isCurrentlyEligible ? new Date() : undefined,
        redeemed_at: lastRedemption?.redeemed_at,
        can_redeem: canRedeem,
      });
    }

    return userStatuses;
  } finally {
    connection.release();
  }
}

/**
 * Obtiene el estado de todos los Life Challenges para un usuario
 * Incluye información sobre si puede redimir cada challenge
 */
export async function getUserLifeChallengeStatuses(userId: string): Promise<UserLifeChallengeStatus[]> {
  return evaluateLifeChallenges(userId);
}

/**
 * Redime un Life Challenge si el usuario cumple los requisitos
 * Verifica primero si está en estado 'obtained'
 */
export async function redeemLifeChallengeWithValidation(
  userId: string,
  lifeChallengeId: string,
): Promise<{ success: boolean; message: string; livesGained?: number; code?: string }> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Evaluar el estado actual del challenge
    const statuses = await evaluateLifeChallenges(userId);
    const challengeStatus = statuses.find(s => s.life_challenge_id === lifeChallengeId);

    if (!challengeStatus) {
      await connection.rollback();
      return {
        success: false,
        message: 'Life Challenge no encontrado',
      };
    }

    if (!challengeStatus.can_redeem) {
      await connection.rollback();
      return {
        success: false,
        message:
          challengeStatus.status === 'redeemed'
            ? 'Este challenge ya fue redimido'
            : 'Aún no cumples los requisitos para redimir este challenge',
      };
    }

    // 2. Obtener información del usuario
    const [users] = await connection.execute<RowDataPacket[]>(
      'SELECT lives, max_lives FROM USERS WHERE id = UUID_TO_BIN(?)',
      [userId],
    );

    const currentLives = users[0].lives as number;
    const maxLives = users[0].max_lives as number;
    const availableSlots = maxLives - currentLives;
    const reward = challengeStatus.reward;

    // 2.1 Si el usuario está muerto (0 vidas), NO puede redimir Life Challenges
    // Debe completar los retos de resurrección que requieren validación manual
    if (currentLives === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'No puedes redimir retos mientras estás sin vidas. Completa un reto de resurrección para revivir.',
        code: 'USER_DEAD',
      };
    }

    // 2.2 Si ya tiene el máximo de vidas, no puede redimir
    if (availableSlots === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Ya tienes el máximo de vidas posibles',
      };
    }

    // 2.2 Para retos tipo 'once': NO permitir si no hay espacio suficiente
    // (para no desperdiciar un reto que solo se puede redimir una vez)
    if (challengeStatus.redeemable_type === 'once' && availableSlots < reward) {
      await connection.rollback();
      return {
        success: false,
        message: `Necesitas ${reward} casillas de vida disponibles para redimir este reto. Actualmente tienes ${availableSlots} casilla(s) disponible(s). Aumenta tu máximo de vidas para no perder recompensa.`,
        code: 'INSUFFICIENT_LIFE_SLOTS',
      };
    }

    // 2.3 Para retos 'unlimited': permitir redención parcial (el front ya preguntó al usuario)
    const newLives = Math.min(currentLives + reward, maxLives);
    const actualLivesGained = newLives - currentLives;

    // 3. Actualizar vidas del usuario
    await connection.execute('UPDATE USERS SET lives = ? WHERE id = UUID_TO_BIN(?)', [newLives, userId]);

    // 3.5. If user was dead (0 lives) and now has lives, reactivate habits
    if (currentLives === 0 && newLives > 0) {
      await connection.execute(
        `UPDATE HABITS
         SET is_active = 1, disabled_at = NULL, disabled_reason = NULL
         WHERE user_id = UUID_TO_BIN(?)
         AND disabled_reason = 'no_lives'
         AND deleted_at IS NULL`,
        [userId],
      );
    }

    // 4. Registrar la redención
    const redemptionId = uuidv4();
    await connection.execute(
      `INSERT INTO LIFE_CHALLENGE_REDEMPTIONS
       (id, user_id, life_challenge_id, lives_gained, redeemed_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, NOW())`,
      [redemptionId, userId, lifeChallengeId, actualLivesGained],
    );

    // 5. Registrar en LIFE_HISTORY
    const historyId = uuidv4();
    await connection.execute(
      `INSERT INTO LIFE_HISTORY
       (id, user_id, lives_change, current_lives, reason, related_life_challenge_id, created_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, UUID_TO_BIN(?), NOW())`,
      [historyId, userId, actualLivesGained, newLives, 'life_challenge_redeemed', lifeChallengeId],
    );

    await connection.commit();

    return {
      success: true,
      message: `¡Challenge redimido! Has ganado ${actualLivesGained} vida(s)`,
      livesGained: actualLivesGained,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
