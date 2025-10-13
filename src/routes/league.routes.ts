import { Router } from 'express';
import { getCurrentLeague } from '../controllers/league.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/current', authMiddleware, getCurrentLeague);

export default router;
