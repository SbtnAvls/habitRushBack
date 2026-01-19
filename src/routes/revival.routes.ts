import { Router } from 'express';
import { RevivalController } from '../controllers/revival.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { revivalLimiter, dataFetchLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// All revival routes require authentication
router.use(authMiddleware);

// GET /revival/status - Check if user is dead
// HIGH FIX: Added rate limiting
router.get('/status', dataFetchLimiter, RevivalController.getStatus);

// GET /revival/options - Get available revival options
// HIGH FIX: Added rate limiting
router.get('/options', dataFetchLimiter, RevivalController.getOptions);

// POST /revival/reset - Option A: Total reset
// LOW FIX: Added rate limiting to prevent abuse
router.post('/reset', revivalLimiter, RevivalController.resetTotal);

// POST /revival/challenge - Option B: Complete penance challenge
// LOW FIX: Added rate limiting to prevent abuse
router.post('/challenge', revivalLimiter, RevivalController.reviveWithChallenge);

export default router;
