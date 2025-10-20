import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

const VALID_PROGRESS_TYPES = ['yes_no', 'time', 'count'] as const;

export interface HabitCompletionRecord extends RowDataPacket {
  id: string;
  habit_id: string;
  user_id: string;
  date: string;
  completed: number;
  progress_type: 'yes_no' | 'time' | 'count';
  progress_value: number | null;
  target_value: number | null;
  notes: string | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface HabitCompletionUpsertInput {
  habit_id: string;
  user_id: string;
  date: string;
  completed: boolean;
  progress_type: 'yes_no' | 'time' | 'count';
  progress_value?: number | null;
  target_value?: number | null;
  notes?: string | null;
}

export class HabitCompletion {
  static async getForHabit(userId: string, habitId: string): Promise<HabitCompletionRecord[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM HABIT_COMPLETIONS WHERE user_id = ? AND habit_id = ? ORDER BY `date` DESC',
      [userId, habitId]
    );
    return rows as HabitCompletionRecord[];
  }

  static async getById(id: string, userId: string): Promise<HabitCompletionRecord | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM HABIT_COMPLETIONS WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return rows.length > 0 ? (rows[0] as HabitCompletionRecord) : null;
  }

  static async createOrUpdate(data: HabitCompletionUpsertInput): Promise<HabitCompletionRecord> {
    const {
      habit_id,
      user_id,
      date,
      completed,
      progress_type,
      progress_value,
      target_value,
      notes,
    } = data;

    if (!VALID_PROGRESS_TYPES.includes(progress_type)) {
      throw new Error('Invalid progress_type provided');
    }

    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM HABIT_COMPLETIONS WHERE habit_id = ? AND user_id = ? AND `date` = ?',
      [habit_id, user_id, date]
    );

    const completedAt = completed ? new Date() : null;
    const normalizedProgressValue = progress_value ?? null;
    const normalizedTargetValue = target_value ?? null;
    const normalizedNotes = notes ?? null;

    if (existing.length > 0) {
      const id = existing[0].id as string;
      await pool.query(
        `UPDATE HABIT_COMPLETIONS 
         SET completed = ?, 
             progress_type = ?, 
             progress_value = ?, 
             target_value = ?, 
             notes = ?, 
             completed_at = ?
         WHERE id = ?`,
        [
          completed,
          progress_type,
          normalizedProgressValue,
          normalizedTargetValue,
          normalizedNotes,
          completedAt,
          id,
        ]
      );
      const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
      return rows[0] as HabitCompletionRecord;
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO HABIT_COMPLETIONS 
        (id, habit_id, user_id, \`date\`, completed, progress_type, progress_value, target_value, notes, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        habit_id,
        user_id,
        date,
        completed,
        progress_type,
        normalizedProgressValue,
        normalizedTargetValue,
        normalizedNotes,
        completedAt,
      ]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
    return rows[0] as HabitCompletionRecord;
  }

  static async update(id: string, userId: string, data: Partial<Pick<HabitCompletionUpsertInput, 'notes'>>): Promise<HabitCompletionRecord | null> {
    const hasNotesField = Object.prototype.hasOwnProperty.call(data, 'notes');
    if (!hasNotesField) {
      return null;
    }

    const [result] = await pool.query(
      'UPDATE HABIT_COMPLETIONS SET notes = ? WHERE id = ? AND user_id = ?',
      [data.notes ?? null, id, userId]
    )

    if ((result as any).affectedRows === 0) {
      return null;
    }

    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
    return rows[0] as HabitCompletionRecord;
  }

  static async delete(id: string, userId: string): Promise<boolean> {
    const [result] = await pool.query('DELETE FROM HABIT_COMPLETIONS WHERE id = ? AND user_id = ?', [id, userId]);
    return (result as any).affectedRows > 0;
  }
}
