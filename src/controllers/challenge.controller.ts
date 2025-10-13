import { Request, Response } from 'express';
import { ChallengeModel } from '../models/challenge.model';
import { UserChallengeModel } from '../models/user-challenge.model';

export class ChallengeController {

  static async getAllAvailable(req: Request, res: Response) {
    try {
      const challenges = await ChallengeModel.getAllActive();
      res.json(challenges);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error getting available challenges' });
    }
  }

  static async getAssignedToUser(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const userChallenges = await UserChallengeModel.getForUser(userId);
      res.json(userChallenges);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error getting assigned challenges' });
    }
  }

  static async assignToHabit(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { id: challengeId } = req.params;
      const { habitId } = req.body;

      if (!habitId) {
        return res.status(400).json({ message: 'habitId is required' });
      }

      // Here you might want to add more validation, e.g., 
      // - check if the challenge exists
      // - check if the habit belongs to the user
      // - check if the challenge is not already assigned to that habit

      const newUserChallenge = await UserChallengeModel.assign(userId, challengeId, habitId);
      res.status(201).json(newUserChallenge);
    } catch (error) {
      console.error(error);
      // Catch potential duplicate entry errors from the DB
      if ((error as any).code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Challenge already assigned to this habit.' });
      }
      res.status(500).json({ message: 'Error assigning challenge' });
    }
  }

  static async updateUserChallengeStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { id: userChallengeId } = req.params;
      const { status } = req.body;

      if (!status || (status !== 'completed' && status !== 'discarded')) {
        return res.status(400).json({ message: 'Invalid status provided. Must be \'completed\' or \'discarded\'.' });
      }

      const updatedChallenge = await UserChallengeModel.updateStatus(userChallengeId, userId, status);

      if (!updatedChallenge) {
        return res.status(404).json({ message: 'User challenge not found or permission denied.' });
      }

      res.json(updatedChallenge);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error updating user challenge status' });
    }
  }
}
