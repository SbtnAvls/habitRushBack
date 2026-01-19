import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { PendingValidationModel } from '../models/pending-validation.model';
import { ChallengeModel } from '../models/challenge.model';
import { LifeHistoryModel } from '../models/life-history.model';
import { UserChallengeModel } from '../models/user-challenge.model';
import { onFailRedeemedWithLife } from '../services/stats.service';
import { handleUserDeath } from '../services/habit-evaluation.service';
import { saveProofImage } from '../services/file-storage.service';
import { isValidUUID } from '../middleware/uuid-validation.middleware';
import pool from '../db';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';

/**
 * Safely release a database connection
 * Logs errors instead of throwing to prevent masking the original error
 */
function safeReleaseConnection(connection: PoolConnection): void {
  try {
    connection.release();
  } catch (error) {
    console.error('[DB] Error releasing connection:', error);
  }
}

export class PendingRedemptionController {
  /**
   * GET /pending-redemptions
   * Get all pending redemptions for the current user with available challenges
   */
  static async getForUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const pending = await PendingRedemptionModel.getPendingForUser(userId);

      // For each pending redemption, get available challenges from its category
      const result = await Promise.all(
        pending.map(async p => {
          const hasChallengeAssigned = p.status === 'challenge_assigned';
          // Only fetch available challenges if user hasn't picked one yet
          const challenges = hasChallengeAssigned ? [] : await ChallengeModel.getByCategory(p.habit_category_id);

          // If challenge is assigned, get the challenge details
          let assignedChallenge = null;
          if (hasChallengeAssigned && p.challenge_id) {
            assignedChallenge = await ChallengeModel.findById(p.challenge_id);
          }

          return {
            ...p,
            has_challenge_assigned: hasChallengeAssigned,
            assigned_challenge: assignedChallenge,
            available_challenges: challenges,
            time_remaining_ms: Math.max(0, new Date(p.expires_at).getTime() - Date.now()),
          };
        }),
      );

      res.json({
        success: true,
        pending_redemptions: result,
        count: result.length,
      });
    } catch (error) {
      console.error('Error getting pending redemptions:', error);
      res.status(500).json({ message: 'Error al obtener redenciones pendientes' });
    }
  }

  /**
   * POST /pending-redemptions/:id/redeem-life
   * Accept losing a life for a pending redemption
   */
  static async redeemWithLife(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Verify the pending redemption exists and belongs to the user
      const pending = await PendingRedemptionModel.findByIdAndUser(id, userId);
      if (!pending) {
        return res.status(404).json({ message: 'Redenci\u00f3n no encontrada' });
      }

      if (pending.status === 'challenge_assigned') {
        return res.status(400).json({
          message: 'Ya elegiste completar un challenge. Debes completarlo o esperar a que expire.',
          error_code: 'CHALLENGE_ALREADY_ASSIGNED',
        });
      }

      if (pending.status !== 'pending') {
        return res.status(400).json({ message: 'Esta redenci\u00f3n ya fue procesada' });
      }

      await connection.beginTransaction();

      // Mark as redeemed with life
      await PendingRedemptionModel.resolveWithLife(id, connection);

      // Deduct one life from the user
      await connection.query('UPDATE USERS SET lives = GREATEST(0, lives - 1) WHERE id = ?', [userId]);

      // Get current lives after deduction
      const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);
      const currentLives = userRows[0]?.lives ?? 0;

      // Record in LIFE_HISTORY
      await LifeHistoryModel.create(
        userId,
        -1,
        currentLives,
        'habit_missed',
        { habitId: pending.habit_id },
        connection,
      );

      // Reduce discipline score
      await onFailRedeemedWithLife(userId, connection);

      // Check if user died (0 lives)
      const isDead = currentLives === 0;
      if (isDead) {
        await handleUserDeath(userId, connection);
      }

      await connection.commit();

      res.json({
        success: true,
        message: isDead ? 'Perdiste tu última vida. Todos tus hábitos han sido desactivados.' : 'Vida redimida',
        current_lives: currentLives,
        is_dead: isDead,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error redeeming with life:', error);
      res.status(500).json({ message: 'Error al redimir con vida' });
    } finally {
      safeReleaseConnection(connection);
    }
  }

  /**
   * POST /pending-redemptions/:id/redeem-challenge
   * Start a challenge to redeem a pending failure (no life lost)
   */
  static async redeemWithChallenge(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { challenge_id } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // MEDIUM FIX: Validate challenge_id type and format using proper UUID regex
      if (!challenge_id) {
        return res.status(400).json({ message: 'challenge_id es requerido' });
      }
      if (typeof challenge_id !== 'string') {
        return res.status(400).json({ message: 'challenge_id debe ser un string' });
      }
      // Proper UUID v4 format validation using regex
      if (!isValidUUID(challenge_id)) {
        return res.status(400).json({ message: 'challenge_id tiene formato inválido' });
      }

      // Verify the pending redemption
      const pending = await PendingRedemptionModel.findByIdAndUser(id, userId);
      if (!pending) {
        return res.status(404).json({ message: 'Redenci\u00f3n no encontrada' });
      }

      if (pending.status === 'challenge_assigned') {
        return res.status(400).json({
          message: 'Ya tienes un challenge asignado para esta redenci\u00f3n. Compl\u00e9talo o espera a que expire.',
          error_code: 'CHALLENGE_ALREADY_ASSIGNED',
        });
      }

      if (pending.status !== 'pending') {
        return res.status(400).json({ message: 'Esta redenci\u00f3n ya fue procesada' });
      }

      // Verify the challenge exists and is active
      const challenge = await ChallengeModel.findById(challenge_id);
      if (!challenge || !challenge.is_active) {
        return res.status(404).json({ message: 'Challenge no encontrado o inactivo' });
      }

      // Get habit to check category
      const [habitRows] = await pool.query<RowDataPacket[]>('SELECT category_id FROM HABITS WHERE id = ?', [
        pending.habit_id,
      ]);

      if (habitRows.length === 0) {
        return res.status(404).json({ message: 'Hábito no encontrado' });
      }

      const habitCategoryId = habitRows[0].category_id;

      // Verify the challenge belongs to the habit's category (or is general)
      // Skip category check if habit has no category assigned or challenge is general
      if (habitCategoryId && !challenge.is_general && challenge.category_id !== habitCategoryId) {
        return res.status(400).json({
          message: 'El challenge debe ser de la misma categoría que el hábito fallado',
        });
      }

      await connection.beginTransaction();

      // Assign the challenge to the user (CRITICAL FIX: pass connection for transaction)
      const userChallenge = await UserChallengeModel.assign(userId, challenge_id, pending.habit_id, connection);

      // Mark pending as 'challenge_assigned' - habit remains BLOCKED until challenge is completed
      await PendingRedemptionModel.assignChallenge(id, challenge_id, connection);

      await connection.commit();

      res.json({
        success: true,
        message:
          'Challenge asignado. Compl\u00e9talo antes de que expire para no perder la vida. El h\u00e1bito permanece bloqueado hasta completar el challenge.',
        user_challenge: userChallenge,
        challenge: challenge,
        habit_still_blocked: true,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error redeeming with challenge:', error);
      res.status(500).json({ message: 'Error al asignar challenge' });
    } finally {
      safeReleaseConnection(connection);
    }
  }

  /**
   * POST /pending-redemptions/:id/complete-challenge
   * Submit proof for validation - goes to moderation queue
   * Admin can approve/reject manually, or AI validates after 1 hour
   */
  static async completeChallenge(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { proof_text, proof_image_urls } = req.body; // proof_image_urls is now an array of 1-2 images

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Validate proof_text length and content
      const MAX_PROOF_TEXT_LENGTH = 2000;
      if (proof_text && typeof proof_text === 'string') {
        // MEDIUM FIX: Reject whitespace-only strings
        const trimmedProofText = proof_text.trim();
        if (trimmedProofText.length === 0) {
          return res.status(400).json({
            message: 'El texto de prueba no puede estar vacío o contener solo espacios',
            error_code: 'PROOF_TEXT_EMPTY',
          });
        }
        if (proof_text.length > MAX_PROOF_TEXT_LENGTH) {
          return res.status(400).json({
            message: `El texto de prueba excede el límite de ${MAX_PROOF_TEXT_LENGTH} caracteres`,
            error_code: 'PROOF_TEXT_TOO_LONG',
          });
        }
      }

      // Verify the pending redemption
      const pending = await PendingRedemptionModel.findByIdAndUser(id, userId);
      if (!pending) {
        return res.status(404).json({ message: 'Redención no encontrada' });
      }

      if (pending.status === 'expired') {
        return res.status(400).json({
          message: 'Esta redención expiró. Ya perdiste la vida asociada.',
          error_code: 'REDEMPTION_EXPIRED',
        });
      }

      if (pending.status === 'redeemed_life') {
        return res.status(400).json({
          message: 'Ya redimiste esta falla con una vida.',
          error_code: 'ALREADY_REDEEMED_LIFE',
        });
      }

      if (pending.status === 'redeemed_challenge') {
        return res.status(400).json({
          message: 'Ya completaste el challenge para esta redención.',
          error_code: 'ALREADY_COMPLETED',
        });
      }

      if (pending.status !== 'challenge_assigned') {
        return res.status(400).json({
          message: 'Primero debes elegir un challenge con POST /pending-redemptions/:id/redeem-challenge',
          error_code: 'NO_CHALLENGE_ASSIGNED',
        });
      }

      // FIX: Check if the pending redemption has expired (time-based check)
      // MEDIUM FIX: Use getTime() for reliable comparison regardless of timezone
      const expiresAtMs = new Date(pending.expires_at).getTime();
      const nowMs = Date.now();
      if (expiresAtMs < nowMs) {
        return res.status(400).json({
          message: 'El tiempo para completar el challenge expiró. Ya no puedes enviar pruebas.',
          error_code: 'REDEMPTION_TIME_EXPIRED',
          expired_at: pending.expires_at,
        });
      }

      // Validate proof_image_urls: must be an array with 1-2 images
      if (!proof_image_urls || !Array.isArray(proof_image_urls)) {
        return res.status(400).json({
          message: 'Debes enviar al menos 1 imagen de prueba (proof_image_urls debe ser un array)',
          error_code: 'IMAGES_REQUIRED',
        });
      }

      if (proof_image_urls.length < 1) {
        return res.status(400).json({
          message: 'Debes enviar al menos 1 imagen de prueba',
          error_code: 'MIN_IMAGES_REQUIRED',
          min_images: 1,
        });
      }

      if (proof_image_urls.length > 2) {
        return res.status(400).json({
          message: 'Puedes enviar máximo 2 imágenes de prueba',
          error_code: 'MAX_IMAGES_EXCEEDED',
          max_images: 2,
          sent_images: proof_image_urls.length,
        });
      }

      // Validate each image format and size
      const VALID_IMAGE_PREFIXES = [
        'data:image/jpeg;base64,',
        'data:image/jpg;base64,',
        'data:image/png;base64,',
        'data:image/gif;base64,',
        'data:image/webp;base64,',
      ];
      const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per image
      // MEDIUM FIX: Maximum base64 string length to prevent memory issues
      // 8MB base64 ≈ 6MB actual image data (base64 is ~33% larger)
      const MAX_BASE64_STRING_LENGTH = 8 * 1024 * 1024;

      for (let i = 0; i < proof_image_urls.length; i++) {
        const imageUrl = proof_image_urls[i];
        const imageNumber = i + 1;

        if (typeof imageUrl !== 'string') {
          return res.status(400).json({
            message: `La imagen ${imageNumber} no es válida`,
            error_code: 'INVALID_IMAGE_TYPE',
            image_index: i,
          });
        }

        // MEDIUM FIX: Early length check to avoid expensive operations on huge strings
        if (imageUrl.length > MAX_BASE64_STRING_LENGTH) {
          return res.status(400).json({
            message: `La imagen ${imageNumber} es demasiado grande`,
            error_code: 'IMAGE_TOO_LARGE',
            image_index: i,
          });
        }

        const hasValidPrefix = VALID_IMAGE_PREFIXES.some(prefix => imageUrl.startsWith(prefix));
        if (!hasValidPrefix) {
          return res.status(400).json({
            message: `Formato de imagen ${imageNumber} inválido. Debe ser un data URL base64 (data:image/jpeg;base64,...)`,
            error_code: 'INVALID_IMAGE_FORMAT',
            image_index: i,
          });
        }

        const commaIndex = imageUrl.indexOf(',');
        const base64Data = commaIndex !== -1 ? imageUrl.substring(commaIndex + 1) : '';

        if (base64Data.length === 0) {
          return res.status(400).json({
            message: `La imagen ${imageNumber} no contiene datos.`,
            error_code: 'EMPTY_IMAGE_DATA',
            image_index: i,
          });
        }

        const imageSizeBytes = Math.ceil((base64Data.length * 3) / 4);

        if (imageSizeBytes > MAX_IMAGE_SIZE_BYTES) {
          return res.status(400).json({
            message: `La imagen ${imageNumber} es demasiado grande. Máximo permitido: 5MB. Tamaño enviado: ${(imageSizeBytes / (1024 * 1024)).toFixed(2)}MB`,
            error_code: 'IMAGE_TOO_LARGE',
            image_index: i,
            max_size_mb: 5,
            actual_size_mb: parseFloat((imageSizeBytes / (1024 * 1024)).toFixed(2)),
          });
        }
      }

      // Get challenge details (can be done outside transaction)
      const challenge = pending.challenge_id ? await ChallengeModel.findById(pending.challenge_id) : null;

      // Get user email
      const [userRows] = await pool.query<RowDataPacket[]>('SELECT email FROM USERS WHERE id = ?', [userId]);
      const userEmail = userRows[0]?.email || 'unknown';

      // Get habit name
      const [habitRows] = await pool.query<RowDataPacket[]>('SELECT name FROM HABITS WHERE id = ?', [pending.habit_id]);
      const habitName = habitRows[0]?.name || 'Unknown habit';

      // Determine proof type (images are always required now, text is optional)
      const proofType: 'text' | 'image' | 'both' = proof_text ? 'both' : 'image';

      // Save all images to disk (store file paths instead of base64)
      const storedImagePaths: string[] = [];
      for (let i = 0; i < proof_image_urls.length; i++) {
        const imageUrl = proof_image_urls[i];
        const saveResult = await saveProofImage(imageUrl, userId);
        if (!saveResult) {
          // Cleanup already saved images if one fails
          for (const savedPath of storedImagePaths) {
            const { deleteProofImage } = await import('../services/file-storage.service');
            await deleteProofImage(savedPath);
          }
          return res.status(500).json({
            message: `Error al guardar la imagen ${i + 1}. Por favor, inténtalo de nuevo.`,
            error_code: 'IMAGE_SAVE_FAILED',
            image_index: i,
          });
        }
        storedImagePaths.push(saveResult.filePath);
      }

      // Helper to cleanup saved images on any failure
      // Returns list of paths that failed to delete (orphan tracking)
      const cleanupImages = async (): Promise<string[]> => {
        const { deleteProofImage } = await import('../services/file-storage.service');
        const failedPaths: string[] = [];
        for (const savedPath of storedImagePaths) {
          try {
            const deleted = await deleteProofImage(savedPath);
            if (!deleted) {
              failedPaths.push(savedPath);
            }
          } catch (cleanupError) {
            // MEDIUM FIX: Sanitize logs to prevent path disclosure - log only filename
            const filename = savedPath.split('/').pop() || 'unknown';
            console.error(`[CompleteChallenge] Failed to cleanup image ${filename}:`, cleanupError);
            failedPaths.push(savedPath);
          }
        }
        if (failedPaths.length > 0) {
          // MEDIUM FIX: Log only count, not full paths to prevent info disclosure
          console.error(`[CompleteChallenge] ORPHAN IMAGES: ${failedPaths.length} image(s) failed cleanup`);
        }
        return failedPaths;
      };

      try {
        await connection.beginTransaction();

        // CRITICAL FIX: Re-verify pending status INSIDE transaction with row lock
        // This prevents race conditions where status changes between initial check and transaction
        const lockedPending = await PendingRedemptionModel.findByIdAndUserForUpdate(id, userId, connection);
        if (!lockedPending) {
          await connection.rollback();
          await cleanupImages();
          return res.status(404).json({ message: 'Redención no encontrada' });
        }

        // Re-check status inside transaction (state could have changed)
        if (lockedPending.status !== 'challenge_assigned') {
          await connection.rollback();
          await cleanupImages();
          const statusMessages: Record<string, { message: string; code: string }> = {
            expired: { message: 'Esta redención expiró. Ya perdiste la vida asociada.', code: 'REDEMPTION_EXPIRED' },
            redeemed_life: { message: 'Ya redimiste esta falla con una vida.', code: 'ALREADY_REDEEMED_LIFE' },
            redeemed_challenge: { message: 'Ya completaste el challenge.', code: 'ALREADY_COMPLETED' },
            pending: { message: 'Primero debes elegir un challenge.', code: 'NO_CHALLENGE_ASSIGNED' },
          };
          const errorInfo = statusMessages[lockedPending.status] || {
            message: 'Estado inválido para enviar prueba',
            code: 'INVALID_STATUS',
          };
          return res.status(400).json({
            message: errorInfo.message,
            error_code: errorInfo.code,
            current_status: lockedPending.status,
          });
        }

        // Re-check expiration inside transaction
        if (new Date(lockedPending.expires_at) < new Date()) {
          await connection.rollback();
          await cleanupImages();
          return res.status(400).json({
            message: 'El tiempo para completar el challenge expiró.',
            error_code: 'REDEMPTION_TIME_EXPIRED',
            expired_at: lockedPending.expires_at,
          });
        }

        // CRITICAL FIX: Check for existing validation INSIDE transaction with row lock
        const existingValidation = await PendingValidationModel.findPendingForRedemptionWithLock(id, connection);
        if (existingValidation) {
          await connection.rollback();
          await cleanupImages();
          return res.status(400).json({
            message: 'Ya enviaste una prueba que está en revisión. Espera a que sea validada.',
            error_code: 'VALIDATION_PENDING',
            validation_id: existingValidation.id,
            expires_at: existingValidation.expires_at,
          });
        }

        // CRITICAL FIX: Check retry count INSIDE transaction
        const MAX_RETRY_ATTEMPTS = 3;
        const rejectedCount = await PendingValidationModel.countRejectedForRedemption(id, connection);
        if (rejectedCount >= MAX_RETRY_ATTEMPTS) {
          await connection.rollback();
          await cleanupImages();
          return res.status(400).json({
            message: `Has alcanzado el límite de ${MAX_RETRY_ATTEMPTS} intentos rechazados. No puedes enviar más pruebas.`,
            error_code: 'MAX_RETRIES_EXCEEDED',
            rejected_attempts: rejectedCount,
            max_attempts: MAX_RETRY_ATTEMPTS,
          });
        }

        // Create pending validation entry (store file paths instead of base64)
        const validationId = await PendingValidationModel.create(
          {
            pendingRedemptionId: id,
            userId,
            challengeId: pending.challenge_id!,
            proofText: proof_text,
            proofImageUrls: storedImagePaths, // Store array of file paths
            proofType,
            challengeTitle: challenge?.title || 'Challenge',
            challengeDescription: challenge?.description || '',
            challengeDifficulty: challenge?.difficulty || 'medium',
            habitName,
            userEmail,
          },
          connection,
        );

        await connection.commit();

        res.json({
          success: true,
          message: 'Prueba enviada. Será revisada y recibirás una notificación con el resultado.',
          validation_id: validationId,
          status: 'pending_review',
          estimated_review_time: '1 hora máximo',
        });
      } catch (innerError) {
        try {
          await connection.rollback();
        } catch {
          // Ignore rollback errors
        }
        await cleanupImages();
        throw innerError;
      }
    } catch (error) {
      console.error('Error submitting challenge proof:', error);
      res.status(500).json({ message: 'Error al enviar prueba' });
    } finally {
      safeReleaseConnection(connection);
    }
  }

  /**
   * GET /pending-redemptions/:id/validation-status
   * Check the status of a submitted proof validation
   */
  static async getValidationStatus(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Verify the pending redemption belongs to user
      const pending = await PendingRedemptionModel.findByIdAndUser(id, userId);
      if (!pending) {
        return res.status(404).json({ message: 'Redención no encontrada' });
      }

      // Get validation status
      const validation = await PendingValidationModel.findByPendingRedemptionId(id);

      if (!validation) {
        return res.json({
          success: true,
          has_validation: false,
          message: 'No hay prueba enviada para esta redención',
        });
      }

      res.json({
        success: true,
        has_validation: true,
        validation: {
          id: validation.id,
          status: validation.status,
          created_at: validation.created_at,
          expires_at: validation.expires_at,
          reviewed_at: validation.reviewed_at,
          reviewer_notes: validation.reviewer_notes,
          ai_result: validation.ai_result,
        },
      });
    } catch (error) {
      console.error('Error getting validation status:', error);
      res.status(500).json({ message: 'Error al obtener estado de validación' });
    }
  }
}
