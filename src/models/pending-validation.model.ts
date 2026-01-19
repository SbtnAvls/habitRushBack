import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export type ValidationStatus =
  | 'pending_review'
  | 'approved_manual'
  | 'rejected_manual'
  | 'approved_ai'
  | 'rejected_ai';

/**
 * Valid status values for validation
 */
export const VALID_VALIDATION_STATUSES: ValidationStatus[] = [
  'pending_review',
  'approved_manual',
  'rejected_manual',
  'approved_ai',
  'rejected_ai',
];

/**
 * Check if a status string is a valid ValidationStatus
 */
export function isValidStatus(status: string): status is ValidationStatus {
  return VALID_VALIDATION_STATUSES.includes(status as ValidationStatus);
}

export interface PendingValidation {
  id: string;
  pending_redemption_id: string;
  user_id: string;
  challenge_id: string;
  proof_text?: string;
  proof_image_urls?: string[]; // Array of 1-2 image file paths
  proof_type: 'text' | 'image' | 'both';
  status: ValidationStatus;
  reviewer_notes?: string;
  reviewed_by?: string;
  reviewed_at?: Date;
  ai_result?: {
    is_valid: boolean;
    confidence_score: number;
    reasoning: string;
  };
  ai_validated_at?: Date;
  challenge_title: string;
  challenge_description: string;
  challenge_difficulty: string;
  habit_name: string;
  user_email: string;
  created_at: Date;
  expires_at: Date;
}

interface PendingValidationRow extends RowDataPacket, PendingValidation {}

/**
 * Safely parse JSON from database field
 * HIGH FIX: Returns undefined instead of throwing on invalid JSON
 */
function safeJsonParse<T>(value: unknown, fieldName: string): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value as string) as T;
  } catch (error) {
    console.error(`[PendingValidation] Failed to parse ${fieldName} JSON:`, error);
    return undefined;
  }
}

/**
 * Helper function to parse a validation row from database
 * HIGH FIX: Uses safe JSON parsing to prevent crashes on corrupted data
 */
function parseValidationRow(row: PendingValidationRow): PendingValidation {
  return {
    ...row,
    ai_result: safeJsonParse<PendingValidation['ai_result']>(row.ai_result, 'ai_result'),
    proof_image_urls: safeJsonParse<string[]>(row.proof_image_urls, 'proof_image_urls'),
  };
}

export class PendingValidationModel {
  /**
   * Create a new pending validation entry
   * Sets expires_at to 1 hour from now
   */
  static async create(
    data: {
      pendingRedemptionId: string;
      userId: string;
      challengeId: string;
      proofText?: string;
      proofImageUrls?: string[]; // Array of 1-2 image file paths
      proofType: 'text' | 'image' | 'both';
      challengeTitle: string;
      challengeDescription: string;
      challengeDifficulty: string;
      habitName: string;
      userEmail: string;
    },
    connection?: PoolConnection,
  ): Promise<string> {
    const conn = connection || pool;
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store image URLs as JSON array
    const proofImageUrlsJson =
      data.proofImageUrls && data.proofImageUrls.length > 0 ? JSON.stringify(data.proofImageUrls) : null;

    await conn.query(
      `INSERT INTO PENDING_VALIDATIONS (
        id, pending_redemption_id, user_id, challenge_id,
        proof_text, proof_image_urls, proof_type,
        challenge_title, challenge_description, challenge_difficulty,
        habit_name, user_email, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.pendingRedemptionId,
        data.userId,
        data.challengeId,
        data.proofText || null,
        proofImageUrlsJson,
        data.proofType,
        data.challengeTitle,
        data.challengeDescription,
        data.challengeDifficulty,
        data.habitName,
        data.userEmail,
        expiresAt,
      ],
    );

    return id;
  }

  /**
   * Get all pending validations for admin dashboard
   */
  static async getAllPending(): Promise<PendingValidation[]> {
    const [rows] = await pool.query<PendingValidationRow[]>(
      `SELECT * FROM PENDING_VALIDATIONS
       WHERE status = 'pending_review'
       ORDER BY created_at ASC`,
    );
    return rows.map(parseValidationRow);
  }

  /**
   * Get all validations with filters for dashboard
   */
  static async getAll(filters?: {
    status?: ValidationStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ validations: PendingValidation[]; total: number }> {
    let whereClause = '1=1';
    const params: (string | number)[] = [];

    // SECURITY: Validate status against enum to prevent SQL injection
    if (filters?.status) {
      if (!isValidStatus(filters.status)) {
        throw new Error(`Invalid validation status: ${filters.status}`);
      }
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }

    // Get total count
    const [countResult] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM PENDING_VALIDATIONS WHERE ${whereClause}`,
      params,
    );
    const total = countResult[0].total;

    // Get paginated results
    let query = `SELECT * FROM PENDING_VALIDATIONS WHERE ${whereClause} ORDER BY created_at DESC`;

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [rows] = await pool.query<PendingValidationRow[]>(query, params);

    return {
      validations: rows.map(parseValidationRow),
      total,
    };
  }

  /**
   * Get a single validation by ID
   */
  static async findById(id: string, connection?: PoolConnection): Promise<PendingValidation | null> {
    const conn = connection || pool;
    const [rows] = await conn.query<PendingValidationRow[]>('SELECT * FROM PENDING_VALIDATIONS WHERE id = ?', [id]);

    if (rows.length === 0) return null;

    return parseValidationRow(rows[0]);
  }

  /**
   * Get a single validation by ID with row lock (FOR UPDATE)
   * Must be used within a transaction to prevent race conditions
   */
  static async findByIdForUpdate(id: string, connection: PoolConnection): Promise<PendingValidation | null> {
    const [rows] = await connection.query<PendingValidationRow[]>(
      'SELECT * FROM PENDING_VALIDATIONS WHERE id = ? FOR UPDATE',
      [id],
    );

    if (rows.length === 0) return null;

    return parseValidationRow(rows[0]);
  }

  /**
   * Get validations that have expired (past 1 hour) and still pending
   */
  static async getExpiredPending(): Promise<PendingValidation[]> {
    const [rows] = await pool.query<PendingValidationRow[]>(
      `SELECT * FROM PENDING_VALIDATIONS
       WHERE status = 'pending_review'
       AND expires_at < NOW()
       ORDER BY created_at ASC`,
    );

    return rows.map(parseValidationRow);
  }

  /**
   * Approve manually by admin
   * Returns true if update was successful, false if already processed (atomic check)
   */
  static async approveManual(
    id: string,
    adminId: string,
    notes?: string,
    connection?: PoolConnection,
  ): Promise<boolean> {
    const conn = connection || pool;
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE PENDING_VALIDATIONS
       SET status = 'approved_manual',
           reviewed_by = ?,
           reviewer_notes = ?,
           reviewed_at = NOW()
       WHERE id = ? AND status = 'pending_review'`,
      [adminId, notes || null, id],
    );
    return result.affectedRows > 0;
  }

  /**
   * Reject manually by admin
   * Returns true if update was successful, false if already processed (atomic check)
   */
  static async rejectManual(
    id: string,
    adminId: string,
    notes?: string,
    connection?: PoolConnection,
  ): Promise<boolean> {
    const conn = connection || pool;
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE PENDING_VALIDATIONS
       SET status = 'rejected_manual',
           reviewed_by = ?,
           reviewer_notes = ?,
           reviewed_at = NOW()
       WHERE id = ? AND status = 'pending_review'`,
      [adminId, notes || null, id],
    );
    return result.affectedRows > 0;
  }

  /**
   * Mark as validated by AI
   * Returns true if update was successful, false if already processed (atomic check)
   */
  static async setAIResult(
    id: string,
    result: { is_valid: boolean; confidence_score: number; reasoning: string },
    connection?: PoolConnection,
  ): Promise<boolean> {
    const conn = connection || pool;
    const status = result.is_valid ? 'approved_ai' : 'rejected_ai';

    const [updateResult] = await conn.query<ResultSetHeader>(
      `UPDATE PENDING_VALIDATIONS
       SET status = ?,
           ai_result = ?,
           ai_validated_at = NOW()
       WHERE id = ? AND status = 'pending_review'`,
      [status, JSON.stringify(result), id],
    );
    return updateResult.affectedRows > 0;
  }

  /**
   * Increment AI retry count and record error
   * Returns the new retry count
   */
  static async incrementRetryCount(id: string, errorMessage: string): Promise<number> {
    await pool.query(
      `UPDATE PENDING_VALIDATIONS
       SET ai_retry_count = ai_retry_count + 1,
           last_ai_error = ?
       WHERE id = ?`,
      [errorMessage, id],
    );

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT ai_retry_count FROM PENDING_VALIDATIONS WHERE id = ?',
      [id],
    );

    return rows[0]?.ai_retry_count || 0;
  }

  /**
   * Get validations that have failed AI processing multiple times
   * Used for alerting admins
   */
  static async getFailedAIValidations(minRetries: number = 3): Promise<PendingValidation[]> {
    const [rows] = await pool.query<PendingValidationRow[]>(
      `SELECT * FROM PENDING_VALIDATIONS
       WHERE status = 'pending_review'
       AND ai_retry_count >= ?
       ORDER BY created_at ASC`,
      [minRetries],
    );

    return rows.map(parseValidationRow);
  }

  /**
   * Get statistics for dashboard
   */
  static async getStats(): Promise<{
    total: number;
    pending_review: number;
    approved_manual: number;
    rejected_manual: number;
    approved_ai: number;
    rejected_ai: number;
    avg_review_time_minutes: number;
    avg_manual_review_time_minutes: number;
    avg_ai_review_time_minutes: number;
  }> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending_review,
        SUM(CASE WHEN status = 'approved_manual' THEN 1 ELSE 0 END) as approved_manual,
        SUM(CASE WHEN status = 'rejected_manual' THEN 1 ELSE 0 END) as rejected_manual,
        SUM(CASE WHEN status = 'approved_ai' THEN 1 ELSE 0 END) as approved_ai,
        SUM(CASE WHEN status = 'rejected_ai' THEN 1 ELSE 0 END) as rejected_ai,
        AVG(
          CASE
            WHEN reviewed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, reviewed_at)
            WHEN ai_validated_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, ai_validated_at)
            ELSE NULL
          END
        ) as avg_review_time_minutes,
        AVG(
          CASE
            WHEN reviewed_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, reviewed_at)
            ELSE NULL
          END
        ) as avg_manual_review_time_minutes,
        AVG(
          CASE
            WHEN ai_validated_at IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, created_at, ai_validated_at)
            ELSE NULL
          END
        ) as avg_ai_review_time_minutes
      FROM PENDING_VALIDATIONS
    `);

    return {
      total: rows[0].total || 0,
      pending_review: rows[0].pending_review || 0,
      approved_manual: rows[0].approved_manual || 0,
      rejected_manual: rows[0].rejected_manual || 0,
      approved_ai: rows[0].approved_ai || 0,
      rejected_ai: rows[0].rejected_ai || 0,
      avg_review_time_minutes: Math.round(rows[0].avg_review_time_minutes || 0),
      avg_manual_review_time_minutes: Math.round(rows[0].avg_manual_review_time_minutes || 0),
      avg_ai_review_time_minutes: Math.round(rows[0].avg_ai_review_time_minutes || 0),
    };
  }

  /**
   * Check if a pending redemption already has a pending validation
   */
  static async existsForPendingRedemption(pendingRedemptionId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM PENDING_VALIDATIONS
       WHERE pending_redemption_id = ?
       AND status = 'pending_review'`,
      [pendingRedemptionId],
    );
    return rows.length > 0;
  }

  /**
   * Get validation by pending redemption ID
   */
  static async findByPendingRedemptionId(pendingRedemptionId: string): Promise<PendingValidation | null> {
    const [rows] = await pool.query<PendingValidationRow[]>(
      `SELECT * FROM PENDING_VALIDATIONS
       WHERE pending_redemption_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [pendingRedemptionId],
    );

    if (rows.length === 0) return null;

    return parseValidationRow(rows[0]);
  }

  /**
   * Count rejected validations for a pending redemption
   * Used to limit retry attempts
   */
  static async countRejectedForRedemption(
    pendingRedemptionId: string,
    connection?: PoolConnection,
  ): Promise<number> {
    const conn = connection || pool;
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM PENDING_VALIDATIONS
       WHERE pending_redemption_id = ?
       AND status IN ('rejected_manual', 'rejected_ai')`,
      [pendingRedemptionId],
    );
    return rows[0].count;
  }

  /**
   * Check if a pending validation exists for a redemption (with row lock for transaction safety)
   * Returns the pending validation if found, null otherwise
   * MUST be called within a transaction for the lock to work
   */
  static async findPendingForRedemptionWithLock(
    pendingRedemptionId: string,
    connection: PoolConnection,
  ): Promise<PendingValidation | null> {
    const [rows] = await connection.query<PendingValidationRow[]>(
      `SELECT * FROM PENDING_VALIDATIONS
       WHERE pending_redemption_id = ?
       AND status = 'pending_review'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [pendingRedemptionId],
    );

    if (rows.length === 0) return null;

    return parseValidationRow(rows[0]);
  }

  /**
   * Delete old processed validations to prevent database bloat
   * Keeps validations for the specified number of days
   * Only deletes validations that have been processed (not pending_review)
   */
  static async cleanupOldValidations(keepDays: number = 30): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM PENDING_VALIDATIONS
       WHERE status != 'pending_review'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [keepDays],
    );
    return result.affectedRows;
  }

  /**
   * Get count of validations that would be cleaned up
   * Useful for previewing before actual cleanup
   */
  static async countOldValidations(keepDays: number = 30): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM PENDING_VALIDATIONS
       WHERE status != 'pending_review'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [keepDays],
    );
    return rows[0].count;
  }
}
