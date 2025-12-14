import { RowDataPacket } from 'mysql2';
import pool from '../db';

export interface LifeChallenge {
  id: string;
  title: string;
  description: string;
  reward: number;
  redeemable_type: 'once' | 'unlimited';
  icon: string;
  verification_function: string;
  is_active: boolean;
}

interface LifeChallengeRow extends RowDataPacket, LifeChallenge {}

export class LifeChallengeModel {
  static async getAllActive(): Promise<LifeChallenge[]> {
    const [rows] = await pool.query<LifeChallengeRow[]>('SELECT * FROM LIFE_CHALLENGES WHERE is_active = TRUE');
    return rows;
  }

  static async findById(id: string): Promise<LifeChallenge | null> {
    const [rows] = await pool.query<LifeChallengeRow[]>('SELECT * FROM LIFE_CHALLENGES WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }
}
