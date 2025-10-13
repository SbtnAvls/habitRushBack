import { Request, Response } from 'express';
import pool from '../db';
import { LifeHistory } from '../models/life-history.model';
import { RowDataPacket } from 'mysql2';

// GET /api/users/me/life-history
export const getLifeHistory = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM LIFE_HISTORY WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows as LifeHistory[]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching life history' });
  }
};
