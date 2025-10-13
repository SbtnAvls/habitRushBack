import { Request, Response } from 'express';
import { LifeHistoryModel } from '../models/life-history.model';

// GET /api/users/me/life-history
export const getLifeHistory = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  try {
    const rows = await LifeHistoryModel.getForUser(userId);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching life history' });
  }
};
