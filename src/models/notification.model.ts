import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { PoolConnection } from 'mysql2/promise';

export type NotificationType =
  | 'habit_reminder'
  | 'life_warning'
  | 'challenge_available'
  | 'challenge_result'
  | 'league_update'
  | 'pending_redemption'
  | 'pending_expiring'
  | 'death';

// HIGH FIX: Runtime validation for notification types
export const VALID_NOTIFICATION_TYPES: NotificationType[] = [
  'habit_reminder',
  'life_warning',
  'challenge_available',
  'challenge_result',
  'league_update',
  'pending_redemption',
  'pending_expiring',
  'death',
];

export function isValidNotificationType(type: string): type is NotificationType {
  return VALID_NOTIFICATION_TYPES.includes(type as NotificationType);
}

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

// MEDIUM FIX: Pagination constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class NotificationModel {
  /**
   * Create a new notification
   * HIGH FIX: Validates notification type at runtime
   */
  static async create(input: CreateNotificationInput, connection?: PoolConnection): Promise<string> {
    // HIGH FIX: Validate notification type before inserting
    if (!isValidNotificationType(input.type)) {
      throw new Error(`Invalid notification type: ${input.type}. Valid types: ${VALID_NOTIFICATION_TYPES.join(', ')}`);
    }

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

  /**
   * MEDIUM FIX: Get notifications with pagination
   */
  static async findByUserId(userId: string, limit?: number, offset?: number): Promise<Notification[]> {
    // Apply safe defaults and limits
    const safeLimit = Math.min(Math.max(1, limit || DEFAULT_LIMIT), MAX_LIMIT);
    const safeOffset = Math.max(0, offset || 0);

    const [rows] = await pool.query<NotificationRow[]>(
      'SELECT * FROM NOTIFICATIONS WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, safeLimit, safeOffset],
    );
    return rows;
  }

  /**
   * Get total count for pagination metadata
   */
  static async getCountForUser(userId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM NOTIFICATIONS WHERE user_id = ?',
      [userId],
    );
    return rows[0].total as number;
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
