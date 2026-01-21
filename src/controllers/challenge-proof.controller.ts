import { Response } from 'express';
import pool from '../db';
import { RowDataPacket } from 'mysql2';
import {
  submitChallengeProof,
  getChallengeProofStatus,
  getAvailableChallengesForRevival,
} from '../services/challenge-validation.service';
import { AuthRequest } from '../middleware/auth.middleware';

// MEDIUM FIX: Validation constants for proof submissions
const PROOF_TEXT_MAX_LENGTH = 2000;
const PROOF_IMAGE_URL_MAX_LENGTH = 5 * 1024 * 1024; // 5MB base64 max (~3.75MB actual image)
const VALID_IMAGE_PREFIXES = ['data:image/jpeg', 'data:image/png', 'data:image/jpg', 'data:image/gif', 'data:image/webp'];

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

    // MEDIUM FIX: Validate proofText length
    if (proofText) {
      if (typeof proofText !== 'string') {
        return res.status(400).json({
          message: 'proofText debe ser un string',
          success: false,
        });
      }
      if (proofText.length > PROOF_TEXT_MAX_LENGTH) {
        return res.status(400).json({
          message: `El texto de prueba no puede exceder ${PROOF_TEXT_MAX_LENGTH} caracteres`,
          success: false,
        });
      }
    }

    // MEDIUM FIX: Validate proofImageUrl format and size
    if (proofImageUrl) {
      if (typeof proofImageUrl !== 'string') {
        return res.status(400).json({
          message: 'proofImageUrl debe ser un string',
          success: false,
        });
      }
      // Check size limit for base64 data URLs
      if (proofImageUrl.length > PROOF_IMAGE_URL_MAX_LENGTH) {
        return res.status(400).json({
          message: 'La imagen es demasiado grande. Máximo 5MB.',
          success: false,
        });
      }
      // Validate format: must be valid data URL or HTTP(S) URL
      const isValidDataUrl = VALID_IMAGE_PREFIXES.some(prefix => proofImageUrl.startsWith(prefix));
      const isValidHttpUrl = proofImageUrl.startsWith('http://') || proofImageUrl.startsWith('https://');
      if (!isValidDataUrl && !isValidHttpUrl) {
        return res.status(400).json({
          message: 'Formato de imagen inválido. Usa una URL válida o imagen base64.',
          success: false,
        });
      }
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
      // NOTE: DB uses CHAR(36) for UUIDs, not BINARY(16)
      const [users] = await connection.execute<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);

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
            ? 'Elige un reto de penitencia, complétalo y envía pruebas para revivir'
            : 'No hay retos de penitencia disponibles en este momento',
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
