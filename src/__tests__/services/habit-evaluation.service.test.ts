import pool from '../../db';
import {
  evaluateMissedHabits,
  evaluateAllUsersDailyHabits,
  reviveUser,
  deactivateHabitManually
} from '../../services/habit-evaluation.service';
import { subDays } from 'date-fns';

// Mock del pool de base de datos
jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    getConnection: jest.fn()
  }
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
      release: jest.fn()
    };

    (pool.getConnection as jest.Mock).mockResolvedValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('evaluateMissedHabits', () => {
    const userId = 'user-123';
    const evaluationDate = new Date('2024-01-19');

    it('should evaluate missed habits and reduce lives correctly', async () => {
      // Mock: Hábitos activos programados para hoy
      mockConnection.execute
        .mockResolvedValueOnce([[
          { id: Buffer.from('habit-1'), frequency_type: 'daily', frequency_days: null }
        ]])
        // Mock: No hay completamiento para el hábito
        .mockResolvedValueOnce([[]])
        // Mock: Usuario actual con 2 vidas
        .mockResolvedValueOnce([[{ lives: 2, max_lives: 2 }]])
        // Mock: UPDATE vidas
        .mockResolvedValueOnce([])
        // Mock: INSERT life history
        .mockResolvedValueOnce([]);

      const result = await evaluateMissedHabits(userId, evaluationDate);

      expect(result.missed_habits).toHaveLength(1);
      expect(result.lives_lost).toBe(1);
      expect(result.new_lives_total).toBe(1);
      expect(result.habits_disabled).toHaveLength(0);

      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.rollback).not.toHaveBeenCalled();
    });

    it('should disable all habits when user reaches 0 lives', async () => {
      // Mock: 2 hábitos activos
      mockConnection.execute
        .mockResolvedValueOnce([[
          { id: Buffer.from('habit-1'), frequency_type: 'daily', frequency_days: null },
          { id: Buffer.from('habit-2'), frequency_type: 'daily', frequency_days: null }
        ]])
        // Mock: No completamientos para habit-1
        .mockResolvedValueOnce([[]])
        // Mock: No completamientos para habit-2
        .mockResolvedValueOnce([[]])
        // Mock: Usuario con 2 vidas
        .mockResolvedValueOnce([[{ lives: 2, max_lives: 2 }]])
        // Mock: UPDATE vidas a 0
        .mockResolvedValueOnce([])
        // Mock: INSERT life history habit-1
        .mockResolvedValueOnce([])
        // Mock: INSERT life history habit-2
        .mockResolvedValueOnce([])
        // Mock: SELECT todos los hábitos activos para deshabilitar
        .mockResolvedValueOnce([[
          { id: Buffer.from('habit-1') },
          { id: Buffer.from('habit-2') },
          { id: Buffer.from('habit-3') }
        ]])
        // Mock: UPDATE deshabilitar hábitos
        .mockResolvedValueOnce([]);

      const result = await evaluateMissedHabits(userId, evaluationDate);

      expect(result.lives_lost).toBe(2);
      expect(result.new_lives_total).toBe(0);
      expect(result.habits_disabled).toHaveLength(3); // Todos los hábitos
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should not reduce lives if all habits were completed', async () => {
      // Mock: 1 hábito programado
      mockConnection.execute
        .mockResolvedValueOnce([[
          { id: Buffer.from('habit-1'), frequency_type: 'daily', frequency_days: null }
        ]])
        // Mock: Hábito completado
        .mockResolvedValueOnce([[{ completed: 1 }]]);

      const result = await evaluateMissedHabits(userId, evaluationDate);

      expect(result.missed_habits).toHaveLength(0);
      expect(result.lives_lost).toBe(0);
      expect(result.new_lives_total).toBe(0);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should only evaluate habits scheduled for the specific day (weekly)', async () => {
      const friday = new Date('2024-01-19'); // Friday = day 5

      // Mock: Hábito semanal programado para viernes (day 5)
      mockConnection.execute
        .mockResolvedValueOnce([[
          {
            id: Buffer.from('habit-1'),
            frequency_type: 'weekly',
            frequency_days: JSON.stringify([1, 3, 5]) // Lunes, Miércoles, Viernes
          },
          {
            id: Buffer.from('habit-2'),
            frequency_type: 'weekly',
            frequency_days: JSON.stringify([0, 6]) // Domingo, Sábado (NO viernes)
          }
        ]])
        // Mock: No completado habit-1
        .mockResolvedValueOnce([[]])
        // Mock: Usuario con 2 vidas
        .mockResolvedValueOnce([[{ lives: 2, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await evaluateMissedHabits(userId, friday);

      // Solo debe evaluar habit-1 (programado para viernes)
      expect(result.missed_habits).toHaveLength(1);
      expect(result.lives_lost).toBe(1);
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));

      await expect(evaluateMissedHabits(userId, evaluationDate))
        .rejects.toThrow('Database error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });
  });

  describe('evaluateAllUsersDailyHabits', () => {
    it('should evaluate all active users', async () => {
      const users = [
        { id: Buffer.from('user-1') },
        { id: Buffer.from('user-2') },
        { id: Buffer.from('user-3') }
      ];

      // Mock: Obtener todos los usuarios
      mockConnection.execute.mockResolvedValueOnce([users]);

      // Mock las evaluaciones individuales
      const mockEvaluateMissedHabits = jest.fn()
        .mockResolvedValueOnce({
          user_id: 'user-1',
          missed_habits: [],
          lives_lost: 0,
          new_lives_total: 2,
          habits_disabled: []
        })
        .mockResolvedValueOnce({
          user_id: 'user-2',
          missed_habits: ['habit-1'],
          lives_lost: 1,
          new_lives_total: 1,
          habits_disabled: []
        })
        .mockResolvedValueOnce({
          user_id: 'user-3',
          missed_habits: ['habit-1', 'habit-2'],
          lives_lost: 2,
          new_lives_total: 0,
          habits_disabled: ['habit-1', 'habit-2']
        });

      // Mockear múltiples evaluaciones
      for (let i = 0; i < users.length; i++) {
        mockConnection.execute
          .mockResolvedValueOnce([[
            { id: Buffer.from('habit-1'), frequency_type: 'daily' }
          ]])
          .mockResolvedValueOnce([[]])
          .mockResolvedValueOnce([[{ lives: 2 - i, max_lives: 2 }]])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        if (i === 2) {
          // Usuario 3 llega a 0 vidas
          mockConnection.execute
            .mockResolvedValueOnce([[{ id: Buffer.from('habit-1') }]])
            .mockResolvedValueOnce([]);
        }
      }

      const results = await evaluateAllUsersDailyHabits();

      expect(results).toHaveLength(3);
      expect(pool.getConnection).toHaveBeenCalled();
    });

    it('should continue evaluation even if one user fails', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[
          { id: Buffer.from('user-1') },
          { id: Buffer.from('user-2') }
        ]]);

      // Mockear evaluación de user-1 con datos completos
      mockConnection.execute
        .mockResolvedValueOnce([[
          { id: Buffer.from('habit-1'), frequency_type: 'daily' }
        ]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ lives: 2, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Mockear evaluación de user-2 con error
      mockConnection.execute
        .mockRejectedValueOnce(new Error('User evaluation failed'));

      const results = await evaluateAllUsersDailyHabits();

      // Debe retornar solo el resultado del user-1
      expect(results).toHaveLength(1);
    });
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
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE USERS SET lives = ?'),
        [2, userId]
      );
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE HABITS'),
        expect.arrayContaining([userId])
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
        expect.arrayContaining([userId])
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
        expect.arrayContaining([expect.any(String), userId, 2, 2, 'user_revived'])
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
        expect.arrayContaining([habitId, userId])
      );

      // Verificar UPDATE de completamientos con notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE HABIT_COMPLETIONS'),
        expect.arrayContaining([habitId, userId])
      );

      // Verificar DELETE de completamientos sin notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM HABIT_COMPLETIONS'),
        expect.arrayContaining([habitId, userId])
      );

      // Verificar expiración de challenges
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE USER_CHALLENGES'),
        expect.arrayContaining([habitId, userId])
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
        expect.arrayContaining([habitId, userId])
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
        expect.arrayContaining([habitId, userId])
      );

      // Verificar que el DELETE solo elimina sin notas
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('notes IS NULL'),
        expect.arrayContaining([habitId, userId])
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
        expect.arrayContaining([habitId, userId])
      );
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Deactivation failed'));

      await expect(deactivateHabitManually(habitId, userId))
        .rejects.toThrow('Deactivation failed');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
    });
  });
});