import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Corresponds to DELETE /api/images/:id
router.delete('/:id', HabitCompletionController.deleteImage);

export default router;
