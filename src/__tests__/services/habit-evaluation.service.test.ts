import pool from '../../db';
import { reviveUser, deactivateHabitManually } from '../../services/habit-evaluation.service';

// Mock del pool de base de datos
jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    getConnection: jest.fn(),
  },
}));

describe('Habit Evaluation Service', () => {
  let mockConnection: any;

  beforeEach(() => {
    // Setup del mock connection
    mockConnection = {
      execute: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };

    (pool.getConnection as jest.Mock).mockResolvedValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('reviveUser', () => {
    const userId = 'user-123';

    it('should restore user to max lives and reactivate habits', async () => {
      // Mock: Obtener max_lives del usuario
      mockConnection.execute
        .mockResolvedValueOnce([[{ max_lives: 2 }]])
        // Mock: UPDATE vidas
        .mockResolvedValueOnce([])
        // Mock: UPDATE reactivar hábitos
        .mockResolvedValueOnce([])
        // Mock: INSERT life history
        .mockResolvedValueOnce([]);

      await reviveUser(userId);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE USERS SET lives = ?'), [
        2,
        userId,
      ]);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE HABITS'),
        expect.arrayContaining([userId]),
      );
    });

    it('should only reactivate habits disabled by no_lives', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await reviveUser(userId);

      // Verificar que el UPDATE de hábitos incluye el filtro de disabled_reason
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining("disabled_reason = 'no_lives'"),
        expect.arrayContaining([userId]),
      );
    });

    it('should create life history entry with user_revived reason', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await reviveUser(userId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO LIFE_HISTORY'),
        expect.arrayContaining([expect.any(String), userId, 2, 2, 'user_revived']),
      );
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Revival failed'));

      await expect(reviveUser(userId)).rejects.toThrow('Revival failed');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await expect(reviveUser(userId)).rejects.toThrow('User not found');
    });
  });

  describe('deactivateHabitManually', () => {
    const habitId = 'habit-123';
    const userId = 'user-123';

    it('should deactivate habit and clear progress except notes', async () => {
      mockConnection.execute
        // Mock: UPDATE desactivar hábito
        .mockResolvedValueOnce([])
        // Mock: UPDATE completamientos con notas (preservar)
        .mockResolvedValueOnce([])
        // Mock: DELETE completamientos sin notas
        .mockResolvedValueOnce([])
        // Mock: UPDATE expirar challenges
        .mockResolvedValueOnce([]);

      await deactivateHabitManually(habitId, userId);

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();

      // Verificar UPDATE del hábito
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE HABITS'),
        expect.arrayContaining([habitId, userId]),
      );

      // Verificar UPDATE de completamientos con notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE HABIT_COMPLETIONS'),
        expect.arrayContaining([habitId, userId]),
      );

      // Verificar DELETE de completamientos sin notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM HABIT_COMPLETIONS'),
        expect.arrayContaining([habitId, userId]),
      );

      // Verificar expiración de challenges
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE USER_CHALLENGES'),
        expect.arrayContaining([habitId, userId]),
      );
    });

    it('should set disabled_reason to manual', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await deactivateHabitManually(habitId, userId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining("disabled_reason = 'manual'"),
        expect.arrayContaining([habitId, userId]),
      );
    });

    it('should preserve notes in completions', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await deactivateHabitManually(habitId, userId);

      // Verificar que el UPDATE preserva registros con notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('notes IS NOT NULL'),
        expect.arrayContaining([habitId, userId]),
      );

      // Verificar que el DELETE solo elimina sin notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('notes IS NULL'),
        expect.arrayContaining([habitId, userId]),
      );
    });

    it('should expire assigned challenges', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await deactivateHabitManually(habitId, userId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'expired'"),
        expect.arrayContaining([habitId, userId]),
      );
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Deactivation failed'));

      await expect(deactivateHabitManually(habitId, userId)).rejects.toThrow('Deactivation failed');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });
  });
});
