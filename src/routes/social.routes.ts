import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { socialSearchLimiter, socialProfileLimiter, socialFollowLimiter } from '../middleware/rate-limit.middleware';
import { validateUUIDParams } from '../middleware/uuid-validation.middleware';
import {
  searchUsers,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
  getProfile,
} from '../controllers/social.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// MEDIUM FIX: Create UUID validation middleware for userId parameter
const validateUserIdParam = validateUUIDParams(['userId']);

// Search users - rate limited to prevent enumeration
router.get('/search', socialSearchLimiter, searchUsers);

// Follow/Unfollow - MEDIUM FIX: Added rate limiting and UUID validation
router.post('/follow/:userId', validateUserIdParam, socialFollowLimiter, followUser);
router.delete('/follow/:userId', validateUserIdParam, socialFollowLimiter, unfollowUser);

// Get follow status - CRITICAL FIX: Added rate limiting - MEDIUM FIX: Added UUID validation
router.get('/follow-status/:userId', socialProfileLimiter, validateUserIdParam, getFollowStatus);

// Get followers/following lists - rate limited - MEDIUM FIX: Added UUID validation
router.get('/followers/:userId', validateUserIdParam, socialProfileLimiter, getFollowers);
router.get('/following/:userId', validateUserIdParam, socialProfileLimiter, getFollowing);

// Get public profile - rate limited to prevent enumeration - MEDIUM FIX: Added UUID validation
router.get('/profile/:userId', validateUserIdParam, socialProfileLimiter, getProfile);

export default router;
