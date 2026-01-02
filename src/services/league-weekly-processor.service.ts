import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { LEAGUE_IDS, COMPETITORS_PER_LEAGUE } from '../models/league-week.model';
import { updateAllLeaguePositions } from './league-bot.service';

// Configuración de promoción/descenso (para grupos de 20)
const PROMOTION_POSITIONS = 3;  // Top 3 ascienden (15%)
const RELEGATION_POSITIONS = 3; // Bottom 3 descienden (15%)

// Porcentajes para grupos pequeños
const PROMOTION_PERCENTAGE = 0.15;  // 15% promocionan
const RELEGATION_PERCENTAGE = 0.15; // 15% descienden

type ChangeType = 'promoted' | 'relegated' | 'stayed';

interface CompetitorResult {
  id: string;
  userId: string | null;
  name: string;
  weeklyXp: number;
  position: number;
  isReal: boolean;
  leagueId: number;
  leagueGroup: number;
}

interface LeagueGroupInfo {
  leagueId: number;
  leagueGroup: number;
}

/**
 * Calcular cuántos promocionan/descienden según el tamaño del grupo
 * Usa porcentajes proporcionales para grupos pequeños
 */
export function calculatePromotionRelegation(groupSize: number): {
  promotionCount: number;
  relegationCount: number;
} {
  // Grupos grandes (>=10): usar valores fijos
  if (groupSize >= 10) {
    return {
      promotionCount: PROMOTION_POSITIONS,
      relegationCount: RELEGATION_POSITIONS,
    };
  }

  // Grupos pequeños (<10): usar porcentajes
  // Mínimo 1 persona debe quedarse, así que max promoción+relegación = groupSize - 1
  const maxChurn = groupSize - 1;

  // Calcular proporcional pero con mínimos razonables
  let promotionCount = Math.max(1, Math.floor(groupSize * PROMOTION_PERCENTAGE));
  let relegationCount = Math.max(1, Math.floor(groupSize * RELEGATION_PERCENTAGE));

  // Si el total excede el máximo, reducir proporcionalmente
  if (promotionCount + relegationCount > maxChurn) {
    // Priorizar mantener al menos 1 de cada uno
    const excess = (promotionCount + relegationCount) - maxChurn;
    // Reducir de ambos equitativamente
    promotionCount = Math.max(1, promotionCount - Math.ceil(excess / 2));
    relegationCount = Math.max(1, relegationCount - Math.floor(excess / 2));
  }

  // Casos especiales para grupos muy pequeños
  if (groupSize <= 3) {
    // 3 o menos: 1 promociona, 1 desciende, resto se queda
    promotionCount = 1;
    relegationCount = groupSize >= 2 ? 1 : 0;
  }

  return { promotionCount, relegationCount };
}

/**
 * Determinar el tipo de cambio basado en la posición y tamaño del grupo
 */
export function determineChangeType(
  position: number,
  leagueId: number,
  groupSize: number = COMPETITORS_PER_LEAGUE
): ChangeType {
  const { promotionCount, relegationCount } = calculatePromotionRelegation(groupSize);

  // Top N promocionan (si no están en Master)
  if (position <= promotionCount) {
    return leagueId === LEAGUE_IDS.MASTER ? 'stayed' : 'promoted';
  }

  // Bottom N descienden (si no están en Bronze)
  const relegationThreshold = groupSize - relegationCount;
  if (position > relegationThreshold) {
    return leagueId === LEAGUE_IDS.BRONZE ? 'stayed' : 'relegated';
  }

  return 'stayed';
}

/**
 * Calcular la siguiente liga para un usuario basado en su resultado
 */
export function getNextLeague(currentLeagueId: number, changeType: ChangeType): number {
  switch (changeType) {
    case 'promoted':
      return Math.min(currentLeagueId + 1, LEAGUE_IDS.MASTER);
    case 'relegated':
      return Math.max(currentLeagueId - 1, LEAGUE_IDS.BRONZE);
    default:
      return currentLeagueId;
  }
}

/**
 * Obtener todos los grupos de una semana
 */
async function getAllLeagueGroups(
  leagueWeekId: number,
  connection?: PoolConnection
): Promise<LeagueGroupInfo[]> {
  const queryFn = connection || db;
  const [rows] = await queryFn.query<RowDataPacket[]>(
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
 * Obtener todos los competidores de un grupo de liga
 */
async function getLeagueGroupCompetitors(
  leagueWeekId: number,
  leagueId: number,
  leagueGroup: number,
  connection?: PoolConnection
): Promise<CompetitorResult[]> {
  const queryFn = connection || db;
  const [rows] = await queryFn.query<RowDataPacket[]>(
    `SELECT
       id, user_id as userId, name, weekly_xp as weeklyXp,
       position, is_real as isReal, league_id as leagueId, league_group as leagueGroup
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ? AND league_id = ? AND league_group = ?
     ORDER BY position ASC`,
    [leagueWeekId, leagueId, leagueGroup]
  );
  return rows as CompetitorResult[];
}

/**
 * Guardar historial de un usuario real
 */
async function saveUserHistory(
  userId: string,
  leagueWeekId: number,
  leagueId: number,
  weeklyXp: number,
  position: number,
  changeType: ChangeType,
  connection?: PoolConnection
): Promise<void> {
  const queryFn = connection || db;
  await queryFn.query(
    `INSERT INTO USER_LEAGUE_HISTORY
     (id, user_id, league_week_id, league_id, weekly_xp, position, change_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, leagueWeekId, leagueId, weeklyXp, position, changeType]
  );
}

/**
 * Actualizar la liga del usuario en su perfil
 */
async function updateUserLeague(
  userId: string,
  newLeagueId: number,
  connection?: PoolConnection
): Promise<void> {
  const queryFn = connection || db;
  await queryFn.query(
    'UPDATE USERS SET league = ? WHERE id = ?',
    [newLeagueId, userId]
  );
}

/**
 * Procesar fin de semana para un grupo de liga específico
 */
async function processLeagueGroupWeekEnd(
  leagueWeekId: number,
  leagueId: number,
  leagueGroup: number,
  connection: PoolConnection
): Promise<{
  processed: number;
  promoted: number;
  relegated: number;
  stayed: number;
}> {
  const competitors = await getLeagueGroupCompetitors(leagueWeekId, leagueId, leagueGroup, connection);
  const groupSize = competitors.length;

  let processed = 0;
  let promoted = 0;
  let relegated = 0;
  let stayed = 0;

  for (const competitor of competitors) {
    const changeType = determineChangeType(competitor.position, leagueId, groupSize);

    // Solo procesar usuarios reales
    if (competitor.isReal && competitor.userId) {
      // Guardar historial
      await saveUserHistory(
        competitor.userId,
        leagueWeekId,
        leagueId,
        competitor.weeklyXp,
        competitor.position,
        changeType,
        connection
      );

      // Actualizar liga del usuario para la próxima semana
      const nextLeague = getNextLeague(leagueId, changeType);
      await updateUserLeague(competitor.userId, nextLeague, connection);

      processed++;
    }

    // Contar cambios (incluyendo bots para estadísticas)
    switch (changeType) {
      case 'promoted': promoted++; break;
      case 'relegated': relegated++; break;
      default: stayed++;
    }
  }

  return { processed, promoted, relegated, stayed };
}

/**
 * Procesar fin de semana completo para todos los grupos de todas las ligas
 * Ejecutar el domingo por la noche
 * Usa transacción única para garantizar atomicidad (incluye updateAllLeaguePositions)
 * Idempotente: verifica si ya fue procesada antes de ejecutar
 */
export async function processWeekEnd(leagueWeekId: number): Promise<{
  totalProcessed: number;
  totalGroups: number;
  alreadyProcessed: boolean;
  byLeague: Record<number, {
    groups: number;
    processed: number;
    promoted: number;
    relegated: number;
    stayed: number;
  }>;
}> {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verificar idempotencia: si ya fue procesada, retornar sin hacer nada
    const [weekRows] = await connection.query<RowDataPacket[]>(
      'SELECT processed FROM LEAGUE_WEEKS WHERE id = ? FOR UPDATE',
      [leagueWeekId]
    );

    if (weekRows.length === 0) {
      await connection.rollback();
      throw new Error(`League week ${leagueWeekId} not found`);
    }

    if (weekRows[0].processed) {
      await connection.rollback();
      return {
        totalProcessed: 0,
        totalGroups: 0,
        alreadyProcessed: true,
        byLeague: {},
      };
    }

    // Actualizar posiciones dentro de la misma transacción
    await updateAllLeaguePositions(leagueWeekId, connection);

    const allGroups = await getAllLeagueGroups(leagueWeekId, connection);

    const byLeague: Record<number, {
      groups: number;
      processed: number;
      promoted: number;
      relegated: number;
      stayed: number;
    }> = {};

    // Inicializar estadísticas por liga
    for (let i = LEAGUE_IDS.BRONZE; i <= LEAGUE_IDS.MASTER; i++) {
      byLeague[i] = { groups: 0, processed: 0, promoted: 0, relegated: 0, stayed: 0 };
    }

    let totalProcessed = 0;

    // Procesar cada grupo dentro de la transacción
    for (const { leagueId, leagueGroup } of allGroups) {
      const result = await processLeagueGroupWeekEnd(leagueWeekId, leagueId, leagueGroup, connection);

      byLeague[leagueId].groups++;
      byLeague[leagueId].processed += result.processed;
      byLeague[leagueId].promoted += result.promoted;
      byLeague[leagueId].relegated += result.relegated;
      byLeague[leagueId].stayed += result.stayed;

      totalProcessed += result.processed;
    }

    // Marcar semana como procesada (idempotencia)
    await connection.query(
      'UPDATE LEAGUE_WEEKS SET processed = TRUE WHERE id = ?',
      [leagueWeekId]
    );

    await connection.commit();

    return { totalProcessed, totalGroups: allGroups.length, alreadyProcessed: false, byLeague };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Resetear XP semanal de todos los usuarios
 * Ejecutar después de procesar el fin de semana
 */
export async function resetWeeklyXp(): Promise<number> {
  const [result] = await db.query<ResultSetHeader>('UPDATE USERS SET weekly_xp = 0');
  return result.affectedRows;
}

/**
 * Obtener resumen de una semana de liga (incluyendo grupos)
 */
export async function getWeekSummary(leagueWeekId: number): Promise<{
  totalCompetitors: number;
  totalGroups: number;
  realUsers: number;
  bots: number;
  byLeague: Record<number, { groups: number; total: number; real: number; bots: number }>;
}> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       league_id,
       COUNT(DISTINCT league_group) as group_count,
       COUNT(*) as total,
       SUM(CASE WHEN is_real = TRUE THEN 1 ELSE 0 END) as real_count,
       SUM(CASE WHEN is_real = FALSE THEN 1 ELSE 0 END) as bot_count
     FROM LEAGUE_COMPETITORS
     WHERE league_week_id = ?
     GROUP BY league_id`,
    [leagueWeekId]
  );

  const byLeague: Record<number, { groups: number; total: number; real: number; bots: number }> = {};
  let totalCompetitors = 0;
  let totalGroups = 0;
  let realUsers = 0;
  let bots = 0;

  for (const row of rows) {
    const leagueId = row.league_id as number;
    byLeague[leagueId] = {
      groups: row.group_count as number,
      total: row.total as number,
      real: row.real_count as number,
      bots: row.bot_count as number,
    };
    totalCompetitors += row.total as number;
    totalGroups += row.group_count as number;
    realUsers += row.real_count as number;
    bots += row.bot_count as number;
  }

  return { totalCompetitors, totalGroups, realUsers, bots, byLeague };
}

/**
 * Limpiar semanas de liga antiguas
 * Mantiene las últimas N semanas y elimina el resto
 * CASCADE eliminará automáticamente los LEAGUE_COMPETITORS asociados
 *
 * @param weeksToKeep - Número de semanas a mantener (default: 12 = ~3 meses)
 */
export async function cleanupOldLeagueWeeks(weeksToKeep: number = 12): Promise<{
  weeksDeleted: number;
  competitorsDeleted: number;
}> {
  // Obtener el número de semanas existentes
  const [countRows] = await db.query<RowDataPacket[]>(
    'SELECT COUNT(*) as count FROM LEAGUE_WEEKS'
  );
  const totalWeeks = countRows[0].count as number;

  if (totalWeeks <= weeksToKeep) {
    return { weeksDeleted: 0, competitorsDeleted: 0 };
  }

  // Contar competidores que serán eliminados (para estadísticas)
  // Usar derived table porque MySQL no permite LIMIT directamente en subquery
  const [compRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM LEAGUE_COMPETITORS lc
     JOIN LEAGUE_WEEKS lw ON lc.league_week_id = lw.id
     WHERE lw.id NOT IN (
       SELECT id FROM (
         SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT ?
       ) as recent
     )`,
    [weeksToKeep]
  );
  const competitorsToDelete = compRows[0].count as number;

  // Eliminar semanas antiguas (CASCADE eliminará competidores)
  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM LEAGUE_WEEKS
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT ?
       ) as recent
     )`,
    [weeksToKeep]
  );

  return {
    weeksDeleted: result.affectedRows,
    competitorsDeleted: competitorsToDelete,
  };
}
