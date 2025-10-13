import pool from '../db';

export interface LifeChallengeRedemption {
  id: string;
  user_id: string;
  life_challenge_id: string;
  lives_gained: number;
  redeemed_at: Date;
}

export class LifeChallengeRedemptionModel {

  static async create(userId: string, lifeChallengeId: string, livesGained: number): Promise<LifeChallengeRedemption> {
    const [result] = await pool.query(
      'INSERT INTO LIFE_CHALLENGE_REDEMPTIONS (user_id, life_challenge_id, lives_gained) VALUES (?, ?, ?)',
      [userId, lifeChallengeId, livesGained]
    );
    const id = (result as any).insertId;
    const [rows] = await pool.query<any[]>('SELECT * FROM LIFE_CHALLENGE_REDEMPTIONS WHERE id = ?', [id]);
    return rows[0];
  }

  static async findByUserAndChallenge(userId: string, lifeChallengeId: string): Promise<LifeChallengeRedemption | null> {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM LIFE_CHALLENGE_REDEMPTIONS WHERE user_id = ? AND life_challenge_id = ?',
      [userId, lifeChallengeId]
    );
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }

}
