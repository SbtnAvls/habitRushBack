import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenBlacklistModel } from '../models/token-blacklist.model';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // Verify token signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklistModel.isBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
