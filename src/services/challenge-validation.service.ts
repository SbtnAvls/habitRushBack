import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { reviveUser } from './habit-evaluation.service';

export interface ChallengeProof {
  id: string;
  user_challenge_id: string;
  proof_text?: string;
  proof_image_url?: string;
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
 * Valida las pruebas enviadas para un challenge usando AI
 * Por ahora es una simulación, pero aquí se integraría con un servicio de AI real
 */
async function validateWithAI(proof: ChallengeProof, challengeDetails: any): Promise<ValidationResult> {
  // TODO: Integrar con servicio de AI real (OpenAI, Anthropic, etc.)
  // Por ahora, simulamos una validación básica

  // En producción, aquí se enviaría:
  // - El texto del challenge
  // - Los requisitos específicos
  // - Las pruebas (texto/imagen)
  // A un modelo de AI para validación

  // Simulación de validación
  const hasText = proof.proof_text && proof.proof_text.length > 20;
  const hasImage = proof.proof_image_url && proof.proof_image_url.length > 0;

  // Lógica temporal de validación
  if (proof.proof_type === 'both' && hasText && hasImage) {
    return {
      is_valid: true,
      confidence_score: 0.85,
      reasoning: 'Pruebas de texto e imagen proporcionadas. Validación aprobada.'
    };
  } else if (proof.proof_type === 'text' && hasText) {
    return {
      is_valid: true,
      confidence_score: 0.75,
      reasoning: 'Descripción detallada proporcionada. Validación aprobada.'
    };
  } else if (proof.proof_type === 'image' && hasImage) {
    return {
      is_valid: true,
      confidence_score: 0.70,
      reasoning: 'Evidencia fotográfica proporcionada. Validación aprobada.'
    };
  }

  return {
    is_valid: false,
    confidence_score: 0.2,
    reasoning: 'Pruebas insuficientes o no cumplen con los requisitos del reto.'
  };
}

/**
 * Envía pruebas para completar un challenge cuando el usuario no tiene vidas
 */
export async function submitChallengeProof(
  userId: string,
  userChallengeId: string,
  proofText?: string,
  proofImageUrl?: string
): Promise<{ success: boolean; message: string; validationResult?: ValidationResult }> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verificar que el user challenge existe y está asignado al usuario
    const [userChallenges] = await connection.execute<any[]>(
      `SELECT uc.*, c.title, c.description, c.difficulty
       FROM USER_CHALLENGES uc
       JOIN CHALLENGES c ON uc.challenge_id = c.id
       WHERE uc.id = UUID_TO_BIN(?)
       AND uc.user_id = UUID_TO_BIN(?)
       AND uc.status = 'assigned'`,
      [userChallengeId, userId]
    );

    if (userChallenges.length === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Challenge no encontrado o no está asignado'
      };
    }

    // 2. Verificar que el usuario no tiene vidas
    const [users] = await connection.execute<any[]>(
      `SELECT lives FROM USERS WHERE id = UUID_TO_BIN(?)`,
      [userId]
    );

    if (users[0].lives > 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Este sistema de validación solo se usa cuando no tienes vidas'
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
        message: 'Debes proporcionar al menos una prueba (texto o imagen)'
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
      created_at: new Date()
    };

    await connection.execute(
      `INSERT INTO CHALLENGE_PROOFS
       (id, user_challenge_id, proof_text, proof_image_url, proof_type, validation_status)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?)`,
      [proofId, userChallengeId, proofText, proofImageUrl, proofType, 'pending']
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
       WHERE id = UUID_TO_BIN(?)`,
      [validationStatus, JSON.stringify(validationResult), proofId]
    );

    // 7. Si la validación fue exitosa
    if (validationResult.is_valid) {
      // Marcar el challenge como completado
      await connection.execute(
        `UPDATE USER_CHALLENGES
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = UUID_TO_BIN(?)`,
        [userChallengeId]
      );

      // Registrar en LIFE_HISTORY
      const historyId = uuidv4();
      await connection.execute(
        `INSERT INTO LIFE_HISTORY
         (id, user_id, lives_change, current_lives, reason, related_user_challenge_id, created_at)
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, UUID_TO_BIN(?), NOW())`,
        [historyId, userId, 0, 0, 'challenge_completed', userChallengeId]
      );

      // Revivir al usuario (restaurar vidas y reactivar hábitos)
      await connection.commit();
      await reviveUser(userId);

      return {
        success: true,
        message: 'Challenge completado exitosamente. ¡Has sido revivido con todas tus vidas!',
        validationResult
      };
    } else {
      await connection.commit();
      return {
        success: false,
        message: 'Las pruebas no fueron suficientes para validar el challenge. Intenta nuevamente.',
        validationResult
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
export async function getChallengeProofStatus(
  userId: string,
  userChallengeId: string
): Promise<ChallengeProof | null> {
  const connection = await pool.getConnection();

  try {
    const [proofs] = await connection.execute<any[]>(
      `SELECT cp.*
       FROM CHALLENGE_PROOFS cp
       JOIN USER_CHALLENGES uc ON cp.user_challenge_id = uc.id
       WHERE cp.user_challenge_id = UUID_TO_BIN(?)
       AND uc.user_id = UUID_TO_BIN(?)
       ORDER BY cp.created_at DESC
       LIMIT 1`,
      [userChallengeId, userId]
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
      validation_result: proof.validation_result ? JSON.parse(proof.validation_result) : undefined,
      validated_at: proof.validated_at,
      created_at: proof.created_at
    };

  } finally {
    connection.release();
  }
}

/**
 * Lista todos los challenges disponibles para un usuario sin vidas
 */
export async function getAvailableChallengesForRevival(userId: string): Promise<any[]> {
  const connection = await pool.getConnection();

  try {
    // Obtener challenges asignados que no han sido completados
    const [challenges] = await connection.execute<any[]>(
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
       WHERE uc.user_id = UUID_TO_BIN(?)
       AND uc.status = 'assigned'
       AND c.is_active = 1`,
      [userId]
    );

    return challenges.map(c => ({
      user_challenge_id: c.user_challenge_id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      challenge_id: c.challenge_id.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      type: c.type,
      estimated_time: c.estimated_time,
      habit_name: c.habit_name,
      assigned_at: c.assigned_at
    }));

  } finally {
    connection.release();
  }
}