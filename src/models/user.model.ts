import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket, PoolConnection } from 'mysql2/promise';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  google_id?: string | null;
  lives: number;
  max_lives: number;
  total_habits: number;
  xp: number;
  weekly_xp: number;
  league: number;
  league_week_start: Date;
  theme: string;
  font_size: string;
  is_admin?: boolean;
  followers_count?: number;
  following_count?: number;
  is_profile_public?: boolean;
  created_at: Date;
  updated_at: Date;
}

// HIGH FIX: Whitelist of allowed fields for user updates (prevents prototype pollution)
const ALLOWED_USER_UPDATE_FIELDS = [
  'username', 'email', 'password_hash', 'google_id', 'lives', 'max_lives',
  'total_habits', 'xp', 'weekly_xp', 'league', 'league_week_start',
  'theme', 'font_size', 'is_admin', 'followers_count', 'following_count',
  'is_profile_public', 'updated_at',
] as const;

export class UserModel {
  static async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const id = uuidv4();
    const now = new Date();

    // HIGH FIX: Use explicit parameterized query instead of SET ? shorthand
    await pool.query(
      `INSERT INTO USERS (
        id, username, email, password_hash, google_id, lives, max_lives,
        total_habits, xp, weekly_xp, league, league_week_start,
        theme, font_size, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, user.username, user.email, user.password_hash, user.google_id || null,
        user.lives, user.max_lives, user.total_habits, user.xp, user.weekly_xp,
        user.league, user.league_week_start, user.theme, user.font_size, now, now,
      ],
    );

    return { id, ...user, created_at: now, updated_at: now };
  }

  static async findByEmail(email: string): Promise<User | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USERS WHERE email = ?', [email]);
    return rows[0] as User | undefined;
  }

  static async findById(id: string): Promise<User | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USERS WHERE id = ?', [id]);
    return rows[0] as User | undefined;
  }

  static async findByGoogleId(googleId: string): Promise<User | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USERS WHERE google_id = ?', [googleId]);
    return rows[0] as User | undefined;
  }

  static async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await pool.query('UPDATE USERS SET google_id = ? WHERE id = ?', [googleId, userId]);
  }

  static async update(id: string, updates: Partial<User>): Promise<void> {
    // HIGH FIX: Filter to only allowed fields to prevent prototype pollution
    const filteredUpdates: Record<string, unknown> = {};
    for (const key of ALLOWED_USER_UPDATE_FIELDS) {
      if (key in updates && updates[key as keyof User] !== undefined) {
        filteredUpdates[key] = updates[key as keyof User];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return; // Nothing to update
    }

    // Build parameterized query dynamically with whitelisted fields only
    const fields = Object.keys(filteredUpdates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(filteredUpdates), id];

    await pool.query(`UPDATE USERS SET ${setClause} WHERE id = ?`, values);
  }

  static async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM USERS WHERE id = ?', [id]);
  }

  static async updateLives(userId: string, newLives: number): Promise<void> {
    await pool.query('UPDATE USERS SET lives = ? WHERE id = ?', [newLives, userId]);
  }

  static async updateXp(userId: string, xpToAdd: number, connection?: PoolConnection): Promise<void> {
    const query = 'UPDATE USERS SET xp = xp + ?, weekly_xp = weekly_xp + ? WHERE id = ?';
    const params = [xpToAdd, xpToAdd, userId];

    if (connection) {
      await connection.query(query, params);
    } else {
      await pool.query(query, params);
    }
  }

  /**
   * Search users by username
   * Excludes the current user from results
   */
  static async searchByUsername(
    query: string,
    excludeUserId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: SearchUserResult[]; total: number }> {
    const offset = (page - 1) * limit;
    // Escape LIKE wildcards to prevent unintended pattern matching
    const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escapedQuery}%`;
    const startsWithPattern = `${escapedQuery}%`;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, followers_count, following_count, is_profile_public,
              COUNT(*) OVER() as total
       FROM USERS
       WHERE username LIKE ? ESCAPE '\\\\' AND id != ?
       ORDER BY
         CASE WHEN username LIKE ? ESCAPE '\\\\' THEN 0 ELSE 1 END,
         followers_count DESC
       LIMIT ? OFFSET ?`,
      [searchPattern, excludeUserId, startsWithPattern, limit, offset]
    );

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const users = rows.map(({ total: _, ...user }) => user as SearchUserResult);

    return { users, total };
  }
}

export interface SearchUserResult {
  id: string;
  username: string;
  followers_count: number;
  following_count: number;
  is_profile_public: boolean;
}
