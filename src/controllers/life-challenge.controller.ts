import { Request, Response } from 'express';
import pool from '../db';
import { LifeChallenge, LifeChallengeModel } from '../models/life-challenge.model';
import { User } from '../models/user.model';
import { RowDataPacket } from 'mysql2';
import {
  getUserLifeChallengeStatuses,
  redeemLifeChallengeWithValidation
} from '../services/life-challenge-evaluation.service';

// GET /api/life-challenges
export const getLifeChallenges = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const withStatus = req.query.withStatus === 'true';

    if (withStatus) {
      // Retornar con estados (pendiente/obtenido/redimido)
      const statuses = await getUserLifeChallengeStatuses(userId);
      res.json(statuses);
    } else {
      // Retornar lista simple como antes
      const rows = await LifeChallengeModel.getAllActive();
      res.json(rows);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching life challenges' });
  }
};

// POST /api/life-challenges/:id/redeem
export const redeemLifeChallenge = async (req: Request, res: Response) => {
  const { id: lifeChallengeId } = req.params;
  const userId = (req as any).user.id;

  try {
    // Usar el nuevo servicio con validación
    const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

    if (result.success) {
      res.status(200).json({
        message: result.message,
        livesGained: result.livesGained,
        success: true
      });
    } else {
      res.status(400).json({
        message: result.message,
        success: false
      });
    }
  } catch (error) {
    console.error('Error redeeming life challenge:', error);
    res.status(500).json({
      message: 'Error redeeming life challenge',
      success: false
    });
  }
};

// GET /api/life-challenges/status
export const getLifeChallengeStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const statuses = await getUserLifeChallengeStatuses(userId);
    res.json(statuses);
  } catch (error) {
    console.error('Error getting life challenge statuses:', error);
    res.status(500).json({ message: 'Error fetching life challenge statuses' });
  }
};
