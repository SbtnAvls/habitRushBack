import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { UserModel } from '../models/user.model';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { TokenBlacklistModel } from '../models/token-blacklist.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { getJwtSecret, getRefreshTokenSecret } from '../config/secrets';

// Lazy initialization to ensure env vars are loaded
let googleClient: OAuth2Client | null = null;
const getGoogleClient = () => {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
};

// Get all valid Google client IDs (web, android, iOS)
const getGoogleAudiences = (): string[] => {
  const audiences: string[] = [];
  if (process.env.GOOGLE_CLIENT_ID) audiences.push(process.env.GOOGLE_CLIENT_ID);
  if (process.env.GOOGLE_CLIENT_ID_ANDROID) audiences.push(process.env.GOOGLE_CLIENT_ID_ANDROID);
  if (process.env.GOOGLE_CLIENT_ID_IOS) audiences.push(process.env.GOOGLE_CLIENT_ID_IOS);
  return audiences;
};

// MEDIUM FIX: Improved email validation constants
// More restrictive regex that requires:
// - Local part: at least 1 char, allows letters, numbers, dots, hyphens, underscores, plus
// - Domain: at least 2 chars before TLD
// - TLD: 2-10 letters (covers .com, .info, .museum, etc.)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
const EMAIL_MAX_LENGTH = 254; // RFC 5321 limit
const EMAIL_MIN_LENGTH = 5; // Minimum realistic email: a@b.co

function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  if (email.length < EMAIL_MIN_LENGTH || email.length > EMAIL_MAX_LENGTH) return false;
  if (!EMAIL_REGEX.test(email)) return false;

  // Additional checks
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false; // RFC 5321 local part limit
  if (domain.length > 255) return false; // RFC 5321 domain limit
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false; // No consecutive dots

  return true;
}

// MEDIUM FIX: Username validation constants
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function isValidUsername(username: string): { valid: boolean; error?: string } {
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }

  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return { valid: false, error: `Username must be at least ${USERNAME_MIN_LENGTH} characters` };
  }
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return { valid: false, error: `Username cannot exceed ${USERNAME_MAX_LENGTH} characters` };
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }

  return { valid: true };
}

export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'username, email and password are required' });
    }

    // MEDIUM FIX: Validate username format and length
    const usernameValidation = isValidUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ message: usernameValidation.error });
    }

    // MEDIUM FIX: Improved password requirements
    // LOW FIX: Added password complexity requirements
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    if (password.length > 128) {
      return res.status(400).json({ message: 'Password cannot exceed 128 characters' });
    }
    // Check for at least one uppercase, one lowercase, and one number
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      return res.status(400).json({
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      });
    }

    // MEDIUM FIX: Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await UserModel.create({
      username,
      email,
      password_hash,
      lives: 2,
      max_lives: 3,
      total_habits: 0,
      xp: 0,
      weekly_xp: 0,
      league: 1,
      league_week_start: new Date(),
      theme: 'light',
      font_size: 'medium',
    });

    // Generate access token (short-lived)
    const accessToken = jwt.sign({ id: newUser.id }, getJwtSecret(), {
      expiresIn: '15m',
    });

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { id: newUser.id, type: 'refresh' },
      getRefreshTokenSecret(),
      { expiresIn: '7d' },
    );

    // Store refresh token in database
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await RefreshTokenModel.create({
      user_id: newUser.id,
      token: refreshToken,
      expires_at: refreshTokenExpiry,
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    });
  } catch (error) {
    // LOW FIX: Sanitize error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Registration error:', errorMessage);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user registered with Google only
    if (user.password_hash === '__GOOGLE_AUTH__') {
      return res.status(400).json({ message: 'This account uses Google Sign-In. Please login with Google.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate access token (short-lived)
    const accessToken = jwt.sign({ id: user.id }, getJwtSecret(), {
      expiresIn: '15m',
    });

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      getRefreshTokenSecret(),
      { expiresIn: '7d' },
    );

    // Store refresh token in database
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await RefreshTokenModel.create({
      user_id: user.id,
      token: refreshToken,
      expires_at: refreshTokenExpiry,
    });

    res.json({
      token: accessToken, // Alias for frontend compatibility
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin || false,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // Check if refresh token exists in database and is not expired
    const storedToken = await RefreshTokenModel.findByToken(refreshToken);
    if (!storedToken) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Verify refresh token signature and expiration
    // LOW FIX: Added explicit algorithm specification to prevent algorithm confusion attacks
    let decoded: { id: string; type: string };
    try {
      decoded = jwt.verify(refreshToken, getRefreshTokenSecret(), { algorithms: ['HS256'] }) as {
        id: string;
        type: string;
      };
    } catch (_err) {
      // If token is invalid or expired, delete it from database
      await RefreshTokenModel.deleteByToken(refreshToken);
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Verify token type
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklistModel.isBlacklisted(refreshToken);
    if (isBlacklisted) {
      await RefreshTokenModel.deleteByToken(refreshToken);
      return res.status(401).json({ message: 'Token has been revoked' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign({ id: decoded.id }, getJwtSecret(), {
      expiresIn: '15m',
    });

    // Optionally: Rotate refresh token (more secure)
    // Delete old refresh token
    await RefreshTokenModel.deleteByToken(refreshToken);

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { id: decoded.id, type: 'refresh' },
      getRefreshTokenSecret(),
      { expiresIn: '7d' },
    );

    // Store new refresh token
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshTokenModel.create({
      user_id: decoded.id,
      token: newRefreshToken,
      expires_at: refreshTokenExpiry,
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    });
  } catch (error) {
    // LOW FIX: Sanitize error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Refresh token error:', errorMessage);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = user;
    res.json({
      ...userWithoutPassword,
      is_dead: user.lives === 0,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  const accessToken = req.headers.authorization?.split(' ')[1];
  const userId = req.user?.id;

  try {
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Blacklist the access token if provided
    if (accessToken) {
      // Decode to get expiration time
      const decoded = jwt.decode(accessToken) as { exp?: number } | null;
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000);

      await TokenBlacklistModel.create({
        token: accessToken,
        user_id: userId,
        expires_at: expiresAt,
      });
    }

    // Delete the refresh token from database if provided
    if (refreshToken) {
      await RefreshTokenModel.deleteByToken(refreshToken);
    }

    res.json({ message: 'Successfully logged out' });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const googleLogin = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  try {
    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    const audiences = getGoogleAudiences();
    if (audiences.length === 0) {
      console.error('No Google Client IDs configured');
      return res.status(500).json({ message: 'Google authentication not configured' });
    }

    // Verify the Google ID token against all valid audiences (web, android, iOS)
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: audiences,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, email_verified } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Email not provided by Google' });
    }

    // Ensure email is verified by Google
    if (!email_verified) {
      return res.status(400).json({ message: 'Google email is not verified' });
    }

    // Try to find user by Google ID first
    let user = await UserModel.findByGoogleId(googleId);

    if (!user) {
      // Try to find by email (existing user linking their Google account)
      user = await UserModel.findByEmail(email);

      if (user) {
        // Link Google account to existing user
        await UserModel.linkGoogleAccount(user.id, googleId);
      } else {
        // Create new user with Google account
        user = await UserModel.create({
          username: name || email.split('@')[0],
          email,
          password_hash: '__GOOGLE_AUTH__', // Marker for Google-only users
          google_id: googleId,
          lives: 2,
          max_lives: 3,
          total_habits: 0,
          xp: 0,
          weekly_xp: 0,
          league: 1,
          league_week_start: new Date(),
          theme: 'light',
          font_size: 'medium',
        });
      }
    }

    // Generate access token
    const accessToken = jwt.sign({ id: user.id }, getJwtSecret(), {
      expiresIn: '15m',
    });

    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      getRefreshTokenSecret(),
      { expiresIn: '7d' },
    );

    // Store refresh token in database
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshTokenModel.create({
      user_id: user.id,
      token: refreshToken,
      expires_at: refreshTokenExpiry,
    });

    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_admin: user.is_admin || false,
      },
    });
  } catch (error) {
    // CRITICAL FIX: Log specific error for debugging but return generic message to prevent info disclosure
    // LOW FIX: Sanitize error logging to prevent token/sensitive data exposure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Google login error:', errorMessage);

    // Return generic error message to prevent information disclosure about token validation
    res.status(401).json({ message: 'Google authentication failed' });
  }
};
