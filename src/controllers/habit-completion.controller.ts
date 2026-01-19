import { Response } from 'express';
import { HabitCompletion, HabitCompletionRecord } from '../models/habit-completion.model';
import { CompletionImage } from '../models/completion-image.model';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { evaluateLifeChallenges } from '../services/life-challenge-evaluation.service';
import { calculateAndUpdateStreak } from '../services/streak-calculation.service';
import { grantHabitCompletionXp, checkAndGrantDailyBonus } from '../services/xp.service';
import { AuthRequest } from '../middleware/auth.middleware';

// MEDIUM FIX: Date format validation for habit completions
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate date string format (YYYY-MM-DD) and check it's a real date
 */
function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    return false;
  }

  const [year, month, day] = dateStr.split('-').map(Number);

  // Check basic ranges
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // Check days in month
  const maxDays = new Date(year, month, 0).getDate();
  if (day > maxDays) {
    return false;
  }

  return true;
}

export class HabitCompletionController {
  static async getCompletionsForHabit(req: AuthRequest, res: Response) {
    try {
      const { habitId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const completions = await HabitCompletion.getForHabit(userId, habitId);
      res.json(completions);
    } catch (_error) {
      res.status(500).json({ message: 'Error getting habit completions' });
    }
  }

  static async createOrUpdateCompletion(req: AuthRequest, res: Response) {
    try {
      const { habitId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Check if habit has an active pending redemption (blocked)
      const hasPending = await PendingRedemptionModel.hasActivePending(habitId, userId);
      if (hasPending) {
        return res.status(403).json({
          message:
            'Este hábito está bloqueado porque tienes una redención pendiente. Debes decidir si perder una vida o completar un challenge antes de poder registrar progreso.',
          error_code: 'HABIT_BLOCKED_PENDING_REDEMPTION',
        });
      }

      const { date, completed, progress_type } = req.body;
      if (!date || typeof completed === 'undefined' || !progress_type) {
        return res.status(400).json({ message: 'date, completed and progress_type are required fields.' });
      }

      // MEDIUM FIX: Validate date format (YYYY-MM-DD)
      if (!isValidDateString(date)) {
        return res.status(400).json({
          message: 'Invalid date format. Expected YYYY-MM-DD (e.g., 2024-01-15)',
          error_code: 'INVALID_DATE_FORMAT',
        });
      }

      // Check if this habit was already completed for this date (to prevent XP farming)
      const wasAlreadyCompleted = completed
        ? await HabitCompletion.wasAlreadyCompleted(habitId, userId, date)
        : false;

      const completion: HabitCompletionRecord & {
        current_streak?: number;
        new_life_challenges_obtained?: unknown[];
        xp_gained?: number;
        daily_bonus_xp?: number;
      } = await HabitCompletion.createOrUpdate({
        ...req.body,
        habit_id: habitId,
        user_id: userId,
      });

      // Calcular y actualizar el streak actual del hábito
      let currentStreak = 0;
      try {
        currentStreak = await calculateAndUpdateStreak(habitId, userId);
        completion.current_streak = currentStreak;
      } catch (_streakError) {
        // No fallar la operación principal si falla el cálculo del streak
      }

      // Otorgar XP solo si el hábito fue completado Y no estaba ya completado antes
      // Esto previene XP farming al re-enviar completions
      if (completed && !wasAlreadyCompleted) {
        try {
          const xpGained = await grantHabitCompletionXp(userId, currentStreak);
          completion.xp_gained = xpGained;

          // Check and grant daily bonus if all habits are completed
          const dailyBonus = await checkAndGrantDailyBonus(userId, date);
          if (dailyBonus > 0) {
            completion.daily_bonus_xp = dailyBonus;
          }
        } catch (xpError) {
          // No fallar la operación principal si falla el otorgamiento de XP
          console.error('Error granting XP for habit completion:', xpError);
        }
      }

      // Evaluar Life Challenges automáticamente después de completar un hábito
      if (completed === 1) {
        try {
          const lifeChallengeStatuses = await evaluateLifeChallenges(userId);

          // Agregar información sobre challenges obtenidos a la respuesta
          const newlyObtained = lifeChallengeStatuses.filter(lc => lc.status === 'obtained' && lc.can_redeem);
          if (newlyObtained.length > 0) {
            completion.new_life_challenges_obtained = newlyObtained;
          }
        } catch (_evalError) {
          // No fallar la operación principal si falla la evaluación de challenges
        }
      }

      res.status(201).json(completion);
    } catch (_error) {
      res.status(500).json({ message: 'Error creating or updating habit completion' });
    }
  }

  static async updateCompletion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      if (!Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
        return res.status(400).json({ message: 'notes field is required to update a habit completion.' });
      }

      // MEDIUM FIX: Validate notes length to prevent excessive data storage
      const NOTES_MAX_LENGTH = 2000;
      const { notes } = req.body;
      if (notes !== null && notes !== undefined) {
        if (typeof notes !== 'string') {
          return res.status(400).json({ message: 'notes must be a string or null' });
        }
        if (notes.length > NOTES_MAX_LENGTH) {
          return res.status(400).json({
            message: `notes cannot exceed ${NOTES_MAX_LENGTH} characters`,
          });
        }
      }

      const completion = await HabitCompletion.update(id, userId, req.body);
      if (!completion) {
        return res.status(404).json({ message: 'Habit completion not found' });
      }
      res.json(completion);
    } catch (_error) {
      res.status(500).json({ message: 'Error updating habit completion' });
    }
  }

  static async deleteCompletion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Obtener la completion antes de eliminarla para saber el habit_id
      const completion = await HabitCompletion.getById(id, userId);
      if (!completion) {
        return res.status(404).json({ message: 'Habit completion not found' });
      }

      const habitId = completion.habit_id;

      const success = await HabitCompletion.delete(id, userId);
      if (!success) {
        return res.status(404).json({ message: 'Habit completion not found' });
      }

      // Recalcular el streak después de eliminar la completion
      try {
        await calculateAndUpdateStreak(habitId, userId);
      } catch (_streakError) {
        // Continue even if streak calculation fails
      }

      res.status(204).send();
    } catch (_error) {
      res.status(500).json({ message: 'Error deleting habit completion' });
    }
  }

  static async addImageToCompletion(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // HIGH FIX: Validate imageUrl format and size
      const MAX_URL_LENGTH = 5 * 1024 * 1024; // 5MB for base64
      const VALID_IMAGE_PREFIXES = ['data:image/jpeg', 'data:image/png', 'data:image/jpg', 'data:image/gif', 'data:image/webp', 'http://', 'https://'];

      const { imageUrl, thumbnailUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ message: 'imageUrl is required.' });
      }

      if (typeof imageUrl !== 'string') {
        return res.status(400).json({ message: 'imageUrl must be a string.' });
      }

      if (imageUrl.length > MAX_URL_LENGTH) {
        return res.status(400).json({ message: 'Image is too large. Maximum 5MB.' });
      }

      const isValidUrl = VALID_IMAGE_PREFIXES.some(prefix => imageUrl.startsWith(prefix));
      if (!isValidUrl) {
        return res.status(400).json({ message: 'Invalid imageUrl format. Use a valid URL or base64 image.' });
      }

      // Validate thumbnailUrl if provided
      if (thumbnailUrl !== undefined && thumbnailUrl !== null) {
        if (typeof thumbnailUrl !== 'string') {
          return res.status(400).json({ message: 'thumbnailUrl must be a string.' });
        }
        if (thumbnailUrl.length > MAX_URL_LENGTH) {
          return res.status(400).json({ message: 'Thumbnail is too large.' });
        }
        const isValidThumbnail = VALID_IMAGE_PREFIXES.some(prefix => thumbnailUrl.startsWith(prefix));
        if (!isValidThumbnail) {
          return res.status(400).json({ message: 'Invalid thumbnailUrl format.' });
        }
      }

      const image = await CompletionImage.create(id, userId, imageUrl, thumbnailUrl);
      res.status(201).json(image);
    } catch (_error) {
      res.status(500).json({ message: 'Error adding image to completion' });
    }
  }

  static async deleteImage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const success = await CompletionImage.delete(id, userId);
      if (!success) {
        return res.status(404).json({ message: 'Image not found' });
      }
      res.status(204).send();
    } catch (_error) {
      res.status(500).json({ message: 'Error deleting image' });
    }
  }
}
