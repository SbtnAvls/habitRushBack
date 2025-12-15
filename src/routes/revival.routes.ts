import { Router } from 'express';
import { RevivalController } from '../controllers/revival.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All revival routes require authentication
router.use(authMiddleware);

// GET /revival/status - Check if user is dead
router.get('/status', RevivalController.getStatus);

// GET /revival/options - Get available revival options
router.get('/options', RevivalController.getOptions);

// POST /revival/reset - Option A: Total reset
router.post('/reset', RevivalController.resetTotal);

// POST /revival/challenge - Option B: Complete penance challenge
router.post('/challenge', RevivalController.reviveWithChallenge);

export default router;
