import { Router } from 'express';
import { ChallengeController } from '../controllers/challenge.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All challenge routes should be protected
router.use(authMiddleware);

// GET /api/challenges - Get all available challenges
router.get('/', ChallengeController.getAllAvailable);

// POST /api/challenges/:id/assign - Assign a challenge to a habit
router.post('/:id/assign', ChallengeController.assignToHabit);

export default router;
