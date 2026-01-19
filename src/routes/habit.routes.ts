import express, { Router } from 'express';
import * as habitController from '../controllers/habit.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { aliveMiddleware } from '../middleware/alive.middleware';
import { validateIdParam, validateUUIDParams } from '../middleware/uuid-validation.middleware';
import { dataFetchLimiter, completionModifyLimiter } from '../middleware/rate-limit.middleware';

import habitCompletionRoutes from './habit-completion.routes';

const router: Router = express.Router();

// All habit routes should be protected
router.use(authMiddleware);

// MEDIUM FIX: Validate habitId UUID format before passing to completion routes
router.use('/:habitId/completions', validateUUIDParams(['habitId']), habitCompletionRoutes);

// Get all habits
// HIGH FIX: Added rate limiting
router.get('/', dataFetchLimiter, habitController.getAllHabits);

// Get a single habit by ID
// HIGH FIX: Added rate limiting
router.get('/:id', dataFetchLimiter, validateIdParam, habitController.getHabitById);

// Create a new habit (user must be alive)
// HIGH FIX: Added rate limiting
router.post('/', completionModifyLimiter, aliveMiddleware, habitController.createHabit);

// Update a habit
// HIGH FIX: Added rate limiting
router.put('/:id', completionModifyLimiter, validateIdParam, habitController.updateHabit);

// Deactivate a habit manually (clears progress except notes)
// HIGH FIX: Added rate limiting
router.post('/:id/deactivate', completionModifyLimiter, validateIdParam, habitController.deactivateHabit);

// Delete a habit
// HIGH FIX: Added rate limiting
router.delete('/:id', completionModifyLimiter, validateIdParam, habitController.deleteHabit);

export default router;
