import pool from '../db';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'exercise' | 'learning' | 'mindfulness' | 'creative';
  estimated_time: number;
  is_active: boolean;
  created_at: Date;
}

export class ChallengeModel {
  static async getAllActive(): Promise<Challenge[]> {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM CHALLENGES WHERE is_active = TRUE'
    );
    return rows;
  }

  static async findById(id: string): Promise<Challenge | null> {
    const [rows] = await pool.query<any[]>('SELECT * FROM CHALLENGES WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }
}
