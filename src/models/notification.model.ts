import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { PoolConnection } from 'mysql2/promise';

export type NotificationType =
  | 'habit_reminder'
  | 'life_warning'
  | 'challenge_available'
  | 'league_update'
  | 'pending_redemption'
  | 'pending_expiring'
  | 'death';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_habit_id?: string;
  is_read: boolean;
  scheduled_for?: Date;
  sent_at?: Date;
  created_at: Date;
}

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_habit_id?: string;
  scheduled_for?: Date;
}

interface NotificationRow extends RowDataPacket, Notification {}

export class NotificationModel {
  /**
   * Create a new notification
   */
  static async create(input: CreateNotificationInput, connection?: PoolConnection): Promise<string> {
    const conn = connection || pool;
    const id = uuidv4();

    await conn.query(
      `INSERT INTO NOTIFICATIONS (id, user_id, type, title, message, related_habit_id, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.user_id,
        input.type,
        input.title,
        input.message,
        input.related_habit_id || null,
        input.scheduled_for || null,
      ],
    );

    return id;
  }

  static async findByUserId(userId: string): Promise<Notification[]> {
    const [rows] = await pool.query<NotificationRow[]>(
      'SELECT * FROM NOTIFICATIONS WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return rows;
  }

  static async findById(id: string): Promise<Notification | null> {
    const [rows] = await pool.query<NotificationRow[]>('SELECT * FROM NOTIFICATIONS WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }

  static async updateReadStatus(id: string, is_read: boolean): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>('UPDATE NOTIFICATIONS SET is_read = ? WHERE id = ?', [
      is_read,
      id,
    ]);
    return result.affectedRows > 0;
  }

  static async deleteById(id: string): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>('DELETE FROM NOTIFICATIONS WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}
