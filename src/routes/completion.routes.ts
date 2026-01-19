import { Router } from 'express';
import { HabitCompletionController } from '../controllers/habit-completion.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { completionModifyLimiter } from '../middleware/rate-limit.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';

const router = Router();

router.use(authMiddleware);

// Corresponds to PUT /api/completions/:id
// CRITICAL FIX: Added rate limiting and UUID validation
router.put('/:id', completionModifyLimiter, validateIdParam, HabitCompletionController.updateCompletion);

// Corresponds to DELETE /api/completions/:id
// CRITICAL FIX: Added rate limiting and UUID validation
router.delete('/:id', completionModifyLimiter, validateIdParam, HabitCompletionController.deleteCompletion);

// Corresponds to POST /api/completions/:id/images
// CRITICAL FIX: Added rate limiting and UUID validation
router.post('/:id/images', completionModifyLimiter, validateIdParam, HabitCompletionController.addImageToCompletion);

export default router;
