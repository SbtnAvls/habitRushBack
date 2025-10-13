import pool from '../db';

export interface UserChallenge {
  id: string;
  user_id: string;
  habit_id: string;
  challenge_id: string;
  status: 'assigned' | 'completed' | 'expired' | 'discarded';
  assigned_at: Date;
  completed_at: Date | null;
}

export class UserChallengeModel {

  static async getForUser(userId: string): Promise<any[]> {
    const [rows] = await pool.query<any[]>(
      `SELECT uc.*, c.title, c.description, c.difficulty, c.type 
       FROM USER_CHALLENGES uc 
       JOIN CHALLENGES c ON uc.challenge_id = c.id
       WHERE uc.user_id = ?`,
      [userId]
    );
    return rows;
  }

  static async assign(userId: string, challengeId: string, habitId: string): Promise<UserChallenge> {
    const [result] = await pool.query(
      'INSERT INTO USER_CHALLENGES (user_id, challenge_id, habit_id) VALUES (?, ?, ?)',
      [userId, challengeId, habitId]
    );
    const id = (result as any).insertId;
    const [rows] = await pool.query<any[]>('SELECT * FROM USER_CHALLENGES WHERE id = ?', [id]);
    return rows[0];
  }

  static async updateStatus(userChallengeId: string, userId: string, status: 'completed' | 'discarded'): Promise<UserChallenge | null> {
    const completed_at = status === 'completed' ? new Date() : null;
    const [result] = await pool.query(
      'UPDATE USER_CHALLENGES SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?',
      [status, completed_at, userChallengeId, userId]
    );

    if ((result as any).affectedRows === 0) {
      return null;
    }

    const [rows] = await pool.query<any[]>('SELECT * FROM USER_CHALLENGES WHERE id = ?', [userChallengeId]);
    return rows[0];
  }

}
