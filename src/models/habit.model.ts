import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  category_id: string;
  start_date: Date;
  target_date?: Date;
  current_streak: number;
  frequency_type: 'daily' | 'weekly' | 'custom';
  frequency_days_of_week?: string; // Stored as a comma-separated string
  progress_type: 'yes_no' | 'time' | 'count';
  target_value?: number | null; // Required for 'time' (minutes) and 'count' habits, NULL for 'yes_no'
  is_active: boolean;
  active_by_user: number;
  last_completed_date?: Date;
  disabled_at?: Date;
  disabled_reason?: 'no_lives' | 'manual' | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// HIGH FIX: Whitelist of allowed fields for habit updates (prevents prototype pollution)
const ALLOWED_HABIT_UPDATE_FIELDS = [
  'name', 'description', 'category_id', 'start_date', 'target_date', 'current_streak',
  'frequency_type', 'frequency_days_of_week', 'progress_type', 'target_value',
  'is_active', 'active_by_user', 'last_completed_date', 'disabled_at', 'disabled_reason',
  'updated_at', 'deleted_at',
] as const;

export const createHabit = async (habit: Omit<Habit, 'id' | 'created_at' | 'updated_at'>): Promise<Habit> => {
  const id = uuidv4();
  const now = new Date();

  // HIGH FIX: Use explicit parameterized query instead of SET ? shorthand
  await pool.query(
    `INSERT INTO HABITS (
      id, user_id, name, description, category_id, start_date, target_date,
      current_streak, frequency_type, frequency_days_of_week, progress_type, target_value,
      is_active, active_by_user, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, habit.user_id, habit.name, habit.description || null, habit.category_id,
      habit.start_date, habit.target_date || null, habit.current_streak,
      habit.frequency_type, habit.frequency_days_of_week || null, habit.progress_type,
      habit.target_value ?? null, habit.is_active, habit.active_by_user, now, now,
    ],
  );

  return { id, ...habit, created_at: now, updated_at: now };
};

export const findHabitsByUserId = async (userId: string): Promise<Habit[]> => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM HABITS WHERE user_id = ? AND deleted_at IS NULL', [
    userId,
  ]);
  return rows as Habit[];
};

/**
 * LOW FIX: Optimized query that fetches habits with their blocked status in a single query
 * Avoids N+1 queries when getting all habits with is_blocked field
 */
export const findHabitsByUserIdWithBlockedStatus = async (
  userId: string,
): Promise<(Habit & { is_blocked: boolean })[]> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT h.*,
            CASE WHEN pr.id IS NOT NULL THEN TRUE ELSE FALSE END as is_blocked
     FROM HABITS h
     LEFT JOIN PENDING_REDEMPTIONS pr
       ON pr.habit_id = h.id
       AND pr.user_id = h.user_id
       AND pr.status IN ('pending', 'challenge_assigned')
     WHERE h.user_id = ?
       AND h.deleted_at IS NULL
     GROUP BY h.id`,
    [userId],
  );
  return rows.map(row => ({
    ...row,
    is_blocked: Boolean(row.is_blocked),
  })) as (Habit & { is_blocked: boolean })[];
};

export const findHabitById = async (id: string, userId: string): Promise<Habit | undefined> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM HABITS WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  return rows[0] as Habit | undefined;
};

/**
 * CRITICAL FIX: Find habit by ID with row lock for transactional updates
 * Prevents TOCTOU race conditions in assignment operations
 */
export const findHabitByIdForUpdate = async (
  id: string,
  userId: string,
  connection: PoolConnection
): Promise<Habit | undefined> => {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT * FROM HABITS WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE',
    [id, userId],
  );
  return rows[0] as Habit | undefined;
};

export const updateHabit = async (id: string, userId: string, updates: Partial<Habit>): Promise<void> => {
  // HIGH FIX: Filter to only allowed fields to prevent prototype pollution
  const filteredUpdates: Record<string, unknown> = {};
  for (const key of ALLOWED_HABIT_UPDATE_FIELDS) {
    if (key in updates && updates[key as keyof Habit] !== undefined) {
      filteredUpdates[key] = updates[key as keyof Habit];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return; // Nothing to update
  }

  // Build parameterized query dynamically with whitelisted fields only
  const fields = Object.keys(filteredUpdates);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = [...Object.values(filteredUpdates), id, userId];

  await pool.query(`UPDATE HABITS SET ${setClause} WHERE id = ? AND user_id = ?`, values);
};

export const deleteHabit = async (id: string, userId: string): Promise<void> => {
  await pool.query('UPDATE HABITS SET deleted_at = ? WHERE id = ? AND user_id = ?', [new Date(), id, userId]);
};
