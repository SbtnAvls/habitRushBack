import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';
import { reviveUser } from './habit-evaluation.service';
import { grantChallengeCompletionXp } from './xp.service';
import { validateChallengeWithAI, checkLMStudioHealth } from './lmstudio.service';

export interface ChallengeProof {
  id: string;
  user_challenge_id: string;
  proof_text?: string;
  proof_image_url?: string;
  proof_image_base64?: string;
  proof_type: 'text' | 'image' | 'both';
  validation_status: 'pending' | 'approved' | 'rejected';
  validation_result?: string;
  validated_at?: Date;
  created_at: Date;
}

export interface ValidationResult {
  is_valid: boolean;
  confidence_score: number;
  reasoning: string;
}

/**
 * Extrae el tipo MIME y los datos base64 de una URL de datos
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return null;
}

/**
 * Valida las pruebas enviadas para un challenge usando AI (LM Studio con GLM-4V)
 * Requiere que LM Studio esté disponible - no hay fallback permisivo
 * Note: This is the legacy validation system, used for revival challenges.
 * The new pending-redemption system uses proof_image_urls (array of 1-2 images).
 */
async function validateWithAI(proof: ChallengeProof, challengeDetails: RowDataPacket): Promise<ValidationResult> {
  // Check if LM Studio is available
  const isLMStudioAvailable = await checkLMStudioHealth();

  if (!isLMStudioAvailable) {
    console.error('[ChallengeValidation] LM Studio not available');
    throw new Error('Servicio de validación AI no disponible. Intenta más tarde.');
  }

  // Prepare image data if available (legacy: single image)
  const proofImages: Array<{ base64: string; mimeType: string }> = [];

  if (proof.proof_image_base64) {
    // Image already in base64 format
    proofImages.push({ base64: proof.proof_image_base64, mimeType: 'image/jpeg' });
  } else if (proof.proof_image_url) {
    // Check if it's a data URL
    const parsed = parseDataUrl(proof.proof_image_url);
    if (parsed) {
      proofImages.push({ base64: parsed.base64, mimeType: parsed.mimeType });
    }
    // Note: For external URLs, we'd need to fetch and convert to base64
    // For now, we only support data URLs and direct base64
  }

  // Call LM Studio for validation
  const result = await validateChallengeWithAI({
    challengeTitle: challengeDetails.title || 'Challenge',
    challengeDescription: challengeDetails.description || '',
    challengeDifficulty: challengeDetails.difficulty || 'medium',
    proofText: proof.proof_text,
    proofImages: proofImages.length > 0 ? proofImages : undefined,
  });

  return {
    is_valid: result.isValid,
    confidence_score: result.confidenceScore,
    reasoning: result.reasoning,
  };
}

/**
 * Envía pruebas para completar un challenge cuando el usuario no tiene vidas
 */
export async function submitChallengeProof(
  userId: string,
  userChallengeId: string,
  proofText?: string,
  proofImageUrl?: string,
): Promise<{ success: boolean; message: string; validationResult?: ValidationResult }> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verificar que el user challenge existe y está asignado al usuario
    const [userChallenges] = await connection.execute<RowDataPacket[]>(
      `SELECT uc.*, c.title, c.description, c.difficulty
       FROM USER_CHALLENGES uc
       JOIN CHALLENGES c ON uc.challenge_id = c.id
       WHERE uc.id = ?
       AND uc.user_id = ?
       AND uc.status = 'assigned'`,
      [userChallengeId, userId],
    );

    if (userChallenges.length === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Challenge no encontrado o no está asignado',
      };
    }

    // 2. Verificar que el usuario no tiene vidas
    const [users] = await connection.execute<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [
      userId,
    ]);

    if (users[0].lives > 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Este sistema de validación solo se usa cuando no tienes vidas',
      };
    }

    // 3. Determinar el tipo de prueba
    let proofType: 'text' | 'image' | 'both';
    if (proofText && proofImageUrl) {
      proofType = 'both';
    } else if (proofText) {
      proofType = 'text';
    } else if (proofImageUrl) {
      proofType = 'image';
    } else {
      await connection.rollback();
      return {
        success: false,
        message: 'Debes proporcionar al menos una prueba (texto o imagen)',
      };
    }

    // 4. Crear registro de prueba
    const proofId = uuidv4();
    const proof: ChallengeProof = {
      id: proofId,
      user_challenge_id: userChallengeId,
      proof_text: proofText,
      proof_image_url: proofImageUrl,
      proof_type: proofType,
      validation_status: 'pending',
      created_at: new Date(),
    };

    await connection.execute(
      `INSERT INTO CHALLENGE_PROOFS
       (id, user_challenge_id, proof_text, proof_image_url, proof_type, validation_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [proofId, userChallengeId, proofText, proofImageUrl, proofType, 'pending'],
    );

    // 5. Validar con AI
    const validationResult = await validateWithAI(proof, userChallenges[0]);

    // 6. Actualizar el resultado de la validación
    const validationStatus = validationResult.is_valid ? 'approved' : 'rejected';
    await connection.execute(
      `UPDATE CHALLENGE_PROOFS
       SET validation_status = ?,
           validation_result = ?,
           validated_at = NOW()
       WHERE id = ?`,
      [validationStatus, JSON.stringify(validationResult), proofId],
    );

    // 7. Si la validación fue exitosa
    if (validationResult.is_valid) {
      // Marcar el challenge como completado
      await connection.execute(
        `UPDATE USER_CHALLENGES
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = ?`,
        [userChallengeId],
      );

      // Registrar en LIFE_HISTORY
      const historyId = uuidv4();
      await connection.execute(
        `INSERT INTO LIFE_HISTORY
         (id, user_id, lives_change, current_lives, reason, related_user_challenge_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [historyId, userId, 0, 0, 'challenge_completed', userChallengeId],
      );

      // Grant XP for completing the challenge (within transaction)
      await grantChallengeCompletionXp(userId, connection);

      // Revivir al usuario (restaurar vidas y reactivar hábitos)
      await connection.commit();
      await reviveUser(userId);

      return {
        success: true,
        message: 'Challenge completado exitosamente. ¡Has sido revivido con todas tus vidas!',
        validationResult,
      };
    } else {
      await connection.commit();
      return {
        success: false,
        message: 'Las pruebas no fueron suficientes para validar el challenge. Intenta nuevamente.',
        validationResult,
      };
    }
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting challenge proof:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Obtiene el estado de validación de las pruebas de un challenge
 */
export async function getChallengeProofStatus(userId: string, userChallengeId: string): Promise<ChallengeProof | null> {
  const connection = await pool.getConnection();

  try {
    const [proofs] = await connection.execute<RowDataPacket[]>(
      `SELECT cp.*
       FROM CHALLENGE_PROOFS cp
       JOIN USER_CHALLENGES uc ON cp.user_challenge_id = uc.id
       WHERE cp.user_challenge_id = ?
       AND uc.user_id = ?
       ORDER BY cp.created_at DESC
       LIMIT 1`,
      [userChallengeId, userId],
    );

    if (proofs.length === 0) {
      return null;
    }

    const proof = proofs[0];
    return {
      id: proof.id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      user_challenge_id: userChallengeId,
      proof_text: proof.proof_text,
      proof_image_url: proof.proof_image_url,
      proof_type: proof.proof_type,
      validation_status: proof.validation_status,
      // LOW FIX: Safe JSON.parse with try-catch to handle corrupted data
      validation_result: proof.validation_result ? (() => {
        try { return JSON.parse(proof.validation_result); }
        catch { return undefined; }
      })() : undefined,
      validated_at: proof.validated_at,
      created_at: proof.created_at,
    };
  } finally {
    connection.release();
  }
}

interface AvailableChallenge {
  user_challenge_id: string;
  challenge_id: string;
  title: string;
  description: string;
  difficulty: string;
  type: string;
  estimated_time: number;
  habit_name: string;
  assigned_at: Date;
}

/**
 * Lista todos los challenges disponibles para un usuario sin vidas
 */
export async function getAvailableChallengesForRevival(userId: string): Promise<AvailableChallenge[]> {
  const connection = await pool.getConnection();

  try {
    // Obtener challenges asignados que no han sido completados
    const [challenges] = await connection.execute<RowDataPacket[]>(
      `SELECT
        uc.id as user_challenge_id,
        c.id as challenge_id,
        c.title,
        c.description,
        c.difficulty,
        c.type,
        c.estimated_time,
        h.name as habit_name,
        uc.assigned_at
       FROM USER_CHALLENGES uc
       JOIN CHALLENGES c ON uc.challenge_id = c.id
       JOIN HABITS h ON uc.habit_id = h.id
       WHERE uc.user_id = ?
       AND uc.status = 'assigned'
       AND c.is_active = 1`,
      [userId],
    );

    return challenges.map(c => ({
      user_challenge_id: c.user_challenge_id
        .toString('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      challenge_id: c.challenge_id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      type: c.type,
      estimated_time: c.estimated_time,
      habit_name: c.habit_name,
      assigned_at: c.assigned_at,
    }));
  } finally {
    connection.release();
  }
}
