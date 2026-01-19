import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserModel, SearchUserResult } from '../models/user.model';
import { UserFollowModel } from '../models/user-follow.model';
import { SocialService, PublicProfile } from '../services/social.service';

// MEDIUM FIX: Strict integer parsing that rejects partial matches like "1abc"
function parseStrictInt(value: unknown, defaultValue: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

interface SearchUserWithFollowStatus extends SearchUserResult {
  is_following: boolean;
}

/**
 * Search users by username
 * GET /social/search?q=<query>&page=1&limit=20
 */
export const searchUsers = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { q, page = '1', limit = '20' } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ message: 'Search query (q) is required' });
  }

  const query = q.trim();
  if (query.length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters' });
  }

  // CRITICAL FIX: Limit query length to prevent DoS via expensive LIKE queries
  const MAX_QUERY_LENGTH = 100;
  if (query.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({
      message: `Search query must not exceed ${MAX_QUERY_LENGTH} characters`,
      max_length: MAX_QUERY_LENGTH,
    });
  }

  try {
    // HIGH FIX: Limit max page to prevent expensive OFFSET queries
    // MEDIUM FIX: Use strict int parsing to reject partial matches like "1abc"
    const MAX_PAGE = 100;
    const pageNum = Math.min(MAX_PAGE, Math.max(1, parseStrictInt(page, 1)));
    const limitNum = Math.min(50, Math.max(1, parseStrictInt(limit, 20)));

    const { users, total } = await UserModel.searchByUsername(query, userId, pageNum, limitNum);

    // Get follow status for all users in a single query (optimized)
    const userIds = users.map(u => u.id);
    const followingSet = await UserFollowModel.getFollowingFromList(userId, userIds);

    const usersWithFollowStatus: SearchUserWithFollowStatus[] = users.map(user => ({
      ...user,
      is_following: followingSet.has(user.id),
    }));

    res.json({
      users: usersWithFollowStatus,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Follow a user
 * POST /social/follow/:userId
 */
export const followUser = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId: targetUserId } = req.params;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const result = await SocialService.followUser(currentUserId, targetUserId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({ message: 'Successfully followed user' });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Unfollow a user
 * DELETE /social/follow/:userId
 */
export const unfollowUser = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId: targetUserId } = req.params;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const result = await SocialService.unfollowUser(currentUserId, targetUserId);

    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get followers of a user
 * GET /social/followers/:userId?page=1&limit=20
 */
export const getFollowers = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId } = req.params;
  const { page = '1', limit = '20' } = req.query;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    // HIGH FIX: Limit max page to prevent expensive OFFSET queries
    // MEDIUM FIX: Use strict int parsing to reject partial matches like "1abc"
    const MAX_PAGE = 100;
    const pageNum = Math.min(MAX_PAGE, Math.max(1, parseStrictInt(page, 1)));
    const limitNum = Math.min(50, Math.max(1, parseStrictInt(limit, 20)));

    const result = await SocialService.getFollowers(userId, pageNum, limitNum);
    res.json(result);
  } catch (error) {
    console.error('Error getting followers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get users that a user is following
 * GET /social/following/:userId?page=1&limit=20
 */
export const getFollowing = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId } = req.params;
  const { page = '1', limit = '20' } = req.query;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    // HIGH FIX: Limit max page to prevent expensive OFFSET queries
    // MEDIUM FIX: Use strict int parsing to reject partial matches like "1abc"
    const MAX_PAGE = 100;
    const pageNum = Math.min(MAX_PAGE, Math.max(1, parseStrictInt(page, 1)));
    const limitNum = Math.min(50, Math.max(1, parseStrictInt(limit, 20)));

    const result = await SocialService.getFollowing(userId, pageNum, limitNum);
    res.json(result);
  } catch (error) {
    console.error('Error getting following:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get follow status between current user and target user
 * GET /social/follow-status/:userId
 */
export const getFollowStatus = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId: targetUserId } = req.params;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const status = await SocialService.getFollowStatus(currentUserId, targetUserId);
    res.json(status);
  } catch (error) {
    console.error('Error getting follow status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get public profile of a user
 * GET /social/profile/:userId
 */
export const getProfile = async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user?.id;
  const { userId: targetUserId } = req.params;

  if (!currentUserId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!targetUserId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const profile: PublicProfile | null = await SocialService.getPublicProfile(
      targetUserId,
      currentUserId
    );

    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(profile);
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
