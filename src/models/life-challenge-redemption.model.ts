import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export interface LifeChallengeRedemption extends RowDataPacket {
  id: string;
  user_id: string;
  life_challenge_id: string;
  lives_gained: number;
  redeemed_at: Date;
}

export class LifeChallengeRedemptionModel {

  static async create(userId: string, lifeChallengeId: string, livesGained: number): Promise<LifeChallengeRedemption> {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO LIFE_CHALLENGE_REDEMPTIONS (id, user_id, life_challenge_id, lives_gained) VALUES (?, ?, ?, ?)',
      [id, userId, lifeChallengeId, livesGained]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM LIFE_CHALLENGE_REDEMPTIONS WHERE id = ?', [id]);
    return rows[0] as LifeChallengeRedemption;
  }

  static async findByUserAndChallenge(userId: string, lifeChallengeId: string): Promise<LifeChallengeRedemption | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM LIFE_CHALLENGE_REDEMPTIONS WHERE user_id = ? AND life_challenge_id = ?',
      [userId, lifeChallengeId]
    );
    if (rows.length === 0) {
      return null;
    }
    return rows[0] as LifeChallengeRedemption;
  }

}
