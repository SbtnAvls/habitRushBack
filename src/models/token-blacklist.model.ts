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
    const newBlacklistEntry: TokenBlacklist = {
      id: uuidv4(),
      ...tokenData,
      blacklisted_at: new Date(),
    };
    await pool.query('INSERT INTO TOKEN_BLACKLIST SET ?', newBlacklistEntry);
    return newBlacklistEntry;
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
