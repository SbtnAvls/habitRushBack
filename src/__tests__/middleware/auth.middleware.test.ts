import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { TokenBlacklistModel } from '../../models/token-blacklist.model';
import {
  mockRequest,
  mockResponse,
  mockNext,
  generateAccessToken,
  generateExpiredAccessToken,
} from '../helpers/test-helpers';

// Mock the TokenBlacklistModel
jest.mock('../../models/token-blacklist.model');

describe('Auth Middleware', () => {
  let req: any;
  let res: any;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockRequest();
    res = mockResponse();
    next = mockNext();
  });

  describe('authMiddleware', () => {
    it('should allow request with valid token', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(false);

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userId);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 401 if no token provided', async () => {
      req.headers = {};

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'No token provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header is malformed', async () => {
      req.headers = {
        authorization: 'InvalidFormat',
      };

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'No token provided',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', async () => {
      req.headers = {
        authorization: 'Bearer invalid-token',
      };

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is expired', async () => {
      const userId = 'user-123';
      const expiredToken = generateExpiredAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is blacklisted', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(true);

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Token has been revoked',
      });
      expect(next).not.toHaveBeenCalled();
      expect(TokenBlacklistModel.isBlacklisted).toHaveBeenCalledWith(token);
    });

    it('should check blacklist after verifying token signature', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(false);

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(TokenBlacklistModel.isBlacklisted).toHaveBeenCalledWith(token);
      expect(next).toHaveBeenCalled();
    });

    it('should attach decoded user data to request', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(false);

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userId);
      expect(req.user.iat).toBeDefined(); // issued at
      expect(req.user.exp).toBeDefined(); // expiration
    });

    it('should handle database errors gracefully', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await authMiddleware(req as Request, res as unknown as Response, next);

      // Should return 401 on any error
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should extract token correctly from Bearer scheme', async () => {
      const userId = 'user-123';
      const token = generateAccessToken(userId);

      req.headers = {
        authorization: `Bearer ${token}`,
      };

      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(false);

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(TokenBlacklistModel.isBlacklisted).toHaveBeenCalledWith(token);
      expect(next).toHaveBeenCalled();
    });

    it('should reject token with wrong secret', async () => {
      const userId = 'user-123';
      // Generate token with different secret
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign({ id: userId }, 'wrong-secret', { expiresIn: '15m' });

      req.headers = {
        authorization: `Bearer ${wrongToken}`,
      };

      await authMiddleware(req as Request, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid token',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
