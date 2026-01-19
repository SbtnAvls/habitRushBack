import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../db';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'exercise' | 'learning' | 'mindfulness' | 'creative';
  category_id: string | null;
  is_general: boolean;
  estimated_time: number;
  is_active: boolean;
  created_at: Date;
}

interface ChallengeRow extends RowDataPacket, Challenge {}

export class ChallengeModel {
  /**
   * Get all active challenges
   */
  static async getAllActive(): Promise<Challenge[]> {
    const [rows] = await pool.query<ChallengeRow[]>('SELECT * FROM CHALLENGES WHERE is_active = TRUE');
    return rows;
  }

  /**
   * Find a challenge by ID
   */
  static async findById(id: string): Promise<Challenge | null> {
    const [rows] = await pool.query<ChallengeRow[]>('SELECT * FROM CHALLENGES WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }

  /**
   * CRITICAL FIX: Find challenge by ID with row lock for transactional updates
   * Prevents TOCTOU race conditions in assignment operations
   */
  static async findByIdForUpdate(id: string, connection: PoolConnection): Promise<Challenge | null> {
    const [rows] = await connection.query<ChallengeRow[]>(
      'SELECT * FROM CHALLENGES WHERE id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      return null;
    }
    return rows[0];
  }

  /**
   * Get all general challenges (for revival)
   */
  static async getGeneralChallenges(): Promise<Challenge[]> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE is_general = TRUE AND is_active = TRUE
       ORDER BY difficulty, estimated_time`,
    );
    return rows;
  }

  /**
   * Get challenges by category (for pending redemptions)
   */
  static async getByCategory(categoryId: string): Promise<Challenge[]> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE category_id = ? AND is_general = FALSE AND is_active = TRUE
       ORDER BY difficulty, estimated_time`,
      [categoryId],
    );
    return rows;
  }

  /**
   * Get a random challenge from a category
   */
  static async getRandomByCategory(categoryId: string): Promise<Challenge | null> {
    const [rows] = await pool.query<ChallengeRow[]>(
      `SELECT * FROM CHALLENGES
       WHERE category_id = ? AND is_general = FALSE AND is_active = TRUE
       ORDER BY RAND()
       LIMIT 1`,
      [categoryId],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Check if a challenge belongs to a specific category
   */
  static async belongsToCategory(challengeId: string, categoryId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM CHALLENGES
       WHERE id = ? AND category_id = ? AND is_active = TRUE
       LIMIT 1`,
      [challengeId, categoryId],
    );
    return rows.length > 0;
  }

  /**
   * Check if a challenge is a general challenge
   */
  static async isGeneralChallenge(challengeId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM CHALLENGES
       WHERE id = ? AND is_general = TRUE AND is_active = TRUE
       LIMIT 1`,
      [challengeId],
    );
    return rows.length > 0;
  }
}
