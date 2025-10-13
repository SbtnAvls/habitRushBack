import pool from '../db';

export interface Notification {
  id: string;
  user_id: string;
  type: 'habit_reminder' | 'life_warning' | 'challenge_available' | 'league_update';
  title: string;
  message: string;
  related_habit_id?: string;
  is_read: boolean;
  scheduled_for?: Date;
  sent_at?: Date;
  created_at: Date;
}

export class NotificationModel {
  static async findByUserId(userId: string): Promise<Notification[]> {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM NOTIFICATIONS WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async findById(id: string): Promise<Notification | null> {
    const [rows] = await pool.query<any[]>('SELECT * FROM NOTIFICATIONS WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }

  static async updateReadStatus(id: string, is_read: boolean): Promise<boolean> {
    const [result] = await pool.query<any>(
      'UPDATE NOTIFICATIONS SET is_read = ? WHERE id = ?',
      [is_read, id]
    );
    return result.affectedRows > 0;
  }

  static async deleteById(id: string): Promise<boolean> {
    const [result] = await pool.query<any>('DELETE FROM NOTIFICATIONS WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}
