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

  describe('redeemLifeChallengeWithValidation', () => {
    const userId = 'user-123';
    const lifeChallengeId = 'lc-123';

    beforeEach(() => {
      // Mock para evaluateLifeChallenges
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            title: 'Test Challenge',
            reward: 1,
            redeemable_type: 'once',
            status: 'obtained',
            can_redeem: true,
          },
        ]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should redeem life challenge successfully', async () => {
      // Mock del evaluateLifeChallenges ya está arriba

      mockConnection.execute
        // Mock: Obtener usuario con vidas actuales
        .mockResolvedValueOnce([[{ lives: 1, max_lives: 2 }]])
        // Mock: UPDATE vidas
        .mockResolvedValueOnce([])
        // Mock: INSERT redemption
        .mockResolvedValueOnce([])
        // Mock: INSERT life history
        .mockResolvedValueOnce([]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(true);
      expect(result.livesGained).toBe(1);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should not allow redemption if already redeemed (type once)', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            status: 'redeemed',
            can_redeem: false,
          },
        ]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('ya fue redimido');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should not allow redemption if requirements not met', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            status: 'pending',
            can_redeem: false,
          },
        ]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('no cumples los requisitos');
    });

    it('should not allow redemption if user already has max lives', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            reward: 1,
            can_redeem: true,
          },
        ]);

      mockConnection.execute
        // Usuario ya tiene vidas máximas
        .mockResolvedValueOnce([[{ lives: 2, max_lives: 2 }]]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('máximo de vidas');
    });

    it('should cap lives gained at max_lives', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            reward: 3, // Quiere dar 3 vidas
            can_redeem: true,
          },
        ]);

      mockConnection.execute
        // Usuario tiene 1 vida, max 2
        .mockResolvedValueOnce([[{ lives: 1, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(true);
      expect(result.livesGained).toBe(1); // Solo gana 1 (2 max - 1 actual)
    });

    it('should create life history entry with correct reason', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            reward: 1,
            can_redeem: true,
          },
        ]);

      mockConnection.execute
        .mockResolvedValueOnce([[{ lives: 1, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO LIFE_HISTORY'),
        expect.arrayContaining([
          expect.any(String),
          userId,
          1, // lives gained
          2, // new lives total
          'life_challenge_redeemed',
          lifeChallengeId,
        ]),
      );
    });

    it('should create redemption record', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            reward: 1,
            can_redeem: true,
          },
        ]);

      mockConnection.execute
        .mockResolvedValueOnce([[{ lives: 1, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO LIFE_CHALLENGE_REDEMPTIONS'),
        expect.arrayContaining([expect.any(String), userId, lifeChallengeId, 1]),
      );
    });

    it('should return error if challenge not found', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([]);

      const result = await redeemLifeChallengeWithValidation(userId, 'non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('no encontrado');
    });

    it('should rollback on error', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            can_redeem: true,
            reward: 1,
          },
        ]);

      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));

      await expect(redeemLifeChallengeWithValidation(userId, lifeChallengeId)).rejects.toThrow();

      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should handle unlimited type challenges correctly', async () => {
      jest
        .spyOn(require('../../services/life-challenge-evaluation.service'), 'evaluateLifeChallenges')
        .mockResolvedValue([
          {
            life_challenge_id: lifeChallengeId,
            redeemable_type: 'unlimited',
            reward: 1,
            can_redeem: true,
            status: 'obtained',
          },
        ]);

      mockConnection.execute
        .mockResolvedValueOnce([[{ lives: 0, max_lives: 2 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await redeemLifeChallengeWithValidation(userId, lifeChallengeId);

      expect(result.success).toBe(true);
      expect(result.livesGained).toBe(1);
    });
  });
});
