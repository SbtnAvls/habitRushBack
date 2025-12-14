import { Response } from 'express';
import { HabitCompletion, HabitCompletionRecord } from '../models/habit-completion.model';
import { CompletionImage } from '../models/completion-image.model';
import { evaluateLifeChallenges } from '../services/life-challenge-evaluation.service';
import { calculateAndUpdateStreak } from '../services/streak-calculation.service';
import { AuthRequest } from '../middleware/auth.middleware';

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

      const { date, completed, progress_type } = req.body;
      if (!date || typeof completed === 'undefined' || !progress_type) {
        return res.status(400).json({ message: 'date, completed and progress_type are required fields.' });
      }

      const completion: HabitCompletionRecord & { current_streak?: number; new_life_challenges_obtained?: unknown[] } =
        await HabitCompletion.createOrUpdate({
          ...req.body,
          habit_id: habitId,
          user_id: userId,
        });

      // Calcular y actualizar el streak actual del hábito
      try {
        const currentStreak = await calculateAndUpdateStreak(habitId, userId);
        completion.current_streak = currentStreak;
      } catch (_streakError) {
        // No fallar la operación principal si falla el cálculo del streak
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
      // Assuming image URL is in the body and there's a service to handle upload
      const { imageUrl, thumbnailUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ message: 'imageUrl is required.' });
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
