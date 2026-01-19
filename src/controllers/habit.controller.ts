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
  const {
    name,
    description,
    category_id,
    target_date,
    frequency_type,
    frequency_days_of_week,
    progress_type,
    target_value,
    active_by_user,
  } = req.body;

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

    // Validate target_value based on progress_type
    let validatedTargetValue: number | null = null;

    if (progress_type === 'time' || progress_type === 'count') {
      // For time and count habits, target_value is required
      if (target_value === undefined || target_value === null) {
        return res.status(400).json({
          message: `target_value is required for ${progress_type} habits`,
        });
      }

      const numericValue = Number(target_value);
      if (isNaN(numericValue) || numericValue <= 0) {
        return res.status(400).json({
          message: 'target_value must be a positive number',
        });
      }

      validatedTargetValue = numericValue;
    }
    // For yes_no habits, target_value should be null (ignored if provided)

    // Process frequency_days_of_week: accept both string and array formats
    let processedFrequencyDays: string | undefined;
    if (frequency_days_of_week) {
      processedFrequencyDays = Array.isArray(frequency_days_of_week)
        ? frequency_days_of_week.join(',')
        : String(frequency_days_of_week);
    }

    // Determine active_by_user: default to 1 (active) if not provided
    const userActiveChoice = active_by_user === false || active_by_user === 0 ? 0 : 1;

    const newHabit = await habitModel.createHabit({
      user_id: userId,
      name,
      description,
      category_id: category_id || 'health',
      start_date: new Date(),
      target_date,
      current_streak: 0,
      frequency_type,
      frequency_days_of_week: processedFrequencyDays,
      progress_type,
      target_value: validatedTargetValue,
      is_active: userActiveChoice === 1, // is_active follows active_by_user
      active_by_user: userActiveChoice,
    });
    res.status(201).json(newHabit);
  } catch (error) {
    console.error('[CreateHabit] Error:', error);
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

    // Validate target_value if provided
    if (updates.target_value !== undefined) {
      const effectiveProgressType = updates.progress_type || habit.progress_type;

      if (effectiveProgressType === 'yes_no') {
        // For yes_no habits, target_value should be null
        updates.target_value = null;
      } else {
        // For time and count habits, validate the value
        const numericValue = Number(updates.target_value);
        if (isNaN(numericValue) || numericValue <= 0) {
          return res.status(400).json({
            message: 'target_value must be a positive number',
          });
        }
        updates.target_value = numericValue;
      }
    }

    // If changing progress_type to time/count, require target_value
    if (updates.progress_type && updates.progress_type !== 'yes_no') {
      if (updates.target_value === undefined && !habit.target_value) {
        return res.status(400).json({
          message: `target_value is required when changing to ${updates.progress_type} type`,
        });
      }
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
