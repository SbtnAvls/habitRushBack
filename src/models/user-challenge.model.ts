import pool from '../db';
import { PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface UserChallenge {
  id: string;
  user_id: string;
  habit_id: string | null;
  challenge_id: string;
  status: 'assigned' | 'completed' | 'expired' | 'discarded';
  assigned_at: Date;
  completed_at: Date | null;
}

export interface UserChallengeWithDetails extends UserChallenge {
  challenge_title: string;
  challenge_description: string;
  challenge_difficulty: 'easy' | 'medium' | 'hard';
  challenge_type: 'exercise' | 'learning' | 'mindfulness' | 'creative';
}

const mapUserChallenge = (row: RowDataPacket): UserChallenge => ({
  id: row.id,
  user_id: row.user_id,
  habit_id: row.habit_id,
  challenge_id: row.challenge_id,
  status: row.status,
  assigned_at: row.assigned_at,
  completed_at: row.completed_at ?? null,
});

export class UserChallengeModel {
  static async getForUser(userId: string): Promise<UserChallengeWithDetails[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT uc.*, 
              c.title AS challenge_title, 
              c.description AS challenge_description, 
              c.difficulty AS challenge_difficulty, 
              c.type AS challenge_type
       FROM USER_CHALLENGES uc 
       JOIN CHALLENGES c ON uc.challenge_id = c.id
       WHERE uc.user_id = ?
       ORDER BY uc.assigned_at DESC`,
      [userId],
    );
    return rows as unknown as UserChallengeWithDetails[];
  }

  /**
   * Assign a challenge to a user
   * LOW FIX: Added documentation - caller MUST validate challengeId exists before calling
   * @param userId - The user ID
   * @param challengeId - The challenge ID (MUST be validated by caller before calling this method)
   * @param habitId - Optional habit ID for pending redemption challenges
   * @param connection - Optional connection for transaction support
   * @throws Database error if challengeId doesn't exist (FK constraint violation)
   */
  static async assign(
    userId: string,
    challengeId: string,
    habitId?: string | null,
    connection?: PoolConnection,
  ): Promise<UserChallenge> {
    const conn = connection || pool;
    const id = uuidv4();
    await conn.query('INSERT INTO USER_CHALLENGES (id, user_id, challenge_id, habit_id) VALUES (?, ?, ?, ?)', [
      id,
      userId,
      challengeId,
      habitId || null,
    ]);
    const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM USER_CHALLENGES WHERE id = ?', [id]);
    return mapUserChallenge(rows[0]);
  }

  /**
   * Assign a general challenge (for revival - no habit associated)
   */
  static async assignGeneral(
    userId: string,
    challengeId: string,
    connection?: PoolConnection,
  ): Promise<UserChallenge> {
    return this.assign(userId, challengeId, null, connection);
  }

  static async updateStatus(
    userChallengeId: string,
    userId: string,
    status: 'completed' | 'discarded',
  ): Promise<UserChallenge | null> {
    const completed_at = status === 'completed' ? new Date() : null;
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE USER_CHALLENGES SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?',
      [status, completed_at, userChallengeId, userId],
    );

    if (result.affectedRows === 0) {
      return null;
    }

    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USER_CHALLENGES WHERE id = ?', [userChallengeId]);
    return mapUserChallenge(rows[0]);
  }
}
