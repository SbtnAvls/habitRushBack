import { Request, Response } from 'express';
import { HabitCompletion } from '../models/habit-completion.model';
import { CompletionImage } from '../models/completion-image.model';

export class HabitCompletionController {
  static async getCompletionsForHabit(req: Request, res: Response) {
    try {
      const { habitId } = req.params;
      const userId = (req as any).user.id;
      const completions = await HabitCompletion.getForHabit(userId, habitId);
      res.json(completions);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error getting habit completions' });
    }
  }

  static async createOrUpdateCompletion(req: Request, res: Response) {
    try {
      const { habitId } = req.params;
      const userId = (req as any).user.id;

      const { date, completed, progress_type } = req.body;
      if (!date || typeof completed === 'undefined' || !progress_type) {
        return res.status(400).json({ message: 'date, completed and progress_type are required fields.' });
      }

      const completion = await HabitCompletion.createOrUpdate({
        ...req.body,
        habit_id: habitId,
        user_id: userId,
      });
      res.status(201).json(completion);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error creating or updating habit completion' });
    }
  }

  static async updateCompletion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;

      if (!Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
        return res.status(400).json({ message: 'notes field is required to update a habit completion.' });
      }

      const completion = await HabitCompletion.update(id, userId, req.body);
      if (!completion) {
        return res.status(404).json({ message: 'Habit completion not found' });
      }
      res.json(completion);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error updating habit completion' });
    }
  }

  static async deleteCompletion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const success = await HabitCompletion.delete(id, userId);
      if (!success) {
        return res.status(404).json({ message: 'Habit completion not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error deleting habit completion' });
    }
  }

  static async addImageToCompletion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      // Assuming image URL is in the body and there's a service to handle upload
      const { imageUrl, thumbnailUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ message: 'imageUrl is required.' });
      }
      const image = await CompletionImage.create(id, userId, imageUrl, thumbnailUrl);
      res.status(201).json(image);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error adding image to completion' });
    }
  }

  static async deleteImage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const success = await CompletionImage.delete(id, userId);
      if (!success) {
        return res.status(404).json({ message: 'Image not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error deleting image' });
    }
  }
}
