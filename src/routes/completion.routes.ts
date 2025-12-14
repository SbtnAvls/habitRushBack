import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Corresponds to PUT /api/completions/:id
router.put('/:id', HabitCompletionController.updateCompletion);

// Corresponds to DELETE /api/completions/:id
router.delete('/:id', HabitCompletionController.deleteCompletion);

// Corresponds to POST /api/completions/:id/images
router.post('/:id/images', HabitCompletionController.addImageToCompletion);

export default router;
