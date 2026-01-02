import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as authController from '../../controllers/auth.controller';
import { UserModel } from '../../models/user.model';
import { RefreshTokenModel } from '../../models/refresh-token.model';
import { TokenBlacklistModel } from '../../models/token-blacklist.model';
import {
  mockRequest,
  mockResponse,
  createTestUser,
  generateAccessToken,
  generateRefreshToken,
} from '../helpers/test-helpers';

// Mock the models
jest.mock('../../models/user.model');
jest.mock('../../models/refresh-token.model');
jest.mock('../../models/token-blacklist.model');

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      const newUser = createTestUser({
        id: 'new-user-id',
        email: 'john@example.com',
      });

      (UserModel.findByEmail as jest.Mock).mockResolvedValue(undefined);
      (UserModel.create as jest.Mock).mockResolvedValue(newUser);
      (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: 900,
        }),
      );
      expect(RefreshTokenModel.create).toHaveBeenCalled();
    });

    it('should return 400 if name is missing', async () => {
      const req = mockRequest({
        body: {
          email: 'john@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'name, email and password are required',
      });
    });

    it('should return 400 if email is missing', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'name, email and password are required',
      });
    });

    it('should return 400 if password is missing', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'name, email and password are required',
      });
    });

    it('should return 400 if password is too short', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: '12345',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Password must be at least 6 characters long',
      });
    });

    it('should return 400 if user already exists', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      const existingUser = createTestUser();
      (UserModel.findByEmail as jest.Mock).mockResolvedValue(existingUser);

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User already exists',
      });
    });

    it('should return 500 if database error occurs', async () => {
      const req = mockRequest({
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (UserModel.findByEmail as jest.Mock).mockRejectedValue(new Error('Database error'));

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
      });
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password,
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      const user = createTestUser({
        email: 'test@example.com',
        password_hash: hashedPassword,
      });

      (UserModel.findByEmail as jest.Mock).mockResolvedValue(user);
      (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: 900,
        }),
      );
      expect(RefreshTokenModel.create).toHaveBeenCalled();
    });

    it('should return 400 if email is missing', async () => {
      const req = mockRequest({
        body: {
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'email and password are required',
      });
    });

    it('should return 400 if password is missing', async () => {
      const req = mockRequest({
        body: {
          email: 'test@example.com',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'email and password are required',
      });
    });

    it('should return 400 if user does not exist', async () => {
      const req = mockRequest({
        body: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (UserModel.findByEmail as jest.Mock).mockResolvedValue(undefined);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid credentials',
      });
    });

    it('should return 400 if password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);

      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      const user = createTestUser({
        password_hash: hashedPassword,
      });

      (UserModel.findByEmail as jest.Mock).mockResolvedValue(user);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid credentials',
      });
    });

    it('should return 500 if database error occurs', async () => {
      const req = mockRequest({
        body: {
          email: 'test@example.com',
          password: 'password123',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (UserModel.findByEmail as jest.Mock).mockRejectedValue(new Error('Database error'));

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
      });
    });
  });

  describe('refresh', () => {
    it('should refresh tokens successfully with valid refresh token', async () => {
      const userId = 'user-123';
      const refreshToken = generateRefreshToken(userId);

      const req = mockRequest({
        body: { refreshToken },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (RefreshTokenModel.findByToken as jest.Mock).mockResolvedValue({
        user_id: userId,
        token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(false);
      (RefreshTokenModel.deleteByToken as jest.Mock).mockResolvedValue(undefined);
      (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});

      await authController.refresh(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          expiresIn: 900,
        }),
      );
      expect(RefreshTokenModel.deleteByToken).toHaveBeenCalledWith(refreshToken);
      expect(RefreshTokenModel.create).toHaveBeenCalled();
    });

    it('should return 400 if refresh token is missing', async () => {
      const req = mockRequest({
        body: {},
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await authController.refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh token is required',
      });
    });

    it('should return 401 if refresh token not found in database', async () => {
      const req = mockRequest({
        body: { refreshToken: 'invalid-token' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (RefreshTokenModel.findByToken as jest.Mock).mockResolvedValue(undefined);

      await authController.refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired refresh token',
      });
    });

    it('should return 401 if refresh token is expired', async () => {
      const userId = 'user-123';
      const expiredToken = jwt.sign(
        { id: userId, type: 'refresh' },
        process.env.REFRESH_TOKEN_SECRET || 'test_refresh_secret',
        { expiresIn: '-1h' },
      );

      const req = mockRequest({
        body: { refreshToken: expiredToken },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (RefreshTokenModel.findByToken as jest.Mock).mockResolvedValue({
        user_id: userId,
        token: expiredToken,
      });
      (RefreshTokenModel.deleteByToken as jest.Mock).mockResolvedValue(undefined);

      await authController.refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired refresh token',
      });
      expect(RefreshTokenModel.deleteByToken).toHaveBeenCalledWith(expiredToken);
    });

    it('should return 401 if token is blacklisted', async () => {
      const userId = 'user-123';
      const refreshToken = generateRefreshToken(userId);

      const req = mockRequest({
        body: { refreshToken },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (RefreshTokenModel.findByToken as jest.Mock).mockResolvedValue({
        user_id: userId,
        token: refreshToken,
      });
      (TokenBlacklistModel.isBlacklisted as jest.Mock).mockResolvedValue(true);
      (RefreshTokenModel.deleteByToken as jest.Mock).mockResolvedValue(undefined);

      await authController.refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Token has been revoked',
      });
    });

    it('should return 401 if token type is not refresh', async () => {
      const userId = 'user-123';
      const accessToken = generateAccessToken(userId);

      const req = mockRequest({
        body: { refreshToken: accessToken },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      // Access tokens wouldn't be in the refresh tokens table, so return undefined
      (RefreshTokenModel.findByToken as jest.Mock).mockResolvedValue(undefined);

      await authController.refresh(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired refresh token',
      });
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user successfully', async () => {
      const userId = 'user-123';
      const user = createTestUser({ id: userId });

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (UserModel.findById as jest.Mock).mockResolvedValue(user);

      await authController.getCurrentUser(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          email: user.email,
        }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.not.objectContaining({
          password_hash: expect.anything(),
        }),
      );
    });

    it('should return 401 if user not authenticated', async () => {
      const req = mockRequest() as any;
      const res = mockResponse() as unknown as Response;

      await authController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authenticated',
      });
    });

    it('should return 404 if user not found', async () => {
      const req = mockRequest({
        user: { id: 'nonexistent-user' },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (UserModel.findById as jest.Mock).mockResolvedValue(undefined);

      await authController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User not found',
      });
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const userId = 'user-123';
      const accessToken = generateAccessToken(userId);
      const refreshToken = generateRefreshToken(userId);

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: { refreshToken },
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (TokenBlacklistModel.create as jest.Mock).mockResolvedValue({});
      (RefreshTokenModel.deleteByToken as jest.Mock).mockResolvedValue(undefined);

      await authController.logout(req, res);

      expect(TokenBlacklistModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: accessToken,
          user_id: userId,
        }),
      );
      expect(RefreshTokenModel.deleteByToken).toHaveBeenCalledWith(refreshToken);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Successfully logged out',
      });
    });

    it('should return 401 if user not authenticated', async () => {
      const req = mockRequest({
        body: { refreshToken: 'some-token' },
      }) as any;
      const res = mockResponse() as unknown as Response;

      await authController.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authenticated',
      });
    });

    it('should still logout if only access token provided', async () => {
      const userId = 'user-123';
      const accessToken = generateAccessToken(userId);

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: {},
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (TokenBlacklistModel.create as jest.Mock).mockResolvedValue({});

      await authController.logout(req, res);

      expect(TokenBlacklistModel.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: 'Successfully logged out',
      });
    });

    it('should return 500 if database error occurs', async () => {
      const userId = 'user-123';
      const accessToken = generateAccessToken(userId);

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: {},
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (TokenBlacklistModel.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      await authController.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Server error',
      });
    });
  });
});
