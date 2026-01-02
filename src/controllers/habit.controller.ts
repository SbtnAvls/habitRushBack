import { Response } from 'express';
import * as habitModel from '../models/habit.model';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { deactivateHabitManually } from '../services/habit-evaluation.service';
import { AuthRequest } from '../middleware/auth.middleware';

const ALLOWED_FREQUENCY_TYPES = ['daily', 'weekly', 'custom'];
const ALLOWED_PROGRESS_TYPES = ['yes_no', 'time', 'count'];

// Get all habits for the current user
export const getAllHabits = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const habits = await habitModel.findHabitsByUserId(userId);

    // Add is_blocked field to each habit (checks for active pending redemptions)
    const habitsWithBlocked = await Promise.all(
      habits.map(async habit => {
        const isBlocked = await PendingRedemptionModel.hasActivePending(habit.id, userId);
        return { ...habit, is_blocked: isBlocked };
      }),
    );

    res.json(habitsWithBlocked);
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a single habit by ID
export const getHabitById = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const { id } = req.params;
  try {
    const habit = await habitModel.findHabitById(id, userId);
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    // Add is_blocked field (checks for active pending redemption)
    const isBlocked = await PendingRedemptionModel.hasActivePending(id, userId);
    res.json({ ...habit, is_blocked: isBlocked });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new habit
export const createHabit = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const { name, description, category_id, target_date, frequency_type, frequency_days_of_week, progress_type } =
    req.body;

  try {
    if (!name || !frequency_type || !progress_type) {
      return res.status(400).json({ message: 'name, frequency_type and progress_type are required' });
    }

    if (!ALLOWED_FREQUENCY_TYPES.includes(frequency_type)) {
      return res.status(400).json({ message: 'Invalid frequency_type provided' });
    }

    if (!ALLOWED_PROGRESS_TYPES.includes(progress_type)) {
      return res.status(400).json({ message: 'Invalid progress_type provided' });
    }

    const newHabit = await habitModel.createHabit({
      user_id: userId,
      name,
      description,
      category_id: category_id || 'health',
      start_date: new Date(),
      target_date,
      current_streak: 0,
      frequency_type,
      frequency_days_of_week: Array.isArray(frequency_days_of_week) ? frequency_days_of_week.join(',') : undefined,
      progress_type,
      is_active: true,
      active_by_user: 1,
    });
    res.status(201).json(newHabit);
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a habit
export const updateHabit = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const { id } = req.params;
  const updates: Partial<habitModel.Habit> = req.body;

  try {
    const habit = await habitModel.findHabitById(id, userId);
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    // Detectar si se está desactivando el hábito manualmente
    const isDeactivating = habit.active_by_user === 1;

    if (isDeactivating) {
      // Si se está desactivando, usar la función especial que borra el progreso
      await deactivateHabitManually(id, userId);
      return res.status(200).json({
        message: 'Habit deactivated successfully. Progress has been cleared except for notes and images.',
        success: true,
      });
    }

    // Para cualquier otra actualización, continuar normalmente
    if (updates.frequency_days_of_week && Array.isArray(updates.frequency_days_of_week)) {
      updates.frequency_days_of_week = updates.frequency_days_of_week.join(',');
    }

    if (updates.frequency_type && !ALLOWED_FREQUENCY_TYPES.includes(updates.frequency_type)) {
      return res.status(400).json({ message: 'Invalid frequency_type provided' });
    }

    if (updates.progress_type && !ALLOWED_PROGRESS_TYPES.includes(updates.progress_type)) {
      return res.status(400).json({ message: 'Invalid progress_type provided' });
    }

    updates.updated_at = new Date();

    await habitModel.updateHabit(id, userId, updates);
    res.status(200).json({ message: 'Habit updated successfully' });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a habit (soft delete)
export const deleteHabit = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const { id } = req.params;

  try {
    const habit = await habitModel.findHabitById(id, userId);
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    await habitModel.deleteHabit(id, userId);
    res.status(204).send();
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Deactivate a habit manually (clears progress except notes)
export const deactivateHabit = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  const { id } = req.params;
  try {
    const habit = await habitModel.findHabitById(id, userId);
    if (!habit) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    // Desactivar el hábito y borrar su progreso (excepto notas)
    await deactivateHabitManually(id, userId);

    res.status(200).json({
      message: 'Habit deactivated successfully. Progress has been cleared except for notes.',
      success: true,
    });
  } catch (error) {
    console.error('Error deactivating habit:', error);
    res.status(500).json({ message: 'Error deactivating habit', success: false });
  }
};
