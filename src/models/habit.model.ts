import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  start_date: Date;
  target_date?: Date;
  current_streak: number;
  frequency_type: 'daily' | 'weekly' | 'custom';
  frequency_days_of_week?: string; // Stored as a comma-separated string
  progress_type: 'yes_no' | 'time' | 'count';
  is_active: boolean;
  active_by_user: number;
  last_completed_date?: Date;
  disabled_at?: Date;
  disabled_reason?: 'no_lives' | 'manual' | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export const createHabit = async (habit: Omit<Habit, 'id' | 'created_at' | 'updated_at'>): Promise<Habit> => {
  const newHabit: Habit = {
    id: uuidv4(),
    ...habit,
    created_at: new Date(),
    updated_at: new Date(),
  };
  await pool.query('INSERT INTO HABITS SET ?', newHabit);
  return newHabit;
};

export const findHabitsByUserId = async (userId: string): Promise<Habit[]> => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM HABITS WHERE user_id = ? AND deleted_at IS NULL', [
    userId,
  ]);
  return rows as Habit[];
};

export const findHabitById = async (id: string, userId: string): Promise<Habit | undefined> => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM HABITS WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  return rows[0] as Habit | undefined;
};

export const updateHabit = async (id: string, userId: string, updates: Partial<Habit>): Promise<void> => {
  await pool.query('UPDATE HABITS SET ? WHERE id = ? AND user_id = ?', [updates, id, userId]);
};

export const deleteHabit = async (id: string, userId: string): Promise<void> => {
  await pool.query('UPDATE HABITS SET deleted_at = ? WHERE id = ? AND user_id = ?', [new Date(), id, userId]);
};
