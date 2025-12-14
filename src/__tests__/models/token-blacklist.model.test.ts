import { TokenBlacklistModel } from '../../models/token-blacklist.model';
import pool from '../../db';

// Mock the database pool
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

describe('TokenBlacklistModel', () => {
  const mockPool = pool as jest.Mocked<typeof pool>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new blacklist entry', async () => {
      const tokenData = {
        token: 'access-token-abc',
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      const result = await TokenBlacklistModel.create(tokenData);

      expect(result).toMatchObject({
        token: tokenData.token,
        user_id: tokenData.user_id,
        expires_at: tokenData.expires_at,
      });
      expect(result.id).toBeDefined();
      expect(result.blacklisted_at).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO TOKEN_BLACKLIST SET ?',
        expect.objectContaining({
          token: tokenData.token,
          user_id: tokenData.user_id,
        }),
      );
    });

    it('should generate a unique id for each entry', async () => {
      const tokenData = {
        token: 'access-token-abc',
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      const result1 = await TokenBlacklistModel.create(tokenData);
      const result2 = await TokenBlacklistModel.create({
        ...tokenData,
        token: 'different-token',
      });

      expect(result1.id).not.toBe(result2.id);
    });

    it('should set blacklisted_at timestamp automatically', async () => {
      const tokenData = {
        token: 'access-token-abc',
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      };

      mockPool.query.mockResolvedValue([{ affectedRows: 1 }] as any);

      const beforeCreate = new Date();
      const result = await TokenBlacklistModel.create(tokenData);
      const afterCreate = new Date();

      expect(result.blacklisted_at).toBeDefined();
      expect(result.blacklisted_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(result.blacklisted_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });

  describe('isBlacklisted', () => {
    it('should return true if token is blacklisted', async () => {
      const token = 'blacklisted-token';

      mockPool.query.mockResolvedValue([[{ count: 1 }]] as any);

      const result = await TokenBlacklistModel.isBlacklisted(token);

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM TOKEN_BLACKLIST WHERE token = ? AND expires_at > NOW()',
        [token],
      );
    });

    it('should return false if token is not blacklisted', async () => {
      const token = 'valid-token';

      mockPool.query.mockResolvedValue([[{ count: 0 }]] as any);

      const result = await TokenBlacklistModel.isBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should only check non-expired blacklist entries', async () => {
      const token = 'some-token';

      mockPool.query.mockResolvedValue([[{ count: 0 }]] as any);

      await TokenBlacklistModel.isBlacklisted(token);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('expires_at > NOW()'), [token]);
    });

    it('should return false for expired blacklist entries', async () => {
      const token = 'expired-blacklisted-token';

      // Expired entries are filtered out by the query
      mockPool.query.mockResolvedValue([[{ count: 0 }]] as any);

      const result = await TokenBlacklistModel.isBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should handle multiple blacklist entries for same token', async () => {
      const token = 'duplicate-token';

      // Even if there are multiple entries, count > 0 means it's blacklisted
      mockPool.query.mockResolvedValue([[{ count: 3 }]] as any);

      const result = await TokenBlacklistModel.isBlacklisted(token);

      expect(result).toBe(true);
    });
  });

  describe('deleteExpired', () => {
    it('should delete all expired blacklist entries', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 10 }] as any);

      await TokenBlacklistModel.deleteExpired();

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM TOKEN_BLACKLIST WHERE expires_at <= NOW()');
    });

    it('should not throw error if no expired entries exist', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 0 }] as any);

      await expect(TokenBlacklistModel.deleteExpired()).resolves.not.toThrow();
    });

    it('should delete entries that have just expired', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 5 }] as any);

      await TokenBlacklistModel.deleteExpired();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('expires_at <= NOW()'));
    });
  });

  describe('deleteByUserId', () => {
    it('should delete all blacklist entries for a user', async () => {
      const userId = 'user-123';

      mockPool.query.mockResolvedValue([{ affectedRows: 5 }] as any);

      await TokenBlacklistModel.deleteByUserId(userId);

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM TOKEN_BLACKLIST WHERE user_id = ?', [userId]);
    });

    it('should not throw error if user has no blacklisted tokens', async () => {
      mockPool.query.mockResolvedValue([{ affectedRows: 0 }] as any);

      await expect(TokenBlacklistModel.deleteByUserId('user-with-no-blacklist')).resolves.not.toThrow();
    });

    it('should delete both expired and non-expired entries for user', async () => {
      const userId = 'user-123';

      mockPool.query.mockResolvedValue([{ affectedRows: 10 }] as any);

      await TokenBlacklistModel.deleteByUserId(userId);

      // Should not filter by expires_at when deleting by user
      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM TOKEN_BLACKLIST WHERE user_id = ?', [userId]);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle logout flow correctly', async () => {
      const token = 'user-access-token';
      const userId = 'user-123';
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Create blacklist entry
      mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }] as any);
      await TokenBlacklistModel.create({
        token,
        user_id: userId,
        expires_at: expiresAt,
      });

      // Check if blacklisted
      mockPool.query.mockResolvedValueOnce([[{ count: 1 }]] as any);
      const isBlacklisted = await TokenBlacklistModel.isBlacklisted(token);

      expect(isBlacklisted).toBe(true);
    });

    it('should allow cleanup of old blacklist entries', async () => {
      // Delete expired entries
      mockPool.query.mockResolvedValue([{ affectedRows: 100 }] as any);

      await TokenBlacklistModel.deleteExpired();

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM TOKEN_BLACKLIST WHERE expires_at <= NOW()');
    });

    it('should handle user deletion cleanup', async () => {
      const userId = 'deleted-user';

      // Delete all tokens for user
      mockPool.query.mockResolvedValue([{ affectedRows: 15 }] as any);

      await TokenBlacklistModel.deleteByUserId(userId);

      expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM TOKEN_BLACKLIST WHERE user_id = ?', [userId]);
    });
  });
});
