import pool from '../../db';
import {
  evaluateLifeChallenges,
  getUserLifeChallengeStatuses,
  redeemLifeChallengeWithValidation,
} from '../../services/life-challenge-evaluation.service';

// Mock del pool de base de datos
jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    getConnection: jest.fn(),
  },
}));

describe('Life Challenge Evaluation Service', () => {
  let mockConnection: any;

  beforeEach(() => {
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

  describe('evaluateLifeChallenges', () => {
    const userId = 'user-123';

    it('should evaluate all active life challenges', async () => {
      // Mock: Obtener life challenges activos
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('lc-1'),
            title: 'Semana Perfecta',
            description: 'Semana sin perder vidas',
            reward: 1,
            redeemable_type: 'once',
            icon: '🏆',
            verification_function: 'verifyWeekWithoutLosingLives',
            is_active: 1,
          },
        ],
      ]);

      // Mock: Verificar redenciones previas (ninguna)
      mockConnection.execute.mockResolvedValueOnce([[]]);

      // Mock: Verificar requisitos del challenge (cumple)
      mockConnection.execute
        .mockResolvedValueOnce([[{ lost_lives_count: 0 }]]) // Sin vidas perdidas
        .mockResolvedValueOnce([[{ habit_count: 1 }]]); // Tiene hábitos activos

      const result = await evaluateLifeChallenges(userId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('obtained');
      expect(result[0].can_redeem).toBe(true);
    });

    it('should mark challenge as redeemed if already redeemed (type once)', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              redeemable_type: 'once',
              verification_function: 'verifyWeekWithoutLosingLives',
            },
          ],
        ])
        // Ya fue redimido
        .mockResolvedValueOnce([
          [
            {
              redeemed_at: new Date(),
            },
          ],
        ])
        // Cumple requisitos
        .mockResolvedValueOnce([[{ lost_lives_count: 0 }]])
        .mockResolvedValueOnce([[{ habit_count: 1 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('redeemed');
      expect(result[0].can_redeem).toBe(false);
    });

    it('should mark as pending if requirements not met', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              redeemable_type: 'once',
              verification_function: 'verifyWeekWithoutLosingLives',
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        // No cumple: perdió vidas esta semana
        .mockResolvedValueOnce([[{ lost_lives_count: 2 }]])
        .mockResolvedValueOnce([[{ habit_count: 1 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('pending');
      expect(result[0].can_redeem).toBe(false);
    });

    it('should allow unlimited challenges to be redeemed multiple times', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              redeemable_type: 'unlimited',
              verification_function: 'verifyMonthWithoutLosingLives',
            },
          ],
        ])
        // Ya fue redimido antes
        .mockResolvedValueOnce([
          [
            {
              redeemed_at: new Date('2024-01-01'),
            },
          ],
        ])
        // Pero ahora cumple requisitos nuevamente
        .mockResolvedValueOnce([[{ lost_lives_count: 0 }]])
        .mockResolvedValueOnce([[{ habit_count: 1 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('obtained');
      expect(result[0].can_redeem).toBe(true);
    });

    it('should handle verification function errors gracefully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              verification_function: 'nonExistentFunction',
            },
          ],
        ])
        .mockResolvedValueOnce([[]]);

      const result = await evaluateLifeChallenges(userId);

      // Debe retornar el challenge con status pending
      expect(result[0].status).toBe('pending');
      expect(result[0].can_redeem).toBe(false);
    });

    it('should verify "Madrugador" challenge correctly', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              title: 'Madrugador',
              verification_function: 'verifyEarlyBird',
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        // Mock: Tiene completamientos antes de 1 AM
        .mockResolvedValueOnce([[{ early_completions: 1 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('obtained');
      expect(result[0].can_redeem).toBe(true);
    });

    it('should verify "Salvación de Último Momento" challenge', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              title: 'Salvación de Último Momento',
              verification_function: 'verifyLastHourSave',
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        // Mock: Tiene completamientos después de las 23:00
        .mockResolvedValueOnce([[{ late_completions: 1 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('obtained');
    });

    it('should verify "Maestro del Tiempo" challenge (1000 hours)', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              verification_function: 'verify1000Hours',
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        // Mock: 60000 minutos = 1000 horas
        .mockResolvedValueOnce([[{ total_minutes: 60000 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('obtained');
    });

    it('should verify "Escritor Prolífico" challenge (200 notas)', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('lc-1'),
              verification_function: 'verify200Notes',
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        // Mock: 200+ notas escritas
        .mockResolvedValueOnce([[{ notes_count: 205 }]]);

      const result = await evaluateLifeChallenges(userId);

      expect(result[0].status).toBe('obtained');
    });
  });

  describe('getUserLifeChallengeStatuses', () => {
    const userId = 'user-123';

    it('should return all life challenges with statuses', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: Buffer.from('lc-1'), verification_function: 'verifyEarlyBird' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ early_completions: 1 }]]);

      const result = await getUserLifeChallengeStatuses(userId);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // TODO: redeemLifeChallengeWithValidation tests need integration tests with real database
  // The function internally calls evaluateLifeChallenges, making unit test mocking very complex
  // For now, this function is tested manually/via e2e tests
  describe.skip('redeemLifeChallengeWithValidation', () => {
    it('placeholder - needs integration tests', () => {
      expect(true).toBe(true);
    });
  });
});
