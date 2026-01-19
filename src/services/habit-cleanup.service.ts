import pool from '../db';
import { ResultSetHeader } from 'mysql2';

export interface HabitCleanupResult {
  deleted_count: number;
  deleted_habit_ids: string[];
  execution_date: string;
}

/**
 * Elimina (soft delete) los hábitos que llevan inactivos más de N días.
 * Un hábito inactivo es aquel con is_active = false y disabled_at definido.
 *
 * @param inactiveDays - Número de días de inactividad requeridos para eliminar (default: 7)
 * @returns Resultado con el conteo y IDs de hábitos eliminados
 */
export async function cleanupInactiveHabits(inactiveDays: number = 7): Promise<HabitCleanupResult> {
  const executionDate = new Date().toISOString();

  // Primero obtenemos los IDs de los hábitos que serán eliminados (para logging)
  const [habitsToDelete] = await pool.query<any[]>(
    `SELECT id, user_id, name, disabled_at
     FROM HABITS
     WHERE is_active = false
       AND disabled_at IS NOT NULL
       AND disabled_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND deleted_at IS NULL`,
    [inactiveDays]
  );

  if (habitsToDelete.length === 0) {
    console.log(`[HabitCleanup] No inactive habits found older than ${inactiveDays} days`);
    return {
      deleted_count: 0,
      deleted_habit_ids: [],
      execution_date: executionDate,
    };
  }

  const habitIds = habitsToDelete.map((h: any) => h.id);

  // Soft delete de los hábitos
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE HABITS
     SET deleted_at = NOW()
     WHERE is_active = false
       AND disabled_at IS NOT NULL
       AND disabled_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND deleted_at IS NULL`,
    [inactiveDays]
  );

  console.log(`[HabitCleanup] Deleted ${result.affectedRows} inactive habits:`, habitIds);

  return {
    deleted_count: result.affectedRows,
    deleted_habit_ids: habitIds,
    execution_date: executionDate,
  };
}
