import { RefreshTokenModel, RefreshToken } from '../../models/refresh-token.model';
import pool from '../../db';

// Mock the database pool
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

describe('RefreshTokenModel', () => {
  const mockPool = pool as jest.Mocked<typeof pool>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new refresh token', async () => {
      const tokenData = {
        user_id: 'user-123',
        token: 'refresh-token-abc',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      const result = await RefreshTokenModel.create(tokenData);

      expect(result).toMatchObject({
        user_id: tokenData.user_id,
        token: tokenData.token,
        expires_at: tokenData.expires_at,
      });
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO REFRESH_TOKENS SET ?',
        expect.objectContaining({
          user_id: tokenData.user_id,
          token: tokenData.token,
        }),
      );
    });

    it('should generate a unique id for each token', async () => {
      const tokenData = {
        user_id: 'user-123',
        token: 'refresh-token-abc',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      const result1 = await RefreshTokenModel.create(tokenData);
      const result2 = await RefreshTokenModel.create(tokenData);

      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('findByToken', () => {
    it('should find a refresh token by token string', async () => {
      const token = 'refresh-token-abc';
      const mockToken: RefreshToken = {
        id: 'token-id-123',
        user_id: 'user-123',
        token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValue([[mockToken]] as any);

      const result = await RefreshTokenModel.findByToken(token);

      expect(result).toEqual(mockToken);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM REFRESH_TOKENS WHERE token = ? AND expires_at > NOW()',
        [token],
      );
    });

    it('should return undefined if token not found', async () => {
      mockPool.query.mockResolvedValue([[]] as any);

      const result = await RefreshTokenModel.findByToken('nonexistent-token');

      expect(result).toBeUndefined();
    });

    it('should return undefined if token is expired', async () => {
      // The query filters by expires_at > NOW(), so expired tokens won't be returned
      mockPool.query.mockResolvedValue([[]] as any);

      const result = await RefreshTokenModel.findByToken('expired-token');

      expect(result).toBeUndefined();
    });
  });

  describe('findByUserId', () => {
    it('should find all refresh tokens for a user', async () => {
      const userId = 'user-123';
      const mockTokens: RefreshToken[] = [
        {
          id: 'token-1',
          user_id: userId,
          token: 'token-abc',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
        },
        {
          id: 'token-2',
          user_id: userId,
          token: 'token-def',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue([mockTokens] as any);

      const result = await RefreshTokenModel.findByUserId(userId);

      expect(result).toEqual(mockTokens);
      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM REFRESH_TOKENS WHERE user_id = ? AND expires_at > NOW()',
        [userId],
      );
    });

    it('should return empty array if no tokens found', async () => {
      mockPool.query.mockResolvedValue([[]] as any);

      const result = await RefreshTokenModel.findByUserId('user-with-no-tokens');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should only return non-expired tokens', async () => {
      const userId = 'user-123';
      const mockTokens: RefreshToken[] = [
        {
          id: 'token-1',
          user_id: userId,
          token: 'token-abc',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue([mockTokens] as any);

      await RefreshTokenModel.findByUserId(userId);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('expires_at > NOW()'), [userId]);
    });
  });

  describe('deleteByToken', () => {
    it('should delete a token by token string', async () => {
      const token = 'refresh-token-abc';

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      await RefreshTokenModel.deleteByToken(token);

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM REFRESH_TOKENS WHERE token = ?', [token]);
    });

    it('should not throw error if token does not exist', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 0 }] as any);

      await expect(RefreshTokenModel.deleteByToken('nonexistent-token')).resolves.not.toThrow();
    });
  });

  describe('deleteByUserId', () => {
    it('should delete all tokens for a user', async () => {
      const userId = 'user-123';

      mockPool.query.mockResolvedValue([{ affectedRows: 3 }] as any);

      await RefreshTokenModel.deleteByUserId(userId);

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM REFRESH_TOKENS WHERE user_id = ?', [userId]);
    });

    it('should not throw error if user has no tokens', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 0 }] as any);

      await expect(RefreshTokenModel.deleteByUserId('user-with-no-tokens')).resolves.not.toThrow();
    });
  });

  describe('deleteExpired', () => {
    it('should delete all expired tokens', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 5 }] as any);

      await RefreshTokenModel.deleteExpired();

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM REFRESH_TOKENS WHERE expires_at <= NOW()');
    });

    it('should not throw error if no expired tokens exist', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 0 }] as any);

      await expect(RefreshTokenModel.deleteExpired()).resolves.not.toThrow();
    });
  });
});
