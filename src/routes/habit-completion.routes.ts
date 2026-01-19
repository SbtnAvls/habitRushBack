import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { aliveMiddleware } from '../middleware/alive.middleware';
import { dataFetchLimiter, completionModifyLimiter } from '../middleware/rate-limit.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// Corresponds to GET /api/habits/:habitId/completions
// HIGH FIX: Added rate limiting
router.get('/', dataFetchLimiter, HabitCompletionController.getCompletionsForHabit);

// Corresponds to POST /api/habits/:habitId/completions
// User must be alive to register completions
// HIGH FIX: Added rate limiting
router.post('/', completionModifyLimiter, aliveMiddleware, HabitCompletionController.createOrUpdateCompletion);

export default router;
