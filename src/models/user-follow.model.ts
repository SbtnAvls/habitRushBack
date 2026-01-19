import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import pool from '../db';

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: Date;
}

export interface FollowUser {
  id: string;
  username: string;
  is_profile_public: boolean;
  followers_count: number;
  following_count: number;
  created_at: Date;
}

interface FollowUserRow extends RowDataPacket, FollowUser {
  total?: number;
}

export class UserFollowModel {
  /**
   * Create a follow relationship
   */
  static async follow(followerId: string, followingId: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query<ResultSetHeader>(
      'INSERT INTO USER_FOLLOWS (follower_id, following_id) VALUES (?, ?)',
      [followerId, followingId]
    );
  }

  /**
   * Remove a follow relationship
   */
  static async unfollow(followerId: string, followingId: string, connection?: PoolConnection): Promise<boolean> {
    const conn = connection || pool;
    const [result] = await conn.query<ResultSetHeader>(
      'DELETE FROM USER_FOLLOWS WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Check if user A follows user B
   */
  static async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM USER_FOLLOWS WHERE follower_id = ? AND following_id = ? LIMIT 1',
      [followerId, followingId]
    );
    return rows.length > 0;
  }

  /**
   * Get followers of a user (people who follow them)
   * Optimized: single query with COUNT(*) OVER() for total
   */
  static async getFollowers(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: FollowUser[]; total: number }> {
    const offset = (page - 1) * limit;

    const [rows] = await pool.query<FollowUserRow[]>(
      `SELECT u.id, u.username, u.is_profile_public, u.followers_count, u.following_count,
              uf.created_at, COUNT(*) OVER() as total
       FROM USER_FOLLOWS uf
       JOIN USERS u ON uf.follower_id = u.id
       WHERE uf.following_id = ?
       ORDER BY uf.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const users = rows.map(({ total: _, ...user }) => user as FollowUser);

    return { users, total };
  }

  /**
   * Get users that a user is following
   * Optimized: single query with COUNT(*) OVER() for total
   */
  static async getFollowing(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: FollowUser[]; total: number }> {
    const offset = (page - 1) * limit;

    const [rows] = await pool.query<FollowUserRow[]>(
      `SELECT u.id, u.username, u.is_profile_public, u.followers_count, u.following_count,
              uf.created_at, COUNT(*) OVER() as total
       FROM USER_FOLLOWS uf
       JOIN USERS u ON uf.following_id = u.id
       WHERE uf.follower_id = ?
       ORDER BY uf.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const users = rows.map(({ total: _, ...user }) => user as FollowUser);

    return { users, total };
  }

  /**
   * Get follower count for a user
   */
  static async getFollowersCount(userId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM USER_FOLLOWS WHERE following_id = ?',
      [userId]
    );
    return Number(rows[0].count);
  }

  /**
   * Get following count for a user
   */
  static async getFollowingCount(userId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM USER_FOLLOWS WHERE follower_id = ?',
      [userId]
    );
    return Number(rows[0].count);
  }

  /**
   * Update cached follower/following counts in USERS table
   */
  static async updateCachedCounts(userId: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE USERS SET
         followers_count = (SELECT COUNT(*) FROM USER_FOLLOWS WHERE following_id = ?),
         following_count = (SELECT COUNT(*) FROM USER_FOLLOWS WHERE follower_id = ?)
       WHERE id = ?`,
      [userId, userId, userId]
    );
  }

  /**
   * Check if users mutually follow each other
   */
  static async areMutualFollowers(userIdA: string, userIdB: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM USER_FOLLOWS
       WHERE (follower_id = ? AND following_id = ?)
          OR (follower_id = ? AND following_id = ?)`,
      [userIdA, userIdB, userIdB, userIdA]
    );
    return Number(rows[0].count) === 2;
  }

  /**
   * Get which users from a list are being followed by the follower
   * Returns a Set of user IDs that the follower is following
   * Optimized: single query instead of N queries
   */
  static async getFollowingFromList(followerId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT following_id FROM USER_FOLLOWS
       WHERE follower_id = ? AND following_id IN (?)`,
      [followerId, userIds]
    );

    return new Set(rows.map(row => row.following_id as string));
  }
}
