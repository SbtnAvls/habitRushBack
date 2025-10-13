import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { ChallengeController } from '../controllers/challenge.controller';
import { getLeagueHistory } from '../controllers/league.controller';
import { NotificationController } from '../controllers/notification.controller';
import { getLifeHistory } from '../controllers/life-history.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/me', authMiddleware, userController.getMe);
router.put('/me', authMiddleware, userController.updateMe);
router.delete('/me', authMiddleware, userController.deleteMe);

// User-specific challenge routes
router.get('/me/challenges', authMiddleware, ChallengeController.getAssignedToUser);
router.put('/me/challenges/:id', authMiddleware, ChallengeController.updateUserChallengeStatus);

// User-specific league routes
router.get('/me/league-history', authMiddleware, getLeagueHistory);

// User life history
router.get('/me/life-history', authMiddleware, getLifeHistory);

// User-specific notification routes
router.get('/me/notifications', authMiddleware, NotificationController.getNotificationsForUser);

export default router;
