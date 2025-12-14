import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// Corresponds to GET /api/habits/:habitId/completions
router.get('/', HabitCompletionController.getCompletionsForHabit);

// Corresponds to POST /api/habits/:habitId/completions
router.post('/', HabitCompletionController.createOrUpdateCompletion);

export default router;
