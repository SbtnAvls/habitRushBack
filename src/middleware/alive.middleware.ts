import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import pool from '../db';
import { RowDataPacket } from 'mysql2';

/**
 * Middleware to check if user is alive (has lives > 0)
 * Returns 403 if user is dead and needs to revive first
 */
export const aliveMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Skip if not authenticated (let auth middleware handle it)
  if (!req.user?.id) {
    return next();
  }

  try {
    const [userRows] = await pool.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [req.user.id]);

    if (userRows.length === 0) {
      return next();
    }

    if (userRows[0].lives === 0) {
      return res.status(403).json({
        message: 'Estás muerto. Debes revivir primero.',
        error_code: 'USER_DEAD',
        is_dead: true,
        revival_url: '/revival/options',
      });
    }

    next();
  } catch (error) {
    console.error('Error in alive middleware:', error);
    next();
  }
};
