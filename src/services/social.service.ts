import { RowDataPacket } from 'mysql2/promise';
import pool from '../db';
import { UserFollowModel, FollowUser } from '../models/user-follow.model';
import { UserModel } from '../models/user.model';
import { UserStatsModel } from '../models/user-stats.model';
import { getCurrentLeagueWeek } from './league-management.service';

export interface FollowResult {
  success: boolean;
  error?: string;
}

export interface FollowListResult {
  users: FollowUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// LOW FIX: Maximum following limit to prevent abuse
const MAX_FOLLOWING_LIMIT = 5000;

export class SocialService {
  /**
   * Follow a user
   * - Validates both users exist
   * - Prevents self-follow
   * - Enforces maximum following limit
   * - Updates cached counts in transaction
   */
  static async followUser(followerId: string, followingId: string): Promise<FollowResult> {
    // Prevent self-follow
    if (followerId === followingId) {
      return { success: false, error: 'Cannot follow yourself' };
    }

    // Check if target user exists
    const targetUser = await UserModel.findById(followingId);
    if (!targetUser) {
      return { success: false, error: 'User not found' };
    }

    // LOW FIX: Check if user has reached maximum following limit
    const followingCount = await UserFollowModel.getFollowingCount(followerId);
    if (followingCount >= MAX_FOLLOWING_LIMIT) {
      return { success: false, error: `Cannot follow more than ${MAX_FOLLOWING_LIMIT} users` };
    }

    // Check if already following
    const alreadyFollowing = await UserFollowModel.isFollowing(followerId, followingId);
    if (alreadyFollowing) {
      return { success: false, error: 'Already following this user' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Create follow relationship
      await UserFollowModel.follow(followerId, followingId, connection);

      // Update cached counts for both users
      await UserFollowModel.updateCachedCounts(followerId, connection);
      await UserFollowModel.updateCachedCounts(followingId, connection);

      await connection.commit();
      return { success: true };
    } catch (error: any) {
      await connection.rollback();

      // Handle duplicate entry (race condition)
      if (error.code === 'ER_DUP_ENTRY') {
        return { success: false, error: 'Already following this user' };
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Unfollow a user
   * - Updates cached counts in transaction
   */
  static async unfollowUser(followerId: string, followingId: string): Promise<FollowResult> {
    // Prevent self-unfollow attempt
    if (followerId === followingId) {
      return { success: false, error: 'Cannot unfollow yourself' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Remove follow relationship
      const removed = await UserFollowModel.unfollow(followerId, followingId, connection);

      if (!removed) {
        await connection.rollback();
        return { success: false, error: 'Not following this user' };
      }

      // Update cached counts for both users
      await UserFollowModel.updateCachedCounts(followerId, connection);
      await UserFollowModel.updateCachedCounts(followingId, connection);

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get followers list with pagination
   */
  static async getFollowers(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<FollowListResult> {
    // Validate pagination params
    page = Math.max(1, page);
    limit = Math.min(50, Math.max(1, limit));

    const { users, total } = await UserFollowModel.getFollowers(userId, page, limit);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get following list with pagination
   */
  static async getFollowing(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<FollowListResult> {
    // Validate pagination params
    page = Math.max(1, page);
    limit = Math.min(50, Math.max(1, limit));

    const { users, total } = await UserFollowModel.getFollowing(userId, page, limit);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Check follow status between two users
   */
  static async getFollowStatus(
    currentUserId: string,
    targetUserId: string
  ): Promise<{ isFollowing: boolean; isFollowedBy: boolean }> {
    // Same user can't follow themselves
    if (currentUserId === targetUserId) {
      return { isFollowing: false, isFollowedBy: false };
    }

    const [isFollowing, isFollowedBy] = await Promise.all([
      UserFollowModel.isFollowing(currentUserId, targetUserId),
      UserFollowModel.isFollowing(targetUserId, currentUserId),
    ]);

    return { isFollowing, isFollowedBy };
  }

  /**
   * Get public profile of a user
   * Returns public stats without sensitive information
   */
  static async getPublicProfile(
    targetUserId: string,
    currentUserId: string
  ): Promise<PublicProfile | null> {
    // Get user basic info
    const user = await UserModel.findById(targetUserId);
    if (!user) {
      return null;
    }

    // Check if profile is public or if viewing own profile
    const isOwnProfile = targetUserId === currentUserId;
    const isProfilePublic = user.is_profile_public ?? true; // Default to public
    if (!isProfilePublic && !isOwnProfile) {
      // HIGH FIX: For private profiles, only show follow status, not counts
      // This prevents enumeration and information disclosure
      const followStatus = await this.getFollowStatus(currentUserId, targetUserId);
      return {
        id: user.id,
        username: user.username,
        is_profile_public: false,
        is_following: followStatus.isFollowing,
        follows_you: followStatus.isFollowedBy,
        followers_count: null, // Hidden for private profiles
        following_count: null, // Hidden for private profiles
        created_at: user.created_at,
        stats: null, // Stats hidden for private profiles
      };
    }

    // Get follow status (parallel queries)
    const [followStatus, userStats, leaguePosition] = await Promise.all([
      isOwnProfile
        ? { isFollowing: false, isFollowedBy: false }
        : this.getFollowStatus(currentUserId, targetUserId),
      UserStatsModel.getForUser(targetUserId),
      this.getUserLeaguePosition(targetUserId),
    ]);

    // Calculate member_since_days (ensure non-negative)
    const memberSinceDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))
    );

    return {
      id: user.id,
      username: user.username,
      is_profile_public: isProfilePublic,
      is_following: followStatus.isFollowing,
      follows_you: followStatus.isFollowedBy,
      followers_count: user.followers_count ?? 0,
      following_count: user.following_count ?? 0,
      created_at: user.created_at,
      stats: {
        total_habits: user.total_habits,
        max_streak: userStats?.max_streak ?? 0,
        total_completions: userStats?.total_completions ?? 0,
        member_since_days: memberSinceDays,
        league: user.league,
        league_position: leaguePosition,
      },
    };
  }

  /**
   * Get user's current position in their league group
   */
  private static async getUserLeaguePosition(userId: string): Promise<number | null> {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      return null;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT position FROM LEAGUE_COMPETITORS
       WHERE user_id = ? AND league_week_id = ?`,
      [userId, currentWeek.id]
    );

    return rows.length > 0 ? Number(rows[0].position) : null;
  }
}

export interface PublicProfileStats {
  total_habits: number;
  max_streak: number;
  total_completions: number;
  member_since_days: number;
  league: number;
  league_position: number | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  is_profile_public: boolean;
  is_following: boolean;
  follows_you: boolean;
  followers_count: number | null; // null for private profiles
  following_count: number | null; // null for private profiles
  created_at: Date;
  stats: PublicProfileStats | null;
}
