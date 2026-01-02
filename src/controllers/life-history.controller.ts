import { Response } from 'express';
import { LifeHistoryModel } from '../models/life-history.model';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /api/users/me/life-history
export const getLifeHistory = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const rows = await LifeHistoryModel.getForUser(userId);
    res.json(rows);
  } catch (_error) {
    res.status(500).json({ message: 'Error fetching life history' });
  }
};
