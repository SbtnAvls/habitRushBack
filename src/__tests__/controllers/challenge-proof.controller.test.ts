import { Request, Response } from 'express';
import { submitProof, getProofStatus, getAvailableForRevival } from '../../controllers/challenge-proof.controller';
import * as challengeValidationService from '../../services/challenge-validation.service';
import { mockRequest, mockResponse } from '../helpers/test-helpers';

// Mock del servicio
jest.mock('../../services/challenge-validation.service');

// Mock del pool de base de datos para getAvailableForRevival
jest.mock('../../db', () => ({
  __esModule: true,
  default: {
    getConnection: jest.fn(),
  },
}));

describe('Challenge Proof Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitProof', () => {
    it('should submit proof successfully', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: {
          proofText: 'I completed 30 minutes of exercise',
          proofImageUrl: 'https://cloudinary.com/image.jpg',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.submitChallengeProof as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Challenge completado exitosamente',
        validationResult: {
          is_valid: true,
          confidence_score: 0.85,
          reasoning: 'Valid proof',
        },
      });

      await submitProof(req, res);

      expect(challengeValidationService.submitChallengeProof).toHaveBeenCalledWith(
        'user-123',
        'uc-123',
        'I completed 30 minutes of exercise',
        'https://cloudinary.com/image.jpg',
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.any(String),
          validationResult: expect.any(Object),
        }),
      );
    });

    it('should return error if proof validation fails', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: {
          proofText: 'Short proof',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.submitChallengeProof as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Pruebas insuficientes',
        validationResult: {
          is_valid: false,
          confidence_score: 0.3,
          reasoning: 'Too short',
        },
      });

      await submitProof(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Pruebas insuficientes',
        }),
      );
    });

    it('should return 400 if no proof provided', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: {},
      }) as Request;
      const res = mockResponse() as unknown as Response;

      await submitProof(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('al menos una prueba'),
          success: false,
        }),
      );
    });

    it('should handle service errors', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: { proofText: 'Some proof' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.submitChallengeProof as jest.Mock).mockRejectedValue(new Error('Database error'));

      await submitProof(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Error al enviar'),
          success: false,
        }),
      );
    });

    it('should accept only text proof', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: {
          proofText: 'Detailed description of completion',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.submitChallengeProof as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Approved',
        validationResult: { is_valid: true },
      });

      await submitProof(req, res);

      expect(challengeValidationService.submitChallengeProof).toHaveBeenCalledWith(
        'user-123',
        'uc-123',
        'Detailed description of completion',
        undefined,
      );
    });

    it('should accept only image proof', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
        body: {
          proofImageUrl: 'https://cloudinary.com/image.jpg',
        },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.submitChallengeProof as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Approved',
      });

      await submitProof(req, res);

      expect(challengeValidationService.submitChallengeProof).toHaveBeenCalledWith(
        'user-123',
        'uc-123',
        undefined,
        'https://cloudinary.com/image.jpg',
      );
    });
  });

  describe('getProofStatus', () => {
    it('should return proof status when it exists', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.getChallengeProofStatus as jest.Mock).mockResolvedValue({
        id: 'proof-123',
        validation_status: 'approved',
        proof_type: 'both',
        validation_result: {
          is_valid: true,
          confidence_score: 0.9,
        },
      });

      await getProofStatus(req, res);

      expect(challengeValidationService.getChallengeProofStatus).toHaveBeenCalledWith('user-123', 'uc-123');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          proof: expect.any(Object),
        }),
      );
    });

    it('should return 404 when no proof exists', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.getChallengeProofStatus as jest.Mock).mockResolvedValue(null);

      await getProofStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('No se encontraron pruebas'),
          success: false,
        }),
      );
    });

    it('should handle service errors', async () => {
      const req = mockRequest({
        params: { userChallengeId: 'uc-123' },
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      (challengeValidationService.getChallengeProofStatus as jest.Mock).mockRejectedValue(new Error('Database error'));

      await getProofStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        }),
      );
    });
  });

  describe('getAvailableForRevival', () => {
    let mockConnection: any;

    beforeEach(() => {
      mockConnection = {
        execute: jest.fn(),
        release: jest.fn(),
      };

      const pool = require('../../db').default;
      pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
    });

    it('should return available challenges when user has 0 lives', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      // Mock: Usuario con 0 vidas
      mockConnection.execute.mockResolvedValueOnce([[{ lives: 0 }]]);

      (challengeValidationService.getAvailableChallengesForRevival as jest.Mock).mockResolvedValue([
        {
          user_challenge_id: 'uc-1',
          title: 'Challenge 1',
          description: 'Test',
        },
        {
          user_challenge_id: 'uc-2',
          title: 'Challenge 2',
          description: 'Test 2',
        },
      ]);

      await getAvailableForRevival(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          challenges: expect.arrayContaining([expect.objectContaining({ title: 'Challenge 1' })]),
        }),
      );
    });

    it('should return error when user has lives', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      // Mock: Usuario con vidas
      mockConnection.execute.mockResolvedValueOnce([[{ lives: 2 }]]);

      await getAvailableForRevival(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('solo está disponible cuando no tienes vidas'),
          success: false,
          currentLives: 2,
        }),
      );
    });

    it('should return 404 when user not found', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      mockConnection.execute.mockResolvedValueOnce([[]]);

      await getAvailableForRevival(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Usuario no encontrado'),
        }),
      );
    });

    it('should show appropriate message when no challenges available', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      mockConnection.execute.mockResolvedValueOnce([[{ lives: 0 }]]);
      (challengeValidationService.getAvailableChallengesForRevival as jest.Mock).mockResolvedValue([]);

      await getAvailableForRevival(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          challenges: [],
          message: expect.stringContaining('No tienes retos asignados'),
        }),
      );
    });

    it('should handle service errors', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      await getAvailableForRevival(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        }),
      );
    });

    it('should release connection on success', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      mockConnection.execute.mockResolvedValueOnce([[{ lives: 0 }]]);
      (challengeValidationService.getAvailableChallengesForRevival as jest.Mock).mockResolvedValue([]);

      await getAvailableForRevival(req, res);

      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should release connection on error', async () => {
      const req = mockRequest({
        user: { id: 'user-123' },
      }) as Request;
      const res = mockResponse() as unknown as Response;

      mockConnection.execute.mockRejectedValue(new Error('Error'));

      await getAvailableForRevival(req, res);

      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
