import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { completionModifyLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.use(authMiddleware);

// Corresponds to DELETE /api/images/:id
// MEDIUM FIX: Added UUID validation and rate limiting
router.delete('/:id', completionModifyLimiter, validateIdParam, HabitCompletionController.deleteImage);

export default router;
