import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { PoolConnection } from 'mysql2/promise';

export type LifeHistoryReason =
  | 'habit_missed'
  | 'challenge_completed'
  | 'life_challenge_redeemed'
  | 'pending_expired'
  | 'revival_reset'
  | 'revival_challenge';

export interface LifeHistory extends RowDataPacket {
  id: string;
  user_id: string;
  lives_change: number;
  current_lives: number;
  reason: LifeHistoryReason;
  related_habit_id: string | null;
  related_user_challenge_id: string | null;
  related_life_challenge_id: string | null;
  created_at: Date;
}

// MEDIUM FIX: Pagination constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class LifeHistoryModel {
  /**
   * MEDIUM FIX: Get life history with pagination
   */
  static async getForUser(userId: string, limit?: number, offset?: number): Promise<LifeHistory[]> {
    // Apply safe defaults and limits
    const safeLimit = Math.min(Math.max(1, limit || DEFAULT_LIMIT), MAX_LIMIT);
    const safeOffset = Math.max(0, offset || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM LIFE_HISTORY WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, safeLimit, safeOffset],
    );
    return rows as LifeHistory[];
  }

  /**
   * Get total count for pagination metadata
   */
  static async getCountForUser(userId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM LIFE_HISTORY WHERE user_id = ?',
      [userId],
    );
    return rows[0].total as number;
  }

  static async create(
    userId: string,
    livesChange: number,
    currentLives: number,
    reason: LifeHistoryReason,
    relatedId?: { habitId?: string; userChallengeId?: string; lifeChallengeId?: string },
    connection?: PoolConnection,
  ): Promise<LifeHistory> {
    const conn = connection || pool;
    const id = uuidv4();
    await conn.query(
      `INSERT INTO LIFE_HISTORY 
        (id, user_id, lives_change, current_lives, reason, related_habit_id, related_user_challenge_id, related_life_challenge_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        livesChange,
        currentLives,
        reason,
        relatedId?.habitId ?? null,
        relatedId?.userChallengeId ?? null,
        relatedId?.lifeChallengeId ?? null,
      ],
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM LIFE_HISTORY WHERE id = ?', [id]);
    return rows[0] as LifeHistory;
  }
}
