import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { aliveMiddleware } from '../middleware/alive.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// Corresponds to GET /api/habits/:habitId/completions
router.get('/', HabitCompletionController.getCompletionsForHabit);

// Corresponds to POST /api/habits/:habitId/completions
// User must be alive to register completions
router.post('/', aliveMiddleware, HabitCompletionController.createOrUpdateCompletion);

export default router;
