import { Router } from 'express';
import { ChallengeController } from '../controllers/challenge.controller';
import { submitProof, getProofStatus, getAvailableForRevival } from '../controllers/challenge-proof.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All challenge routes should be protected
router.use(authMiddleware);

// GET /api/challenges - Get all available challenges
router.get('/', ChallengeController.getAllAvailable);

// GET /api/challenges/general - Get general challenges (for revival)
router.get('/general', ChallengeController.getGeneralChallenges);

// GET /api/challenges/by-category/:categoryId - Get challenges by category
router.get('/by-category/:categoryId', ChallengeController.getByCategory);

// GET /api/challenges/available-for-revival - Get challenges available for users without lives
router.get('/available-for-revival', getAvailableForRevival);

// POST /api/challenges/:id/assign - Assign a challenge to a habit
router.post('/:id/assign', ChallengeController.assignToHabit);

// POST /api/challenges/:userChallengeId/submit-proof - Submit proof for challenge validation
router.post('/:userChallengeId/submit-proof', submitProof);

// GET /api/challenges/:userChallengeId/proof-status - Get proof validation status
router.get('/:userChallengeId/proof-status', getProofStatus);

export default router;
