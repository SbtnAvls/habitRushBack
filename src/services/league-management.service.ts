import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { LeagueWeek, LEAGUE_IDS, COMPETITORS_PER_LEAGUE } from '../models/league-week.model';

interface UserWithLeagueHistory {
  id: string;
  username: string;
  weekly_xp: number;
  last_weekly_xp: number | null;
  last_league_id: number | null;
  change_type: string | null;
}

interface UserForLeague {
  id: string;
  username: string;
  weekly_xp: number;
  targetLeague: number;
}

interface DistributionResult {
  distributed: number;
  byLeague: Record<number, { users: number; groups: number }>;
}

/**
 * Calcular liga destino basado en historial
 */
function calculateTargetLeague(lastLeagueId: number | null, changeType: string | null): number {
  if (lastLeagueId === null) {
    return LEAGUE_IDS.BRONZE; // Usuario nuevo → Bronze
  }

  switch (changeType) {
    case 'promoted':
      return Math.min(lastLeagueId + 1, LEAGUE_IDS.MASTER);
    case 'relegated':
      return Math.max(lastLeagueId - 1, LEAGUE_IDS.BRONZE);
    default:
      return lastLeagueId;
  }
}

/**
 * Dividir array en chunks de tamaño específico
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Crear nueva semana de liga (con conexión específica para transacción)
 */
async function createLeagueWeekTx(connection: PoolConnection, weekStart: Date): Promise<number> {
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO LEAGUE_WEEKS (week_start) VALUES (?)',
    [weekStart]
  );
  return result.insertId;
}

/**
 * Obtener semana de liga actual (la más reciente)
 */
export async function getCurrentLeagueWeek(): Promise<LeagueWeek | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, week_start FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT 1'
  );
  if (rows.length === 0) return null;
  return rows[0] as LeagueWeek;
}

/**
 * Obtener semana de liga por fecha
 */
export async function getLeagueWeekByDate(weekStart: Date): Promise<LeagueWeek | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT id, week_start FROM LEAGUE_WEEKS WHERE week_start = ?',
    [weekStart]
  );
  if (rows.length === 0) return null;
  return rows[0] as LeagueWeek;
}

/**
 * FIX #1: Obtener usuarios activos CON su último historial en UNA SOLA QUERY
 * Evita N+1 queries
 * FIX: Ordenar por XP de semana anterior (last_weekly_xp) para matchmaking correcto
 *      porque weekly_xp actual ya fue reseteado a 0 por resetWeeklyXp()
 */
async function getActiveUsersWithHistory(connection: PoolConnection): Promise<UserForLeague[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT
       u.id,
       u.username,
       u.weekly_xp,
       ulh.weekly_xp as last_weekly_xp,
       ulh.league_id as last_league_id,
       ulh.change_type
     FROM USERS u
     LEFT JOIN (
       SELECT ulh1.user_id, ulh1.league_id, ulh1.change_type, ulh1.weekly_xp
       FROM USER_LEAGUE_HISTORY ulh1
       INNER JOIN (
         SELECT user_id, MAX(lw.week_start) as max_week
         FROM USER_LEAGUE_HISTORY ulh2
         JOIN LEAGUE_WEEKS lw ON ulh2.league_week_id = lw.id
         GROUP BY user_id
       ) latest ON ulh1.user_id = latest.user_id
       JOIN LEAGUE_WEEKS lw ON ulh1.league_week_id = lw.id AND lw.week_start = latest.max_week
     ) ulh ON u.id = ulh.user_id
     WHERE u.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY COALESCE(ulh.weekly_xp, 0) DESC`
  );

  return (rows as UserWithLeagueHistory[]).map(row => ({
    id: row.id,
    username: row.username,
    weekly_xp: row.last_weekly_xp ?? 0,
    targetLeague: calculateTargetLeague(row.last_league_id, row.change_type),
  }));
}

/**
 * FIX #1 + #3: Insertar múltiples usuarios en batch (más eficiente)
 * Incluye validación de duplicados y manejo de errores de constraint
 */
async function batchInsertCompetitors(
  connection: PoolConnection,
  competitors: Array<{
    id: string;
    leagueWeekId: number;
    leagueId: number;
    leagueGroup: number;
    userId: string;
    username: string;
    position: number;
  }>
): Promise<void> {
  if (competitors.length === 0) return;

  // Validar que no hay usuarios duplicados en el batch
  const userIds = competitors.map(c => c.userId);
  const uniqueUserIds = new Set(userIds);
  if (uniqueUserIds.size !== userIds.length) {
    throw new Error('Duplicate user IDs detected in batch insert');
  }

  const values = competitors.map(c => [
    c.id,
    c.leagueWeekId,
    c.leagueId,
    c.leagueGroup,
    c.userId,
    c.username,
    0, // weekly_xp
    c.position,
    true, // is_real
  ]);

  try {
    await connection.query(
      `INSERT INTO LEAGUE_COMPETITORS
       (id, league_week_id, league_id, league_group, user_id, username, weekly_xp, position, is_real)
       VALUES ?`,
      [values]
    );
  } catch (error: any) {
    // Provide more context for constraint violations
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error(`Constraint violation during batch insert: ${error.message}. This may indicate a user is already in a league group.`);
    }
    throw error;
  }
}

/**
 * FIX #1 + #3: Distribuir usuarios en grupos por XP similar (optimizado)
 * - Una sola query para obtener usuarios con historial
 * - Batch insert para todos los competidores
 */
async function distributeUsersToLeaguesTx(
  connection: PoolConnection,
  leagueWeekId: number
): Promise<DistributionResult> {
  const users = await getActiveUsersWithHistory(connection);

  const byLeague: Record<number, { users: number; groups: number }> = {
    1: { users: 0, groups: 0 },
    2: { users: 0, groups: 0 },
    3: { users: 0, groups: 0 },
    4: { users: 0, groups: 0 },
    5: { users: 0, groups: 0 },
  };

  // Agrupar usuarios por liga destino
  const usersByLeague: Record<number, UserForLeague[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const user of users) {
    usersByLeague[user.targetLeague].push(user);
  }

  // Preparar todos los competidores para batch insert
  const allCompetitors: Array<{
    id: string;
    leagueWeekId: number;
    leagueId: number;
    leagueGroup: number;
    userId: string;
    username: string;
    position: number;
  }> = [];

  // Procesar cada liga
  for (let leagueId = LEAGUE_IDS.BRONZE; leagueId <= LEAGUE_IDS.MASTER; leagueId++) {
    const leagueUsers = usersByLeague[leagueId];

    if (leagueUsers.length === 0) continue;

    // Ya vienen ordenados por XP DESC de la query
    const groups = chunkArray(leagueUsers, COMPETITORS_PER_LEAGUE);

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const leagueGroup = groupIndex + 1;

      for (let position = 0; position < group.length; position++) {
        const user = group[position];
        allCompetitors.push({
          id: uuidv4(),
          leagueWeekId,
          leagueId,
          leagueGroup,
          userId: user.id,
          username: user.username,
          position: position + 1,
        });
      }

      byLeague[leagueId].users += group.length;
    }

    byLeague[leagueId].groups = groups.length;
  }

  // Batch insert de todos los competidores
  await batchInsertCompetitors(connection, allCompetitors);

  return { distributed: allCompetitors.length, byLeague };
}

/**
 * FIX #3 + #7: Iniciar nueva semana de liga con TRANSACCIÓN
 * Verificación dentro de transacción para evitar race conditions
 */
export async function startNewLeagueWeek(weekStart: Date): Promise<{
  weekId: number;
  distributed: number;
  byLeague: Record<number, { users: number; groups: number }>;
}> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // FIX #7: Verificar DENTRO de la transacción con lock
    const [existingRows] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM LEAGUE_WEEKS WHERE week_start = ? FOR UPDATE',
      [weekStart]
    );

    if (existingRows.length > 0) {
      await connection.rollback();
      throw new Error(`League week already exists for ${weekStart.toISOString().split('T')[0]}`);
    }

    // 1. Crear semana
    const weekId = await createLeagueWeekTx(connection, weekStart);

    // 2. Distribuir usuarios
    const { distributed, byLeague } = await distributeUsersToLeaguesTx(connection, weekId);

    await connection.commit();

    return { weekId, distributed, byLeague };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Obtener el grupo de liga de un usuario en la semana actual
 */
export async function getUserLeagueGroup(
  userId: string,
  leagueWeekId: number
): Promise<{ leagueId: number; leagueGroup: number } | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT league_id, league_group FROM LEAGUE_COMPETITORS
     WHERE user_id = ? AND league_week_id = ?`,
    [userId, leagueWeekId]
  );
  if (rows.length === 0) return null;
  return {
    leagueId: rows[0].league_id as number,
    leagueGroup: rows[0].league_group as number,
  };
}

/**
 * Obtener todos los grupos de una liga en una semana
 */
export async function getLeagueGroups(
  leagueWeekId: number,
  leagueId: number
): Promise<number[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DISTINCT league_group FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND league_id = ?
     ORDER BY league_group`,
    [leagueWeekId, leagueId]
  );
  return rows.map(r => r.league_group as number);
}

// Funciones legacy para compatibilidad (pueden usarse individualmente)
export async function getActiveUsersForLeague(): Promise<UserForLeague[]> {
  const connection = await db.getConnection();
  try {
    return await getActiveUsersWithHistory(connection);
  } finally {
    connection.release();
  }
}

export async function getLeagueForUser(userId: string): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ulh.league_id, ulh.change_type
     FROM USER_LEAGUE_HISTORY ulh
     JOIN LEAGUE_WEEKS lw ON ulh.league_week_id = lw.id
     WHERE ulh.user_id = ?
     ORDER BY lw.week_start DESC
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return LEAGUE_IDS.BRONZE;
  }

  return calculateTargetLeague(
    rows[0].league_id as number,
    rows[0].change_type as string
  );
}
