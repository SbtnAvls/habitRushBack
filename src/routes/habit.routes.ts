import express, { Router } from 'express';
import * as habitController from '../controllers/habit.controller';
import { authMiddleware } from '../middleware/auth.middleware';

import habitCompletionRoutes from './habit-completion.routes';

const router: Router = express.Router();

// All habit routes should be protected
router.use(authMiddleware);

router.use('/:habitId/completions', habitCompletionRoutes);

// Get all habits
router.get('/', habitController.getAllHabits);

// Get a single habit by ID
router.get('/:id', habitController.getHabitById);

// Create a new habit
router.post('/', habitController.createHabit);

// Update a habit
router.put('/:id', habitController.updateHabit);

// Deactivate a habit manually (clears progress except notes)
router.post('/:id/deactivate', habitController.deactivateHabit);

// Delete a habit
router.delete('/:id', habitController.deleteHabit);

export default router;
