import { Router } from 'express';
import { getCurrentLeague } from '../controllers/league.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { dataFetchLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// CRITICAL FIX: Added rate limiting to prevent API abuse
router.get('/current', authMiddleware, dataFetchLimiter, getCurrentLeague);

export default router;
