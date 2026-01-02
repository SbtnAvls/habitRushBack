import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';

export interface RefreshToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

export class RefreshTokenModel {
  static async create(refreshToken: Omit<RefreshToken, 'id' | 'created_at'>): Promise<RefreshToken> {
    const newRefreshToken: RefreshToken = {
      id: uuidv4(),
      ...refreshToken,
      created_at: new Date(),
    };
    await pool.query('INSERT INTO REFRESH_TOKENS SET ?', newRefreshToken);
    return newRefreshToken;
  }

  static async findByToken(token: string): Promise<RefreshToken | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM REFRESH_TOKENS WHERE token = ? AND expires_at > NOW()',
      [token],
    );
    return rows[0] as RefreshToken | undefined;
  }

  static async findByUserId(userId: string): Promise<RefreshToken[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM REFRESH_TOKENS WHERE user_id = ? AND expires_at > NOW()',
      [userId],
    );
    return rows as RefreshToken[];
  }

  static async deleteByToken(token: string): Promise<void> {
    await pool.query('DELETE FROM REFRESH_TOKENS WHERE token = ?', [token]);
  }

  static async deleteByUserId(userId: string): Promise<void> {
    await pool.query('DELETE FROM REFRESH_TOKENS WHERE user_id = ?', [userId]);
  }

  static async deleteExpired(): Promise<void> {
    await pool.query('DELETE FROM REFRESH_TOKENS WHERE expires_at <= NOW()');
  }
}
