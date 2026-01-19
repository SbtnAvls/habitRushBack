import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  PendingValidationModel,
  ValidationStatus,
  isValidStatus,
  VALID_VALIDATION_STATUSES,
} from '../models/pending-validation.model';
import { NotificationModel } from '../models/notification.model';
import { applyApprovalResult } from '../services/validation-processor.service';
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

/**
 * Middleware to check if user is admin
 */
export async function requireAdmin(req: AuthRequest, res: Response, next: () => void) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  // HIGH FIX: Also check that user is not deleted (deleted_at IS NULL)
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT is_admin, deleted_at FROM USERS WHERE id = ?',
    [userId]
  );

  // User not found, not admin, or deleted - deny access
  if (rows.length === 0 || !rows[0].is_admin || rows[0].deleted_at !== null) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
}

export class AdminValidationController {
  /**
   * GET /admin/validations
   * List all validations with optional filters
   */
  static async list(req: AuthRequest, res: Response) {
    try {
      const { status, limit = '50', offset = '0' } = req.query;

      // CRITICAL FIX: Validate status enum to prevent SQL injection or unexpected behavior
      let validatedStatus: ValidationStatus | undefined;
      if (status) {
        if (!isValidStatus(status as string)) {
          return res.status(400).json({
            message: 'Estado inválido',
            error_code: 'INVALID_STATUS',
            valid_statuses: VALID_VALIDATION_STATUSES,
          });
        }
        validatedStatus = status as ValidationStatus;
      }

      // CRITICAL FIX: Validate pagination parameters
      const parsedLimit = parseInt(limit as string, 10);
      const parsedOffset = parseInt(offset as string, 10);

      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          message: 'Límite inválido. Debe ser un número entre 1 y 100.',
          error_code: 'INVALID_LIMIT',
        });
      }

      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({
          message: 'Offset inválido. Debe ser un número >= 0.',
          error_code: 'INVALID_OFFSET',
        });
      }

      const result = await PendingValidationModel.getAll({
        status: validatedStatus,
        limit: parsedLimit,
        offset: parsedOffset,
      });

      res.json({
        success: true,
        ...result,
        limit: parsedLimit,
        offset: parsedOffset,
      });
    } catch (error) {
      console.error('Error listing validations:', error);
      res.status(500).json({ message: 'Error al listar validaciones' });
    }
  }

  /**
   * GET /admin/validations/pending
   * List only pending validations (quick view for dashboard)
   */
  static async listPending(req: AuthRequest, res: Response) {
    try {
      const validations = await PendingValidationModel.getAllPending();

      res.json({
        success: true,
        validations,
        count: validations.length,
      });
    } catch (error) {
      console.error('Error listing pending validations:', error);
      res.status(500).json({ message: 'Error al listar validaciones pendientes' });
    }
  }

  /**
   * GET /admin/validations/stats
   * Get validation statistics
   */
  static async getStats(req: AuthRequest, res: Response) {
    try {
      const stats = await PendingValidationModel.getStats();

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
  }

  /**
   * GET /admin/validations/:id
   * Get a single validation detail
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const validation = await PendingValidationModel.findById(id);

      if (!validation) {
        return res.status(404).json({ message: 'Validación no encontrada' });
      }

      res.json({
        success: true,
        validation,
      });
    } catch (error) {
      console.error('Error getting validation:', error);
      res.status(500).json({ message: 'Error al obtener validación' });
    }
  }

  /**
   * POST /admin/validations/:id/approve
   * Manually approve a validation
   */
  static async approve(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const adminId = req.user?.id;
      const { id } = req.params;
      const { notes } = req.body;

      if (!adminId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // HIGH FIX: Validate notes field
      if (notes !== undefined && notes !== null) {
        if (typeof notes !== 'string') {
          return res.status(400).json({
            message: 'El campo notes debe ser texto',
            error_code: 'INVALID_NOTES_TYPE',
          });
        }
        if (notes.length > 1000) {
          return res.status(400).json({
            message: 'El campo notes no puede exceder 1000 caracteres',
            error_code: 'NOTES_TOO_LONG',
            max_length: 1000,
          });
        }
      }

      await connection.beginTransaction();

      // CRITICAL FIX: Lock the row and check status INSIDE the transaction to prevent TOCTOU race condition
      const validation = await PendingValidationModel.findByIdForUpdate(id, connection);

      if (!validation) {
        await connection.rollback();
        return res.status(404).json({ message: 'Validación no encontrada' });
      }

      if (validation.status !== 'pending_review') {
        await connection.rollback();
        return res.status(400).json({
          message: 'Esta validación ya fue procesada',
          current_status: validation.status,
        });
      }

      // 1. Mark validation as approved manually (atomic - returns false if already processed)
      const updated = await PendingValidationModel.approveManual(id, adminId, notes, connection);

      if (!updated) {
        await connection.rollback();
        return res.status(409).json({
          message: 'Esta validación ya fue procesada por otro administrador o por la IA',
          error_code: 'ALREADY_PROCESSED',
        });
      }

      // 2. Complete the pending redemption (using shared helper)
      await applyApprovalResult(validation.pending_redemption_id, validation.user_id, connection);

      // 3. Notify the user
      await NotificationModel.create(
        {
          user_id: validation.user_id,
          type: 'challenge_result',
          title: 'Prueba aprobada',
          message: `Tu prueba para "${validation.challenge_title}" fue aprobada. ¡Tu hábito "${validation.habit_name}" ha sido desbloqueado!`,
        },
        connection,
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Validación aprobada manualmente',
        validation_id: id,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error approving validation:', error);
      res.status(500).json({ message: 'Error al aprobar validación' });
    } finally {
      safeReleaseConnection(connection);
    }
  }

  /**
   * POST /admin/validations/:id/reject
   * Manually reject a validation
   */
  static async reject(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const adminId = req.user?.id;
      const { id } = req.params;
      const { notes } = req.body;

      if (!adminId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // HIGH FIX: Validate notes field (required for reject)
      if (!notes) {
        return res.status(400).json({ message: 'Se requiere una razón de rechazo (notes)' });
      }
      if (typeof notes !== 'string') {
        return res.status(400).json({
          message: 'El campo notes debe ser texto',
          error_code: 'INVALID_NOTES_TYPE',
        });
      }
      if (notes.length > 1000) {
        return res.status(400).json({
          message: 'El campo notes no puede exceder 1000 caracteres',
          error_code: 'NOTES_TOO_LONG',
          max_length: 1000,
        });
      }

      await connection.beginTransaction();

      // CRITICAL FIX: Lock the row and check status INSIDE the transaction to prevent TOCTOU race condition
      const validation = await PendingValidationModel.findByIdForUpdate(id, connection);

      if (!validation) {
        await connection.rollback();
        return res.status(404).json({ message: 'Validación no encontrada' });
      }

      if (validation.status !== 'pending_review') {
        await connection.rollback();
        return res.status(400).json({
          message: 'Esta validación ya fue procesada',
          current_status: validation.status,
        });
      }

      // 1. Mark validation as rejected manually (atomic - returns false if already processed)
      const updated = await PendingValidationModel.rejectManual(id, adminId, notes, connection);

      if (!updated) {
        await connection.rollback();
        return res.status(409).json({
          message: 'Esta validación ya fue procesada por otro administrador o por la IA',
          error_code: 'ALREADY_PROCESSED',
        });
      }

      // 2. The pending redemption stays in 'challenge_assigned' status
      // User can retry with another proof

      // 3. Notify the user about rejection
      await NotificationModel.create(
        {
          user_id: validation.user_id,
          type: 'challenge_result',
          title: 'Prueba rechazada',
          message: `Tu prueba para "${validation.challenge_title}" fue rechazada. Razón: ${notes}. Puedes enviar una nueva prueba.`,
        },
        connection,
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Validación rechazada. El usuario puede enviar nueva prueba.',
        validation_id: id,
        rejection_reason: notes,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error rejecting validation:', error);
      res.status(500).json({ message: 'Error al rechazar validación' });
    } finally {
      safeReleaseConnection(connection);
    }
  }

  /**
   * POST /admin/validations/:id/run-ai
   * Manually trigger AI validation (for testing)
   */
  static async runAI(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const { id } = req.params;

      await connection.beginTransaction();

      // HIGH FIX: Use row lock to prevent TOCTOU race condition
      const validation = await PendingValidationModel.findByIdForUpdate(id, connection);

      if (!validation) {
        await connection.rollback();
        return res.status(404).json({ message: 'Validación no encontrada' });
      }

      if (validation.status !== 'pending_review') {
        await connection.rollback();
        return res.status(400).json({
          message: 'Esta validación ya fue procesada',
          current_status: validation.status,
        });
      }

      // Release lock before AI call (AI processing has its own transaction)
      await connection.commit();

      // Import here to avoid circular dependency
      const { processValidationWithAI } = await import('../services/validation-processor.service');

      const result = await processValidationWithAI(validation);

      if (!result.applied) {
        // Another process (admin or cron) already processed this validation
        return res.status(409).json({
          success: false,
          message: 'Esta validación ya fue procesada por otro proceso',
          validation_id: id,
          ai_result: result,
        });
      }

      res.json({
        success: true,
        message: 'Validación procesada por AI',
        validation_id: id,
        ai_result: result,
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Ignore rollback errors
      }
      console.error('Error running AI validation:', error);
      res.status(500).json({ message: 'Error al ejecutar validación AI' });
    } finally {
      safeReleaseConnection(connection);
    }
  }
}
