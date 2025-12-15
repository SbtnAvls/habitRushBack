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

export class LifeHistoryModel {
  static async getForUser(userId: string): Promise<LifeHistory[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM LIFE_HISTORY WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );
    return rows as LifeHistory[];
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
