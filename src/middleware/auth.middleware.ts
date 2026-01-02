import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TokenBlacklistModel } from '../models/token-blacklist.model';

// Extended Request type with user information from JWT
export interface AuthRequest extends Request {
  user?: {
    id: string;
    iat?: number;
    exp?: number;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // Verify token signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret') as {
      id: string;
      iat?: number;
      exp?: number;
    };

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklistModel.isBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    req.user = decoded;
    next();
  } catch (_error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * Admin API Key middleware for internal/admin endpoints
 * Expects header: X-Admin-Key: <key>
 * Key is configured via ADMIN_API_KEY env variable
 */
export const adminKeyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_API_KEY;

  // If no admin key is configured, deny all access (fail secure)
  if (!adminKey) {
    return res.status(503).json({
      message: 'Admin API not configured. Set ADMIN_API_KEY environment variable.',
    });
  }

  const providedKey = req.headers['x-admin-key'] as string;

  if (!providedKey) {
    return res.status(401).json({ message: 'Admin key required' });
  }

  // Constant-time comparison using SHA-256 hashes to prevent timing attacks
  // Hashing ensures both buffers are always 32 bytes, preventing length leaks
  const adminKeyHash = crypto.createHash('sha256').update(adminKey).digest();
  const providedKeyHash = crypto.createHash('sha256').update(providedKey).digest();

  if (!crypto.timingSafeEqual(adminKeyHash, providedKeyHash)) {
    return res.status(403).json({ message: 'Invalid admin key' });
  }

  next();
};
