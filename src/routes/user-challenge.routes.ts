import { Router } from 'express';
import { ChallengeController } from '../controllers/challenge.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes in this file are protected and pertain to the logged-in user
router.use(authMiddleware);

// GET /api/users/me/challenges - Get challenges assigned to the current user
router.get('/', ChallengeController.getAssignedToUser);

// PUT /api/users/me/challenges/:id - Update the status of a user's challenge (e.g., "completed")
router.put('/:id', ChallengeController.updateUserChallengeStatus);

export default router;
