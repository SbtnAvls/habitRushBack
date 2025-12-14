import pool from '../../db';
import {
  submitChallengeProof,
  getChallengeProofStatus,
  getAvailableChallengesForRevival,
} from '../../services/challenge-validation.service';
import * as habitEvaluationService from '../../services/habit-evaluation.service';

// Mock del pool de base de datos
jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    getConnection: jest.fn(),
  },
}));

// Mock del servicio de evaluación de hábitos
jest.mock('../../services/habit-evaluation.service');

describe('Challenge Validation Service', () => {
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

  describe('submitChallengeProof', () => {
    const userId = 'user-123';
    const userChallengeId = 'uc-123';

    it('should submit proof and approve when validation passes', async () => {
      // Mock: Verificar que el challenge existe
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('uc-123'),
              title: 'Test Challenge',
              description: 'Complete 30 minutes',
              difficulty: 'medium',
            },
          ],
        ])
        // Mock: Verificar que usuario no tiene vidas
        .mockResolvedValueOnce([[{ lives: 0 }]])
        // Mock: INSERT challenge proof
        .mockResolvedValueOnce([])
        // Mock: UPDATE proof con validación
        .mockResolvedValueOnce([])
        // Mock: UPDATE challenge status
        .mockResolvedValueOnce([])
        // Mock: INSERT life history
        .mockResolvedValueOnce([]);

      // Mock reviveUser
      (habitEvaluationService.reviveUser as jest.Mock).mockResolvedValue(undefined);

      const result = await submitChallengeProof(
        userId,
        userChallengeId,
        'Completé 35 minutos de ejercicio en el parque',
        'https://cloudinary.com/image.jpg',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('revivido');
      expect(result.validationResult?.is_valid).toBe(true);
      expect(habitEvaluationService.reviveUser).toHaveBeenCalledWith(userId);
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('should reject proof when validation fails', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([
          [
            {
              id: Buffer.from('uc-123'),
              title: 'Test Challenge',
            },
          ],
        ])
        .mockResolvedValueOnce([[{ lives: 0 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await submitChallengeProof(
        userId,
        userChallengeId,
        'abc', // Texto muy corto
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('no fueron suficientes');
      expect(result.validationResult?.is_valid).toBe(false);
      expect(habitEvaluationService.reviveUser).not.toHaveBeenCalled();
    });

    it('should return error if challenge not found', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await submitChallengeProof(userId, userChallengeId, 'Some proof');

      expect(result.success).toBe(false);
      expect(result.message).toContain('no encontrado');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should return error if user has lives', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: Buffer.from('uc-123') }]])
        .mockResolvedValueOnce([[{ lives: 2 }]]);

      const result = await submitChallengeProof(userId, userChallengeId, 'Some proof');

      expect(result.success).toBe(false);
      expect(result.message).toContain('solo se usa cuando no tienes vidas');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should require at least one proof type', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: Buffer.from('uc-123') }]])
        .mockResolvedValueOnce([[{ lives: 0 }]]);

      const result = await submitChallengeProof(userId, userChallengeId, undefined, undefined);

      expect(result.success).toBe(false);
      expect(result.message).toContain('al menos una prueba');
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it('should handle both text and image proofs', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: Buffer.from('uc-123') }]])
        .mockResolvedValueOnce([[{ lives: 0 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (habitEvaluationService.reviveUser as jest.Mock).mockResolvedValue(undefined);

      const result = await submitChallengeProof(
        userId,
        userChallengeId,
        'Detailed description of challenge completion',
        'https://cloudinary.com/proof.jpg',
      );

      expect(result.success).toBe(true);
      expect(result.validationResult?.confidence_score).toBeGreaterThan(0.8);

      // Verificar que se insertó con proof_type='both'
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO CHALLENGE_PROOFS'),
        expect.arrayContaining([
          expect.any(String),
          userChallengeId,
          'Detailed description of challenge completion',
          'https://cloudinary.com/proof.jpg',
          'both',
          'pending',
        ]),
      );
    });

    it('should create life history entry after successful validation', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: Buffer.from('uc-123') }]])
        .mockResolvedValueOnce([[{ lives: 0 }]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (habitEvaluationService.reviveUser as jest.Mock).mockResolvedValue(undefined);

      await submitChallengeProof(userId, userChallengeId, 'Valid proof text');

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO LIFE_HISTORY'),
        expect.arrayContaining([expect.any(String), userId, 0, 0, 'challenge_completed', userChallengeId]),
      );
    });

    it('should rollback on error', async () => {
      mockConnection.execute.mockRejectedValueOnce(new Error('Database error'));

      await expect(submitChallengeProof(userId, userChallengeId, 'proof')).rejects.toThrow();

      expect(mockConnection.rollback).toHaveBeenCalled();
    });
  });

  describe('getChallengeProofStatus', () => {
    const userId = 'user-123';
    const userChallengeId = 'uc-123';

    it('should return proof status when it exists', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('proof-123'),
            user_challenge_id: Buffer.from('uc-123'),
            proof_text: 'My proof',
            proof_image_url: 'https://image.jpg',
            proof_type: 'both',
            validation_status: 'approved',
            validation_result: JSON.stringify({
              is_valid: true,
              confidence_score: 0.9,
              reasoning: 'Good proof',
            }),
            validated_at: new Date(),
            created_at: new Date(),
          },
        ],
      ]);

      const result = await getChallengeProofStatus(userId, userChallengeId);

      expect(result).not.toBeNull();
      expect(result?.validation_status).toBe('approved');
      expect(result?.proof_type).toBe('both');
      expect(result?.validation_result).toBeDefined();
    });

    it('should return null when no proof exists', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await getChallengeProofStatus(userId, userChallengeId);

      expect(result).toBeNull();
    });

    it('should return most recent proof', async () => {
      // La query tiene ORDER BY created_at DESC LIMIT 1
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('proof-latest'),
            validation_status: 'pending',
            created_at: new Date(),
          },
        ],
      ]);

      await getChallengeProofStatus(userId, userChallengeId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY cp.created_at DESC'),
        expect.any(Array),
      );
    });

    it('should parse validation_result JSON', async () => {
      const validationData = {
        is_valid: true,
        confidence_score: 0.85,
        reasoning: 'Well documented',
      };

      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('proof-123'),
            validation_result: JSON.stringify(validationData),
            validation_status: 'approved',
            created_at: new Date(),
          },
        ],
      ]);

      const result = await getChallengeProofStatus(userId, userChallengeId);

      expect(result?.validation_result).toEqual(validationData);
    });
  });

  describe('getAvailableChallengesForRevival', () => {
    const userId = 'user-123';

    it('should return assigned challenges for user without lives', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('uc-1'),
            challenge_id: Buffer.from('c-1'),
            title: 'Challenge 1',
            description: 'Description 1',
            difficulty: 'easy',
            type: 'exercise',
            estimated_time: 30,
            habit_name: 'Running',
            assigned_at: new Date(),
          },
          {
            id: Buffer.from('uc-2'),
            challenge_id: Buffer.from('c-2'),
            title: 'Challenge 2',
            description: 'Description 2',
            difficulty: 'medium',
            type: 'learning',
            estimated_time: 60,
            habit_name: 'Reading',
            assigned_at: new Date(),
          },
        ],
      ]);

      const result = await getAvailableChallengesForRevival(userId);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Challenge 1');
      expect(result[1].difficulty).toBe('medium');
    });

    it('should return empty array when no challenges assigned', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      const result = await getAvailableChallengesForRevival(userId);

      expect(result).toEqual([]);
    });

    it('should only return challenges with status assigned', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('uc-1'),
            challenge_id: Buffer.from('c-1'),
            title: 'Available Challenge',
          },
        ],
      ]);

      await getAvailableChallengesForRevival(userId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining("uc.status = 'assigned'"),
        expect.arrayContaining([userId]),
      );
    });

    it('should only return active challenges', async () => {
      mockConnection.execute.mockResolvedValueOnce([[]]);

      await getAvailableChallengesForRevival(userId);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('c.is_active = 1'),
        expect.any(Array),
      );
    });

    it('should include habit name in results', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from('uc-1'),
            challenge_id: Buffer.from('c-1'),
            title: 'Test Challenge',
            habit_name: 'My Habit',
          },
        ],
      ]);

      const result = await getAvailableChallengesForRevival(userId);

      expect(result[0].habit_name).toBe('My Habit');
    });

    it('should convert buffer IDs to UUIDs', async () => {
      const ucId = '12345678-1234-1234-1234-123456789abc';
      const cId = '87654321-4321-4321-4321-cba987654321';

      mockConnection.execute.mockResolvedValueOnce([
        [
          {
            id: Buffer.from(ucId.replace(/-/g, ''), 'hex'),
            challenge_id: Buffer.from(cId.replace(/-/g, ''), 'hex'),
            title: 'Test',
          },
        ],
      ]);

      const result = await getAvailableChallengesForRevival(userId);

      expect(result[0].user_challenge_id).toMatch(/^[a-f0-9-]{36}$/);
      expect(result[0].challenge_id).toMatch(/^[a-f0-9-]{36}$/);
    });
  });
});
