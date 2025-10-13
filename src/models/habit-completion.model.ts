import pool from '../db';

export class HabitCompletion {

  static async getForHabit(userId: string, habitId: string) {
    const [rows] = await pool.query(
      'SELECT * FROM HABIT_COMPLETIONS WHERE user_id = ? AND habit_id = ? ORDER BY `date` DESC',
      [userId, habitId]
    );
    return rows;
  }

  static async createOrUpdate(data: any) {
    const { habit_id, user_id, date, completed, progress_type, progress_value, target_value, notes } = data;
    // This logic assumes you want to overwrite completion for a given day.
    // A more complex logic might be needed depending on product requirements.
    const [existing] = await pool.query<any[]>('SELECT id FROM HABIT_COMPLETIONS WHERE habit_id = ? AND `date` = ?', [habit_id, date]);

    if (existing.length > 0) {
      // Update
      const id = existing[0].id;
      await pool.query('UPDATE HABIT_COMPLETIONS SET completed = ?, progress_value = ?, notes = ?, completed_at = NOW() WHERE id = ?', 
        [completed, progress_value, notes, id]);
      const [rows] = await pool.query<any[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
      return rows[0];
    } else {
      // Create
      const completed_at = completed ? new Date() : null;
      const [result] = await pool.query(
        'INSERT INTO HABIT_COMPLETIONS (habit_id, user_id, `date`, completed, progress_type, progress_value, target_value, notes, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [habit_id, user_id, date, completed, progress_type, progress_value, target_value, notes, completed_at]
      );
      const id = (result as any).insertId;
      const [rows] = await pool.query<any[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
      return rows[0];
    }
  }

  static async update(id: string, userId: string, data: any) {
    const { notes } = data; // Only allowing notes update for now as per plan
    const [result] = await pool.query(
      'UPDATE HABIT_COMPLETIONS SET notes = ? WHERE id = ? AND user_id = ?',
      [notes, id, userId]
    );
    if ((result as any).affectedRows === 0) {
      return null;
    }
      const [rows] = await pool.query<any[]>('SELECT * FROM HABIT_COMPLETIONS WHERE id = ?', [id]);
      return rows[0];
  }

  static async delete(id: string, userId: string) {
    const [result] = await pool.query('DELETE FROM HABIT_COMPLETIONS WHERE id = ? AND user_id = ?', [id, userId]);
    return (result as any).affectedRows > 0;
  }
}