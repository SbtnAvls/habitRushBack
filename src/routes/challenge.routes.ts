import { Router } from 'express';
import { ChallengeController } from '../controllers/challenge.controller';
import { submitProof, getProofStatus, getAvailableForRevival } from '../controllers/challenge-proof.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam, validateUUIDParams } from '../middleware/uuid-validation.middleware';
import { challengeActionLimiter, challengeViewLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// All challenge routes should be protected
router.use(authMiddleware);

// MEDIUM FIX: Create UUID validation middlewares for different param names
const validateCategoryIdParam = validateUUIDParams(['categoryId']);
const validateUserChallengeIdParam = validateUUIDParams(['userChallengeId']);

// GET /api/challenges - Get all available challenges
// HIGH FIX: Added rate limiting to prevent data enumeration
router.get('/', challengeViewLimiter, ChallengeController.getAllAvailable);

// GET /api/challenges/general - Get general challenges (for revival)
// HIGH FIX: Added rate limiting to prevent data enumeration
router.get('/general', challengeViewLimiter, ChallengeController.getGeneralChallenges);

// GET /api/challenges/by-category/:categoryId - Get challenges by category
// MEDIUM FIX: Added UUID validation for :categoryId parameter
// HIGH FIX: Added rate limiting to prevent data enumeration
router.get('/by-category/:categoryId', challengeViewLimiter, validateCategoryIdParam, ChallengeController.getByCategory);

// GET /api/challenges/available-for-revival - Get challenges available for users without lives
// HIGH FIX: Added rate limiting to prevent data enumeration
router.get('/available-for-revival', challengeViewLimiter, getAvailableForRevival);

// POST /api/challenges/:id/assign - Assign a challenge to a habit
// MEDIUM FIX: Added UUID validation for :id parameter
// LOW FIX: Added rate limiting to prevent abuse
router.post('/:id/assign', challengeActionLimiter, validateIdParam, ChallengeController.assignToHabit);

// POST /api/challenges/:userChallengeId/submit-proof - Submit proof for challenge validation
// MEDIUM FIX: Added UUID validation for :userChallengeId parameter
// LOW FIX: Added rate limiting to prevent abuse
router.post('/:userChallengeId/submit-proof', challengeActionLimiter, validateUserChallengeIdParam, submitProof);

// GET /api/challenges/:userChallengeId/proof-status - Get proof validation status
// MEDIUM FIX: Added UUID validation for :userChallengeId parameter
// LOW FIX: Added rate limiting
router.get('/:userChallengeId/proof-status', challengeViewLimiter, validateUserChallengeIdParam, getProofStatus);

export default router;
