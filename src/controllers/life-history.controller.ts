import { Response } from 'express';
import { LifeHistoryModel } from '../models/life-history.model';
import { AuthRequest } from '../middleware/auth.middleware';

// MEDIUM FIX: Pagination constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// GET /api/users/me/life-history
// MEDIUM FIX: Added pagination support with query params ?limit=50&offset=0
export const getLifeHistory = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    // MEDIUM FIX: Parse and validate pagination params
    const limitParam = parseInt(req.query.limit as string, 10);
    const offsetParam = parseInt(req.query.offset as string, 10);

    const limit = !isNaN(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
    const offset = !isNaN(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const [rows, total] = await Promise.all([
      LifeHistoryModel.getForUser(userId, limit, offset),
      LifeHistoryModel.getCountForUser(userId),
    ]);

    res.json({
      data: rows,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + rows.length < total,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error fetching life history' });
  }
};
