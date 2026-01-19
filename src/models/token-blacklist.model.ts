import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';

export interface TokenBlacklist {
  id: string;
  token: string;
  user_id: string;
  expires_at: Date;
  blacklisted_at: Date;
}

export class TokenBlacklistModel {
  static async create(tokenData: Omit<TokenBlacklist, 'id' | 'blacklisted_at'>): Promise<TokenBlacklist> {
    const id = uuidv4();
    const blacklisted_at = new Date();

    // HIGH FIX: Use explicit parameterized query instead of SET ? shorthand
    await pool.query(
      `INSERT INTO TOKEN_BLACKLIST (id, token, user_id, expires_at, blacklisted_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, tokenData.token, tokenData.user_id, tokenData.expires_at, blacklisted_at],
    );

    return { id, ...tokenData, blacklisted_at };
  }

  static async isBlacklisted(token: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM TOKEN_BLACKLIST WHERE token = ? AND expires_at > NOW()',
      [token],
    );
    return (rows[0].count as number) > 0;
  }

  static async deleteExpired(): Promise<void> {
    await pool.query('DELETE FROM TOKEN_BLACKLIST WHERE expires_at <= NOW()');
  }

  static async deleteByUserId(userId: string): Promise<void> {
    await pool.query('DELETE FROM TOKEN_BLACKLIST WHERE user_id = ?', [userId]);
  }
}
