import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../../models/user.model';

/**
 * Generate a test user object
 */
export const createTestUser = (overrides?: Partial<User>): User => {
  const defaultUser: User = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'Test User',
    email: 'test@example.com',
    password_hash: bcrypt.hashSync('password123', 10),
    lives: 5,
    max_lives: 5,
    total_habits: 0,
    xp: 0,
    weekly_xp: 0,
    league: 1,
    league_week_start: new Date(),
    theme: 'light',
    font_size: 'medium',
    created_at: new Date(),
    updated_at: new Date(),
  };

  return { ...defaultUser, ...overrides };
};

/**
 * Generate a valid access token for testing
 */
export const generateAccessToken = (userId: string, expiresIn: string | number = '15m'): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as any,
  };
  return jwt.sign({ id: userId }, (process.env.JWT_SECRET || 'test_jwt_secret') as string, options);
};

/**
 * Generate a valid refresh token for testing
 */
export const generateRefreshToken = (userId: string, expiresIn: string | number = '7d'): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as any,
  };
  return jwt.sign(
    { id: userId, type: 'refresh' },
    (process.env.REFRESH_TOKEN_SECRET || 'test_refresh_secret') as string,
    options,
  );
};

/**
 * Generate an expired access token
 */
export const generateExpiredAccessToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: '-1h', // Already expired
  };
  return jwt.sign({ id: userId }, (process.env.JWT_SECRET || 'test_jwt_secret') as string, options);
};

/**
 * Generate an expired refresh token
 */
export const generateExpiredRefreshToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: '-1h',
  };
  return jwt.sign(
    { id: userId, type: 'refresh' },
    (process.env.REFRESH_TOKEN_SECRET || 'test_refresh_secret') as string,
    options,
  );
};

/**
 * Mock request object for Express tests
 */
export const mockRequest = (overrides?: any) => {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    ...overrides,
  };
};

/**
 * Mock response object for Express tests
 */
export const mockResponse = () => {
  const res: any = {
    statusCode: 200,
    data: null,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.data = data;
    return res;
  });
  res.send = jest.fn((data: any) => {
    res.data = data;
    return res;
  });
  return res;
};

/**
 * Mock next function for middleware tests
 */
export const mockNext = () => jest.fn();

/**
 * Wait for a promise to resolve (useful for async tests)
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a test league competitor object
 */
export const createTestCompetitor = (overrides?: any) => {
  return {
    id: 'competitor-uuid-' + Math.random().toString(36).substring(7),
    league_week_id: 1,
    league_id: 1,
    user_id: 'user-' + Math.random().toString(36).substring(7),
    name: 'Test Competitor',
    weekly_xp: 1000,
    position: 10,
    is_real: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
};

/**
 * Generate a test bot competitor (user_id = null, is_real = false)
 */
export const createTestBot = (overrides?: any) => {
  return createTestCompetitor({
    user_id: null,
    is_real: false,
    name: 'Bot_' + Math.random().toString(36).substring(7).toUpperCase(),
    ...overrides,
  });
};

/**
 * Generate a test league object
 */
export const createTestLeague = (leagueId: number = 1) => {
  const leagues = {
    1: { id: 1, name: 'Bronze', colorHex: '#CD7F32', level: 1 },
    2: { id: 2, name: 'Silver', colorHex: '#C0C0C0', level: 2 },
    3: { id: 3, name: 'Gold', colorHex: '#FFD700', level: 3 },
    4: { id: 4, name: 'Diamond', colorHex: '#B9F2FF', level: 4 },
    5: { id: 5, name: 'Master', colorHex: '#E5E4E2', level: 5 },
  };

  return leagues[leagueId as keyof typeof leagues] || leagues[1];
};

/**
 * Generate a test league history entry
 */
export const createTestLeagueHistory = (overrides?: any) => {
  return {
    id: 'history-uuid-' + Math.random().toString(36).substring(7),
    user_id: 'user-123',
    league_id: 1,
    league_week_id: 1,
    weekly_xp: 1500,
    position: 5,
    change_type: 'stayed' as 'promoted' | 'relegated' | 'stayed',
    created_at: new Date().toISOString(),
    ...overrides,
  };
};

/**
 * Generate a full league ranking (20 competitors)
 */
export const createTestLeagueRanking = (userPosition: number = 10, userId: string = 'user-123') => {
  const competitors = [];

  for (let i = 1; i <= 20; i++) {
    const isUser = i === userPosition;
    const isBot = !isUser && Math.random() > 0.5; // Random bots

    competitors.push(
      createTestCompetitor({
        position: i,
        weekly_xp: 2000 - i * 100,
        user_id: isUser ? userId : isBot ? null : 'user-' + i,
        is_real: !isBot,
        name: isUser ? 'Test User' : isBot ? `Bot_${i}` : `Competitor_${i}`,
      }),
    );
  }

  return competitors;
};
