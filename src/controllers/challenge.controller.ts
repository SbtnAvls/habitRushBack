import { Request, Response } from 'express';
import { ChallengeModel } from '../models/challenge.model';
import { UserChallengeModel } from '../models/user-challenge.model';
import { HabitCategoryModel } from '../models/habit-category.model';
import { findHabitById, findHabitByIdForUpdate } from '../models/habit.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { isValidUUID } from '../middleware/uuid-validation.middleware';
import pool from '../db';

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
    const connection = await pool.getConnection();

    try {
      const userId = req.user?.id;
      if (!userId) {
        connection.release();
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const { id: challengeId } = req.params;
      const { habitId } = req.body;

      if (!habitId) {
        connection.release();
        return res.status(400).json({ message: 'habitId is required' });
      }

      // MEDIUM FIX: Validate habitId UUID format from request body
      if (typeof habitId !== 'string' || !isValidUUID(habitId)) {
        connection.release();
        return res.status(400).json({ message: 'habitId has invalid format' });
      }

      // CRITICAL FIX: Use transaction with row locks to prevent TOCTOU race condition
      await connection.beginTransaction();

      // Lock challenge row for update
      const challenge = await ChallengeModel.findByIdForUpdate(challengeId, connection);
      if (!challenge || challenge.is_active === false) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ message: 'Challenge not found or inactive.' });
      }

      // Lock habit row for update
      const habit = await findHabitByIdForUpdate(habitId, userId, connection);
      if (!habit) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ message: 'Habit not found.' });
      }

      const newUserChallenge = await UserChallengeModel.assign(userId, challengeId, habitId, connection);

      await connection.commit();
      connection.release();
      res.status(201).json(newUserChallenge);
    } catch (error) {
      await connection.rollback();
      connection.release();
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

  /**
   * GET /challenges/by-category/:categoryId
   * Get challenges specific to a category (for pending redemptions)
   */
  static async getByCategory(req: AuthRequest, res: Response) {
    try {
      const { categoryId } = req.params;

      // Verify category exists
      const category = await HabitCategoryModel.findById(categoryId);
      if (!category) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      const challenges = await ChallengeModel.getByCategory(categoryId);

      res.json({
        success: true,
        category,
        challenges,
        count: challenges.length,
      });
    } catch (error) {
      // MEDIUM FIX: Sanitize error logging - only log error message, not full stack
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error getting challenges by category:', errorMessage);
      res.status(500).json({ message: 'Error al obtener challenges por categoría' });
    }
  }

  /**
   * GET /challenges/general
   * Get general challenges (for revival penance)
   */
  static async getGeneralChallenges(_req: Request, res: Response) {
    try {
      const challenges = await ChallengeModel.getGeneralChallenges();

      res.json({
        success: true,
        challenges,
        count: challenges.length,
      });
    } catch (error) {
      // MEDIUM FIX: Sanitize error logging - only log error message, not full stack
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error getting general challenges:', errorMessage);
      res.status(500).json({ message: 'Error al obtener challenges generales' });
    }
  }
}
