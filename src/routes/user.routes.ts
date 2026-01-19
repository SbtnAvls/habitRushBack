import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { ChallengeController } from '../controllers/challenge.controller';
import { getLeagueHistory } from '../controllers/league.controller';
import { NotificationController } from '../controllers/notification.controller';
import { getLifeHistory } from '../controllers/life-history.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { dataFetchLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// CRITICAL FIX: Added rate limiting to /me endpoints
router.get('/me', authMiddleware, dataFetchLimiter, userController.getMe);
router.put('/me', authMiddleware, dataFetchLimiter, userController.updateMe);
router.delete('/me', authMiddleware, dataFetchLimiter, userController.deleteMe);

// User-specific challenge routes
// MEDIUM FIX: Added rate limiting
router.get('/me/challenges', authMiddleware, dataFetchLimiter, ChallengeController.getAssignedToUser);
// MEDIUM FIX: Added UUID validation
router.put('/me/challenges/:id', authMiddleware, validateIdParam, ChallengeController.updateUserChallengeStatus);

// User-specific league routes
// MEDIUM FIX: Added rate limiting
router.get('/me/league-history', authMiddleware, dataFetchLimiter, getLeagueHistory);

// User life history
// MEDIUM FIX: Added rate limiting
router.get('/me/life-history', authMiddleware, dataFetchLimiter, getLifeHistory);

// User-specific notification routes
// MEDIUM FIX: Added rate limiting
router.get('/me/notifications', authMiddleware, dataFetchLimiter, NotificationController.getNotificationsForUser);

export default router;
