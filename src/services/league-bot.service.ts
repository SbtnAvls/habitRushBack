import { RowDataPacket, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { COMPETITORS_PER_LEAGUE } from '../models/league-week.model';

// Nombres genéricos para bots (género neutro, internacionales)
const BOT_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
  'Riley', 'Quinn', 'Avery', 'Peyton', 'Cameron',
  'Dakota', 'Reese', 'Finley', 'Skyler', 'Jamie',
  'Drew', 'Sage', 'Rowan', 'River', 'Phoenix',
  'Blake', 'Charlie', 'Hayden', 'Kendall', 'Logan',
  'Parker', 'Emerson', 'Addison', 'Bailey', 'Devon',
  'Ellis', 'Frankie', 'Gray', 'Harper', 'Indie',
  'Jesse', 'Kit', 'Lane', 'Marley', 'Nico',
  'Oakley', 'Pat', 'Remy', 'Shay', 'Tatum',
  'Val', 'Winter', 'Zion', 'Ash', 'Brook'
];

// Perfiles de actividad de bots (para simulación realista)
type BotProfile = 'lazy' | 'casual' | 'active' | 'hardcore';

interface BotProfileConfig {
  dailyXpMin: number;
  dailyXpMax: number;
  skipDayChance: number;
  // Campos para simulacion granular (habito por habito)
  avgHabitsPerDayMin: number;   // minimo de habitos/dia
  avgHabitsPerDayMax: number;   // maximo de habitos/dia
  xpPerHabitMin: number;        // XP minimo por habito completado
  xpPerHabitMax: number;        // XP maximo por habito completado
  hourlyActivityChance: number; // probabilidad de completar habito en cada hora activa
}

// Active hours configuration (7am to 10pm = 15 hours window)
const ACTIVE_HOURS_PER_DAY = 15;

// ============================================================================
// PHASE 3: Hourly Activity Patterns (Human-like behavior)
// ============================================================================

/**
 * Hourly activity weights (0-23 hours)
 * Higher weight = higher probability of bot activity
 *
 * Peaks:
 * - Morning: 7-9 AM (0.6-0.8) - people completing morning routines
 * - Lunch: 12-13 (0.6-0.7) - break time activity
 * - Evening: 18-21 (0.7-1.0) - peak activity after work/school
 *
 * Minimums:
 * - Late night: 0-5 AM (0.01-0.05) - most people sleeping
 * - Work hours: 15-17 (0.3-0.5) - lower but not zero
 */
const HOURLY_ACTIVITY_WEIGHTS: Record<number, number> = {
  0: 0.05,
  1: 0.02,
  2: 0.01,
  3: 0.01,
  4: 0.02,
  5: 0.05,
  6: 0.3,
  7: 0.6,
  8: 0.8,
  9: 0.5,
  10: 0.3,
  11: 0.4,
  12: 0.7,
  13: 0.6,
  14: 0.4,
  15: 0.3,
  16: 0.4,
  17: 0.5,
  18: 0.7,
  19: 0.9,
  20: 1.0,
  21: 0.8,
  22: 0.5,
  23: 0.2,
};

/**
 * Generate a deterministic number from a string (bot ID)
 * Used to create consistent per-bot behavior variations
 */
function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get activity probability for a specific hour with random variance
 * @param hour - Hour of day (0-23)
 * @param botId - Optional bot ID for per-bot variation
 * @returns Probability between 0 and 1
 */
function getActivityProbability(hour: number, botId?: string): number {
  // Apply per-bot hour offset if botId provided
  // Some bots are "morning people", others "night owls"
  let effectiveHour = hour;
  if (botId) {
    const botOffset = (hashStringToNumber(botId) % 3) - 1; // -1, 0, or +1 hour
    effectiveHour = (hour + botOffset + 24) % 24;
  }

  const baseWeight = HOURLY_ACTIVITY_WEIGHTS[effectiveHour] ?? 0.1;

  // Add random variance (+/- 20%) for natural variation
  const variance = (Math.random() - 0.5) * 0.4;
  return Math.max(0, Math.min(1, baseWeight + variance));
}

const BOT_PROFILES: Record<BotProfile, BotProfileConfig> = {
  lazy: {
    dailyXpMin: 10,
    dailyXpMax: 40,
    skipDayChance: 0.4,
    avgHabitsPerDayMin: 1,
    avgHabitsPerDayMax: 3,
    xpPerHabitMin: 5,
    xpPerHabitMax: 15,
    // Calculated: avg 2 habits / 15 hours = ~13% per hour
    hourlyActivityChance: 0.13,
  },
  casual: {
    dailyXpMin: 30,
    dailyXpMax: 80,
    skipDayChance: 0.15,
    avgHabitsPerDayMin: 3,
    avgHabitsPerDayMax: 6,
    xpPerHabitMin: 10,
    xpPerHabitMax: 25,
    // Calculated: avg 4.5 habits / 15 hours = ~30% per hour
    hourlyActivityChance: 0.30,
  },
  active: {
    dailyXpMin: 80,
    dailyXpMax: 150,
    skipDayChance: 0.05,
    avgHabitsPerDayMin: 5,
    avgHabitsPerDayMax: 10,
    xpPerHabitMin: 15,
    xpPerHabitMax: 35,
    // Calculated: avg 7.5 habits / 15 hours = ~50% per hour
    hourlyActivityChance: 0.50,
  },
  hardcore: {
    dailyXpMin: 150,
    dailyXpMax: 250,
    skipDayChance: 0.02,
    avgHabitsPerDayMin: 8,
    avgHabitsPerDayMax: 15,
    xpPerHabitMin: 15,
    xpPerHabitMax: 30,
    // Calculated: avg 11.5 habits / 15 hours = ~77% per hour
    // Note: xpPerHabit reduced to match real user XP (10 base + 0-20 streak)
    hourlyActivityChance: 0.77,
  },
};

/**
 * Generar nombre único para bot
 * Verifica colisiones tanto para nombres base como con sufijo
 */
function generateBotName(usedNames: string[]): string {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n));

  if (available.length === 0) {
    // Generar nombre con sufijo, verificando que no exista
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const randomName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      const suffix = Math.floor(Math.random() * 10000);
      const candidateName = `${randomName}${suffix}`;

      if (!usedNames.includes(candidateName)) {
        return candidateName;
      }
      attempts++;
    }

    // Fallback: usar UUID parcial si fallan todos los intentos
    return `Bot_${uuidv4().substring(0, 8)}`;
  }

  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Seleccionar perfil de bot aleatorio con distribución realista
 */
function selectBotProfile(): BotProfile {
  const rand = Math.random();
  if (rand < 0.2) return 'lazy';
  if (rand < 0.5) return 'casual';
  if (rand < 0.85) return 'active';
  return 'hardcore';
}

/**
 * Obtener todos los grupos existentes en una semana
 */
async function getAllLeagueGroups(
  connection: PoolConnection,
  leagueWeekId: number
): Promise<Array<{ leagueId: number; leagueGroup: number }>> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT DISTINCT league_id, league_group
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ?
     ORDER BY league_id, league_group`,
    [leagueWeekId]
  );
  return rows.map(r => ({
    leagueId: r.league_id as number,
    leagueGroup: r.league_group as number,
  }));
}

/**
 * FIX #2: Rellenar un grupo con bots usando transacción con lock
 * Previene race conditions
 */
async function fillLeagueGroupWithBotsTx(
  connection: PoolConnection,
  leagueWeekId: number,
  leagueId: number,
  leagueGroup: number
): Promise<number> {
  // Lock: SELECT FOR UPDATE para prevenir race condition
  const [lockRows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count, GROUP_CONCAT(username) as names
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND league_id = ? AND league_group = ?
     FOR UPDATE`,
    [leagueWeekId, leagueId, leagueGroup]
  );

  const currentCount = lockRows[0].count as number;
  const botsNeeded = COMPETITORS_PER_LEAGUE - currentCount;

  if (botsNeeded <= 0) return 0;

  // Obtener nombres ya usados (incluye usuarios reales para evitar colisiones)
  // La query obtiene TODOS los competidores del grupo, no solo bots
  const usedNames = lockRows[0].names
    ? (lockRows[0].names as string).split(',')
    : [];

  // Preparar bots para batch insert (with bot_profile)
  const botsToInsert: Array<[string, number, number, number, null, string, number, number, boolean, BotProfile]> = [];

  for (let i = 0; i < botsNeeded; i++) {
    const name = generateBotName(usedNames);
    usedNames.push(name);

    const position = currentCount + i + 1;
    const profile = selectBotProfile();
    // Bots now start with 0 XP - XP will be accumulated incrementally via scheduler
    const initialXp = 0;

    botsToInsert.push([
      uuidv4(),
      leagueWeekId,
      leagueId,
      leagueGroup,
      null, // user_id
      name,
      initialXp,
      position,
      false, // is_real
      profile, // bot_profile - persisted for consistent behavior
    ]);
  }

  // Batch insert de bots
  if (botsToInsert.length > 0) {
    await connection.query(
      `INSERT INTO LEAGUE_COMPETITORS
       (id, league_week_id, league_id, league_group, user_id, username, weekly_xp, position, is_real, bot_profile)
       VALUES ?`,
      [botsToInsert]
    );
  }

  return botsToInsert.length;
}

/**
 * FIX #2: Rellenar todos los grupos con bots usando transacción
 */
export async function fillAllLeaguesWithBots(leagueWeekId: number): Promise<{
  totalCreated: number;
  byLeagueGroup: Array<{ leagueId: number; leagueGroup: number; botsCreated: number }>;
}> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const groups = await getAllLeagueGroups(connection, leagueWeekId);
    const byLeagueGroup: Array<{ leagueId: number; leagueGroup: number; botsCreated: number }> = [];
    let totalCreated = 0;

    for (const { leagueId, leagueGroup } of groups) {
      const created = await fillLeagueGroupWithBotsTx(connection, leagueWeekId, leagueId, leagueGroup);
      byLeagueGroup.push({ leagueId, leagueGroup, botsCreated: created });
      totalCreated += created;
    }

    await connection.commit();

    return { totalCreated, byLeagueGroup };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Simular XP diario para todos los bots de una semana
 * Usa el bot_profile almacenado para comportamiento consistente
 */
export async function simulateDailyBotXp(leagueWeekId: number): Promise<{
  botsUpdated: number;
  totalXpAdded: number;
}> {
  const [bots] = await db.query<RowDataPacket[]>(
    `SELECT id, weekly_xp, bot_profile FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND is_real = FALSE`,
    [leagueWeekId]
  );

  let botsUpdated = 0;
  let totalXpAdded = 0;

  // Preparar updates en batch
  const updates: Array<{ id: string; xpGained: number }> = [];

  for (const bot of bots) {
    // Usar perfil almacenado, o fallback a casual si no existe (bots legacy)
    const profile = (bot.bot_profile as BotProfile) || 'casual';
    const config = BOT_PROFILES[profile];

    if (Math.random() < config.skipDayChance) {
      continue;
    }

    const xpGained = Math.floor(
      Math.random() * (config.dailyXpMax - config.dailyXpMin) + config.dailyXpMin
    );

    if (xpGained > 0) {
      updates.push({ id: bot.id as string, xpGained });
      totalXpAdded += xpGained;
    }
  }

  // Batch update con queries parametrizadas en transacción
  if (updates.length > 0) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (const { id, xpGained } of updates) {
        await connection.query(
          'UPDATE LEAGUE_COMPETITORS SET weekly_xp = weekly_xp + ? WHERE id = ?',
          [xpGained, id]
        );
      }
      await connection.commit();
      botsUpdated = updates.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  return { botsUpdated, totalXpAdded };
}

/**
 * Actualizar posiciones en un grupo de liga basado en XP
 * Usa transacción para garantizar atomicidad de SET @pos + UPDATE
 */
export async function updateLeagueGroupPositions(
  leagueWeekId: number,
  leagueId: number,
  leagueGroup: number
): Promise<void> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Estrategia de dos pasos para evitar conflictos con el constraint único
    // Paso 1: Mover a posiciones negativas
    await connection.query(
      `UPDATE LEAGUE_COMPETITORS
       SET position = -position
       WHERE league_week_id = ? AND league_id = ? AND league_group = ?`,
      [leagueWeekId, leagueId, leagueGroup]
    );
    // Paso 2: Asignar posiciones correctas
    await connection.query('SET @pos = 0');
    await connection.query(
      `UPDATE LEAGUE_COMPETITORS
       SET position = (@pos := @pos + 1)
       WHERE league_week_id = ? AND league_id = ? AND league_group = ?
       ORDER BY weekly_xp DESC, id ASC`,
      [leagueWeekId, leagueId, leagueGroup]
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
 * Actualizar posiciones en todos los grupos de una semana
 * Primero sincroniza XP de usuarios reales, luego actualiza posiciones
 *
 * @param leagueWeekId - ID de la semana
 * @param externalConnection - Conexión externa (si se provee, no maneja transacción)
 */
export async function updateAllLeaguePositions(
  leagueWeekId: number,
  externalConnection?: PoolConnection
): Promise<{
  usersSynced: number;
  groupsUpdated: number;
}> {
  const manageTransaction = !externalConnection;
  const connection = externalConnection || await db.getConnection();

  try {
    if (manageTransaction) {
      await connection.beginTransaction();
    }

    // 1. Sincronizar XP de usuarios reales desde USERS
    const [syncResult] = await connection.query<ResultSetHeader>(
      `UPDATE LEAGUE_COMPETITORS lc
       JOIN USERS u ON lc.user_id = u.id
       SET lc.weekly_xp = u.weekly_xp
       WHERE lc.league_week_id = ? AND lc.is_real = TRUE`,
      [leagueWeekId]
    );
    const usersSynced = syncResult.affectedRows;

    // 2. Obtener todos los grupos
    const groups = await getAllLeagueGroups(connection, leagueWeekId);

    // 3. Actualizar posiciones por grupo (dentro de la misma transacción)
    // Estrategia de dos pasos para evitar conflictos con el constraint único:
    // Paso 1: Mover todas las posiciones a valores negativos (temporales)
    // Paso 2: Asignar las posiciones finales correctas
    for (const { leagueId, leagueGroup } of groups) {
      // Paso 1: Mover a posiciones negativas (evita conflicto)
      await connection.query(
        `UPDATE LEAGUE_COMPETITORS
         SET position = -position
         WHERE league_week_id = ? AND league_id = ? AND league_group = ?`,
        [leagueWeekId, leagueId, leagueGroup]
      );

      // Paso 2: Asignar posiciones correctas usando variable de usuario
      await connection.query('SET @pos = 0');
      await connection.query(
        `UPDATE LEAGUE_COMPETITORS
         SET position = (@pos := @pos + 1)
         WHERE league_week_id = ? AND league_id = ? AND league_group = ?
         ORDER BY weekly_xp DESC, id ASC`,
        [leagueWeekId, leagueId, leagueGroup]
      );
    }

    if (manageTransaction) {
      await connection.commit();
    }

    return { usersSynced, groupsUpdated: groups.length };
  } catch (error) {
    if (manageTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (manageTransaction) {
      connection.release();
    }
  }
}

/**
 * Sincronizar XP de usuarios reales desde USERS a LEAGUE_COMPETITORS
 * Debe ejecutarse antes de actualizar posiciones
 */
export async function syncRealUsersXp(leagueWeekId: number): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE LEAGUE_COMPETITORS lc
     JOIN USERS u ON lc.user_id = u.id
     SET lc.weekly_xp = u.weekly_xp
     WHERE lc.league_week_id = ? AND lc.is_real = TRUE`,
    [leagueWeekId]
  );
  return result.affectedRows;
}

// ============================================================================
// PHASE 2: Incremental XP Accumulation System
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format (local server time)
 * BUG-3 FIX: Use local time instead of UTC for consistency with isActiveHour()
 * This ensures daily resets and activity checks use the same timezone
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reset daily XP tracking for all bots in a league week
 * Should be called at midnight (00:00) each day
 * Sets daily_xp_today to 0 and assigns a random daily target based on profile
 */
export async function resetDailyBotXp(leagueWeekId: number): Promise<{
  botsReset: number;
  botsSkippingToday: number;
}> {
  const today = getTodayDateString();

  // Get all bots that need reset (different date or null)
  const [bots] = await db.query<RowDataPacket[]>(
    `SELECT id, bot_profile FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND is_real = FALSE
     AND (last_xp_reset_date IS NULL OR last_xp_reset_date < ?)`,
    [leagueWeekId, today]
  );

  if (bots.length === 0) {
    return { botsReset: 0, botsSkippingToday: 0 };
  }

  const connection = await db.getConnection();
  let botsReset = 0;
  let botsSkippingToday = 0;

  try {
    await connection.beginTransaction();

    for (const bot of bots) {
      const profile = (bot.bot_profile as BotProfile) || 'casual';
      const config = BOT_PROFILES[profile];

      // Check if bot skips today
      if (Math.random() < config.skipDayChance) {
        // Bot skips today - set target to 0
        await connection.query(
          `UPDATE LEAGUE_COMPETITORS
           SET daily_xp_today = 0, daily_xp_target = 0, last_xp_reset_date = ?
           WHERE id = ?`,
          [today, bot.id]
        );
        botsSkippingToday++;
      } else {
        // Set random target within profile range
        const dailyTarget = Math.floor(
          Math.random() * (config.dailyXpMax - config.dailyXpMin) + config.dailyXpMin
        );

        await connection.query(
          `UPDATE LEAGUE_COMPETITORS
           SET daily_xp_today = 0, daily_xp_target = ?, last_xp_reset_date = ?
           WHERE id = ?`,
          [dailyTarget, today, bot.id]
        );
        botsReset++;
      }
    }

    await connection.commit();
    return { botsReset, botsSkippingToday };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Simulate bot habit completion for a single execution cycle
 * Should be called every 30-60 minutes throughout the day
 * Each bot has a chance to "complete a habit" and gain XP based on:
 * 1. Their profile's hourlyActivityChance
 * 2. Current hour's activity weight (human-like patterns)
 * 3. Per-bot variation (some are morning/night people)
 */
export async function simulateBotHabitCompletion(leagueWeekId: number): Promise<{
  botsUpdated: number;
  totalXpAdded: number;
  botsAtLimit: number;
  botsSkippedByHour: number;
}> {
  const today = getTodayDateString();
  const currentHour = new Date().getHours();

  // Get bots that:
  // 1. Have their daily tracking initialized (last_xp_reset_date = today)
  // 2. Haven't reached their daily target yet
  // 3. Are not skipping today (daily_xp_target > 0)
  const [bots] = await db.query<RowDataPacket[]>(
    `SELECT id, bot_profile, daily_xp_today, daily_xp_target, weekly_xp
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ?
       AND is_real = FALSE
       AND last_xp_reset_date = ?
       AND daily_xp_target > 0
       AND daily_xp_today < daily_xp_target`,
    [leagueWeekId, today]
  );

  if (bots.length === 0) {
    // Count how many are at limit vs not initialized
    const [atLimitRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM LEAGUE_COMPETITORS
       WHERE league_week_id = ? AND is_real = FALSE
       AND last_xp_reset_date = ? AND daily_xp_today >= daily_xp_target`,
      [leagueWeekId, today]
    );
    return {
      botsUpdated: 0,
      totalXpAdded: 0,
      botsAtLimit: atLimitRows[0].count as number,
      botsSkippedByHour: 0,
    };
  }

  const connection = await db.getConnection();
  const updates: Array<{ id: string; xpGained: number }> = [];
  let totalXpAdded = 0;
  let botsAtLimit = 0;
  let botsSkippedByHour = 0;

  try {
    await connection.beginTransaction();

    for (const bot of bots) {
      const botId = bot.id as string;
      const profile = (bot.bot_profile as BotProfile) || 'casual';
      const config = BOT_PROFILES[profile];

      // PHASE 3: Check hourly activity pattern first
      // This determines if the bot is "active" at this hour based on human patterns
      const hourlyActivityProb = getActivityProbability(currentHour, botId);
      if (Math.random() > hourlyActivityProb) {
        botsSkippedByHour++;
        continue; // Bot is not active at this hour
      }

      // Then check profile-based activity chance (habit completion probability)
      if (Math.random() > config.hourlyActivityChance) {
        continue; // Bot doesn't complete a habit this cycle
      }

      // Calculate XP for this habit
      const xpForHabit = Math.floor(
        Math.random() * (config.xpPerHabitMax - config.xpPerHabitMin) + config.xpPerHabitMin
      );

      // Don't exceed daily target
      const currentDailyXp = bot.daily_xp_today as number;
      const dailyTarget = bot.daily_xp_target as number;
      const remainingToTarget = dailyTarget - currentDailyXp;
      const actualXpGain = Math.min(xpForHabit, remainingToTarget);

      if (actualXpGain <= 0) {
        botsAtLimit++;
        continue;
      }

      // Update bot's XP (both daily tracking and weekly total)
      // BUG-1 FIX: Add WHERE condition to prevent race condition
      // If two processes try to update same bot, only one will succeed
      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE LEAGUE_COMPETITORS
         SET daily_xp_today = daily_xp_today + ?,
             weekly_xp = weekly_xp + ?
         WHERE id = ? AND daily_xp_today + ? <= daily_xp_target`,
        [actualXpGain, actualXpGain, bot.id, actualXpGain]
      );

      // Only count if update actually happened (affected 1 row)
      if (updateResult.affectedRows === 0) {
        botsAtLimit++;
        continue;
      }

      updates.push({ id: bot.id as string, xpGained: actualXpGain });
      totalXpAdded += actualXpGain;

      // Check if this bot reached their limit
      if (currentDailyXp + actualXpGain >= dailyTarget) {
        botsAtLimit++;
      }
    }

    await connection.commit();

    return {
      botsUpdated: updates.length,
      totalXpAdded,
      botsAtLimit,
      botsSkippedByHour,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get current hour's expected activity level (useful for monitoring/debugging)
 * Returns a description of expected bot activity for the current hour
 */
export function getCurrentHourActivityInfo(): {
  hour: number;
  baseWeight: number;
  expectedActivity: string;
} {
  const hour = new Date().getHours();
  const weight = HOURLY_ACTIVITY_WEIGHTS[hour] ?? 0.1;

  let expectedActivity: string;
  if (weight >= 0.8) expectedActivity = 'very high';
  else if (weight >= 0.6) expectedActivity = 'high';
  else if (weight >= 0.4) expectedActivity = 'medium';
  else if (weight >= 0.2) expectedActivity = 'low';
  else expectedActivity = 'very low';

  return { hour, baseWeight: weight, expectedActivity };
}

/**
 * Get daily progress statistics for bots (useful for monitoring/debugging)
 */
export async function getBotDailyProgress(leagueWeekId: number): Promise<{
  totalBots: number;
  botsActive: number;
  botsSkipping: number;
  botsAtTarget: number;
  botsNotInitialized: number;
  avgProgressPercent: number;
}> {
  const today = getTodayDateString();

  const [stats] = await db.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN last_xp_reset_date = ? AND daily_xp_target > 0 AND daily_xp_today < daily_xp_target THEN 1 ELSE 0 END) as active,
       SUM(CASE WHEN last_xp_reset_date = ? AND daily_xp_target = 0 THEN 1 ELSE 0 END) as skipping,
       SUM(CASE WHEN last_xp_reset_date = ? AND daily_xp_target > 0 AND daily_xp_today >= daily_xp_target THEN 1 ELSE 0 END) as at_target,
       SUM(CASE WHEN last_xp_reset_date IS NULL OR last_xp_reset_date < ? THEN 1 ELSE 0 END) as not_initialized,
       AVG(CASE WHEN last_xp_reset_date = ? AND daily_xp_target > 0 THEN (daily_xp_today / daily_xp_target * 100) ELSE NULL END) as avg_progress
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND is_real = FALSE`,
    [today, today, today, today, today, leagueWeekId]
  );

  const row = stats[0];
  return {
    totalBots: row.total as number,
    botsActive: row.active as number,
    botsSkipping: row.skipping as number,
    botsAtTarget: row.at_target as number,
    botsNotInitialized: row.not_initialized as number,
    avgProgressPercent: Math.round((row.avg_progress as number) || 0),
  };
}

// Funciones legacy exportadas para compatibilidad
export async function fillLeagueGroupWithBots(
  leagueWeekId: number,
  leagueId: number,
  leagueGroup: number
): Promise<number> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fillLeagueGroupWithBotsTx(connection, leagueWeekId, leagueId, leagueGroup);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
