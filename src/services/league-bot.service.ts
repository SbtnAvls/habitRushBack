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
}

const BOT_PROFILES: Record<BotProfile, BotProfileConfig> = {
  lazy: { dailyXpMin: 0, dailyXpMax: 50, skipDayChance: 0.6 },
  casual: { dailyXpMin: 30, dailyXpMax: 120, skipDayChance: 0.3 },
  active: { dailyXpMin: 80, dailyXpMax: 200, skipDayChance: 0.1 },
  hardcore: { dailyXpMin: 150, dailyXpMax: 350, skipDayChance: 0.05 },
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
    `SELECT COUNT(*) as count, GROUP_CONCAT(name) as names
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
    const config = BOT_PROFILES[profile];
    const initialXp = Math.floor(
      Math.random() * (config.dailyXpMax - config.dailyXpMin) + config.dailyXpMin
    );

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
       (id, league_week_id, league_id, league_group, user_id, name, weekly_xp, position, is_real, bot_profile)
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
    for (const { leagueId, leagueGroup } of groups) {
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
