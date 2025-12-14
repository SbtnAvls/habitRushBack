import { Request, Response } from 'express';
import { ChallengeModel } from '../models/challenge.model';
import { UserChallengeModel } from '../models/user-challenge.model';
import { findHabitById } from '../models/habit.model';
import { AuthRequest } from '../middleware/auth.middleware';

export class ChallengeController {
  static async getAllAvailable(_req: Request, res: Response) {
    try {
      const challenges = await ChallengeModel.getAllActive();
      res.json(challenges);
    } catch (_error) {
      res.status(500).json({ message: 'Error getting available challenges' });
    }
  }

  static async getAssignedToUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const userChallenges = await UserChallengeModel.getForUser(userId);
      res.json(userChallenges);
    } catch (_error) {
      res.status(500).json({ message: 'Error getting assigned challenges' });
    }
  }

  static async assignToHabit(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const { id: challengeId } = req.params;
      const { habitId } = req.body;

      if (!habitId) {
        return res.status(400).json({ message: 'habitId is required' });
      }

      const challenge = await ChallengeModel.findById(challengeId);
      if (!challenge || challenge.is_active === false) {
        return res.status(404).json({ message: 'Challenge not found or inactive.' });
      }

      const habit = await findHabitById(habitId, userId);
      if (!habit) {
        return res.status(404).json({ message: 'Habit not found.' });
      }

      const newUserChallenge = await UserChallengeModel.assign(userId, challengeId, habitId);
      res.status(201).json(newUserChallenge);
    } catch (error) {
      // Catch potential duplicate entry errors from the DB
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Challenge already assigned to this habit.' });
      }
      res.status(500).json({ message: 'Error assigning challenge' });
    }
  }

  static async updateUserChallengeStatus(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const { id: userChallengeId } = req.params;
      const { status } = req.body;

      if (!status || (status !== 'completed' && status !== 'discarded')) {
        return res.status(400).json({ message: "Invalid status provided. Must be 'completed' or 'discarded'." });
      }

      const updatedChallenge = await UserChallengeModel.updateStatus(userChallengeId, userId, status);

      if (!updatedChallenge) {
        return res.status(404).json({ message: 'User challenge not found or permission denied.' });
      }

      res.json(updatedChallenge);
    } catch (_error) {
      res.status(500).json({ message: 'Error updating user challenge status' });
    }
  }
}
