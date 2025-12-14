import { Response } from 'express';
import pool from '../db';
import { RowDataPacket } from 'mysql2';
import {
  submitChallengeProof,
  getChallengeProofStatus,
  getAvailableChallengesForRevival,
} from '../services/challenge-validation.service';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * POST /api/challenges/:userChallengeId/submit-proof
 * Envía pruebas para completar un challenge cuando el usuario no tiene vidas
 */
export const submitProof = async (req: AuthRequest, res: Response) => {
  try {
    const { userChallengeId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated', success: false });
    }
    const { proofText, proofImageUrl } = req.body;

    if (!proofText && !proofImageUrl) {
      return res.status(400).json({
        message: 'Debes proporcionar al menos una prueba (texto o imagen)',
        success: false,
      });
    }

    const result = await submitChallengeProof(userId, userChallengeId, proofText, proofImageUrl);

    if (result.success) {
      res.status(200).json({
        message: result.message,
        success: true,
        validationResult: result.validationResult,
      });
    } else {
      res.status(400).json({
        message: result.message,
        success: false,
        validationResult: result.validationResult,
      });
    }
  } catch (error) {
    console.error('Error submitting challenge proof:', error);
    res.status(500).json({
      message: 'Error al enviar las pruebas del challenge',
      success: false,
    });
  }
};

/**
 * GET /api/challenges/:userChallengeId/proof-status
 * Obtiene el estado de validación de las pruebas de un challenge
 */
export const getProofStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userChallengeId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated', success: false });
    }

    const proof = await getChallengeProofStatus(userId, userChallengeId);

    if (!proof) {
      return res.status(404).json({
        message: 'No se encontraron pruebas para este challenge',
        success: false,
      });
    }

    res.json({
      success: true,
      proof,
    });
  } catch (error) {
    console.error('Error getting challenge proof status:', error);
    res.status(500).json({
      message: 'Error al obtener el estado de las pruebas',
      success: false,
    });
  }
};

/**
 * GET /api/challenges/available-for-revival
 * Lista los challenges disponibles para que un usuario sin vidas pueda revivir
 */
export const getAvailableForRevival = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated', success: false });
    }

    // Verificar primero si el usuario tiene 0 vidas
    const connection = await pool.getConnection();

    try {
      const [users] = await connection.execute<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = UUID_TO_BIN(?)', [
        userId,
      ]);

      if (users.length === 0) {
        return res.status(404).json({
          message: 'Usuario no encontrado',
          success: false,
        });
      }

      const userLives = users[0].lives;

      if (userLives > 0) {
        return res.status(400).json({
          message: 'Esta función solo está disponible cuando no tienes vidas',
          success: false,
          currentLives: userLives,
        });
      }

      const challenges = await getAvailableChallengesForRevival(userId);

      res.json({
        success: true,
        challenges,
        message:
          challenges.length > 0
            ? 'Completa uno de estos retos con pruebas para revivir'
            : 'No tienes retos asignados. Asigna un reto primero',
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting available challenges for revival:', error);
    res.status(500).json({
      message: 'Error al obtener los challenges disponibles',
      success: false,
    });
  }
};
