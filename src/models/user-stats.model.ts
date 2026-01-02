import { RowDataPacket } from 'mysql2';
import pool from '../db';
import { PoolConnection } from 'mysql2/promise';

export interface UserStats {
  user_id: string;
  discipline_score: number;
  max_streak: number;
  total_completions: number;
  perfect_weeks: number;
  revival_count: number;
  reset_count: number;
  last_daily_bonus_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UserStatsRow extends RowDataPacket, UserStats {}

export class UserStatsModel {
  /**
   * Get stats for a user
   */
  static async getForUser(userId: string): Promise<UserStats | null> {
    const [rows] = await pool.query<UserStatsRow[]>('SELECT * FROM USER_STATS WHERE user_id = ?', [userId]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Create stats for a new user
   */
  static async createForUser(userId: string, connection?: PoolConnection): Promise<UserStats> {
    const conn = connection || pool;
    await conn.query('INSERT INTO USER_STATS (user_id) VALUES (?)', [userId]);
    const result = await this.getForUser(userId);
    return result as UserStats;
  }

  /**
   * Get or create stats for a user
   */
  static async getOrCreate(userId: string): Promise<UserStats> {
    const existing = await this.getForUser(userId);
    if (existing) return existing;
    return this.createForUser(userId);
  }

  /**
   * Update discipline score (clamped between 0 and 1000)
   */
  static async updateDiscipline(userId: string, change: number, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS
       SET discipline_score = LEAST(1000, GREATEST(0, discipline_score + ?)),
           updated_at = NOW()
       WHERE user_id = ?`,
      [change, userId],
    );
  }

  /**
   * Set discipline score to a percentage of current value
   */
  static async multiplyDiscipline(userId: string, multiplier: number, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS
       SET discipline_score = FLOOR(discipline_score * ?),
           updated_at = NOW()
       WHERE user_id = ?`,
      [multiplier, userId],
    );
  }

  /**
   * Increment a specific stat counter
   */
  static async incrementStat(
    userId: string,
    stat: 'total_completions' | 'perfect_weeks' | 'revival_count' | 'reset_count',
    connection?: PoolConnection,
  ): Promise<void> {
    const conn = connection || pool;
    await conn.query(`UPDATE USER_STATS SET ${stat} = ${stat} + 1, updated_at = NOW() WHERE user_id = ?`, [userId]);
  }

  /**
   * Update max streak if current is higher
   */
  static async updateMaxStreak(userId: string, currentStreak: number, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS
       SET max_streak = GREATEST(max_streak, ?),
           updated_at = NOW()
       WHERE user_id = ?`,
      [currentStreak, userId],
    );
  }

  /**
   * Get leaderboard by discipline score
   */
  static async getLeaderboard(limit: number = 10): Promise<UserStats[]> {
    const [rows] = await pool.query<UserStatsRow[]>(
      `SELECT us.*, u.name as user_name
       FROM USER_STATS us
       JOIN USERS u ON us.user_id = u.id
       ORDER BY us.discipline_score DESC
       LIMIT ?`,
      [limit],
    );
    return rows;
  }

  /**
   * Check if daily bonus was already granted for a specific date
   */
  static async hasDailyBonusForDate(userId: string, date: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT last_daily_bonus_date FROM USER_STATS WHERE user_id = ? AND last_daily_bonus_date = ?',
      [userId, date],
    );
    return rows.length > 0;
  }

  /**
   * Set the last daily bonus date
   */
  static async setDailyBonusDate(userId: string, date: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USER_STATS SET last_daily_bonus_date = ?, updated_at = NOW() WHERE user_id = ?`,
      [date, userId],
    );
  }
}
