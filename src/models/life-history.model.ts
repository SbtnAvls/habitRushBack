import pool from '../db';

export type LifeHistoryReason = 'habit_missed' | 'challenge_completed' | 'life_challenge_redeemed';

export interface LifeHistory {
  id: string;
  user_id: string;
  lives_change: number;
  current_lives: number;
  reason: LifeHistoryReason;
  related_habit_id?: string;
  related_user_challenge_id?: string;
  related_life_challenge_id?: string;
  created_at: Date;
}

export class LifeHistoryModel {

  static async getForUser(userId: string): Promise<LifeHistory[]> {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM LIFE_HISTORY WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async create(userId: string, livesChange: number, currentLives: number, reason: LifeHistoryReason, relatedId?: { habitId?: string; userChallengeId?: string; lifeChallengeId?: string }): Promise<LifeHistory> {
    const [result] = await pool.query(
      'INSERT INTO LIFE_HISTORY (user_id, lives_change, current_lives, reason, related_habit_id, related_user_challenge_id, related_life_challenge_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, livesChange, currentLives, reason, relatedId?.habitId, relatedId?.userChallengeId, relatedId?.lifeChallengeId]
    );
    const id = (result as any).insertId;
    const [rows] = await pool.query<any[]>('SELECT * FROM LIFE_HISTORY WHERE id = ?', [id]);
    return rows[0];
  }

}
