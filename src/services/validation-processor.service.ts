import { PendingValidationModel, PendingValidation } from '../models/pending-validation.model';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { NotificationModel } from '../models/notification.model';
import { onChallengeCompleted } from './stats.service';
import { validateChallengeWithAI, checkLMStudioHealth } from './lmstudio.service';
import { loadProofImageAsBase64, isStoredFilePath } from './file-storage.service';
import pool from '../db';
import { RowDataPacket } from 'mysql2';

export interface AIValidationResult {
  is_valid: boolean;
  confidence_score: number;
  reasoning: string;
  applied: boolean; // true if result was applied, false if already processed by another process
}

/**
 * Process a single validation with AI
 */
export async function processValidationWithAI(validation: PendingValidation): Promise<AIValidationResult> {
  const connection = await pool.getConnection();

  try {
    // Prepare image data (now supports multiple images)
    const proofImages: Array<{ base64: string; mimeType: string }> = [];

    if (validation.proof_image_urls && validation.proof_image_urls.length > 0) {
      for (const imageUrl of validation.proof_image_urls) {
        // Check if it's a stored file path or legacy base64 data URL
        if (isStoredFilePath(imageUrl)) {
          // Load image from disk
          const dataUrl = await loadProofImageAsBase64(imageUrl);
          if (dataUrl) {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              proofImages.push({ base64: match[2], mimeType: match[1] });
            }
          }
        } else {
          // Legacy: parse inline base64 data URL
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            proofImages.push({ base64: match[2], mimeType: match[1] });
          }
        }
      }
    }

    // Call AI validation with multiple images
    const aiResult = await validateChallengeWithAI({
      challengeTitle: validation.challenge_title,
      challengeDescription: validation.challenge_description,
      challengeDifficulty: validation.challenge_difficulty,
      proofText: validation.proof_text,
      proofImages, // Array of images
    });

    const result = {
      is_valid: aiResult.isValid,
      confidence_score: aiResult.confidenceScore,
      reasoning: aiResult.reasoning,
    };

    await connection.beginTransaction();

    // Store AI result (atomic - returns false if already processed)
    const updated = await PendingValidationModel.setAIResult(validation.id, result, connection);

    if (!updated) {
      // Already processed by admin, skip
      await connection.rollback();
      console.info(`[ValidationProcessor] Validation ${validation.id} already processed by admin, skipping`);
      return { ...result, applied: false };
    }

    // Apply result if approved
    if (result.is_valid) {
      await applyApprovalResult(validation.pending_redemption_id, validation.user_id, connection);

      // Notify user of approval
      await NotificationModel.create(
        {
          user_id: validation.user_id,
          type: 'challenge_result',
          title: 'Prueba aprobada',
          message: `Tu prueba para "${validation.challenge_title}" fue aprobada automáticamente. ¡Tu hábito "${validation.habit_name}" ha sido desbloqueado!`,
        },
        connection,
      );
    } else {
      // Notify user of rejection
      await NotificationModel.create(
        {
          user_id: validation.user_id,
          type: 'challenge_result',
          title: 'Prueba rechazada',
          message: `Tu prueba para "${validation.challenge_title}" fue rechazada. Razón: ${result.reasoning}. Puedes enviar una nueva prueba.`,
        },
        connection,
      );
    }

    await connection.commit();

    console.info(`[ValidationProcessor] Processed validation ${validation.id}: ${result.is_valid ? 'APPROVED' : 'REJECTED'}`);

    return { ...result, applied: true };
  } catch (error) {
    await connection.rollback();
    console.error(`[ValidationProcessor] Error processing validation ${validation.id}:`, error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Apply approval result to pending redemption
 * Shared helper used by both AI validation and admin manual approval
 */
export async function applyApprovalResult(
  pendingRedemptionId: string,
  userId: string,
  connection: import('mysql2/promise').PoolConnection,
): Promise<void> {
  // Use connection for transactional read
  const pending = await PendingRedemptionModel.findById(pendingRedemptionId, connection);

  if (!pending) {
    throw new Error('Pending redemption not found');
  }

  // Mark the user challenge as completed
  if (pending.challenge_id) {
    const [ucRows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM USER_CHALLENGES
       WHERE user_id = ? AND challenge_id = ? AND status = 'assigned'
       ORDER BY assigned_at DESC LIMIT 1`,
      [userId, pending.challenge_id],
    );

    if (ucRows.length > 0) {
      await connection.query(`UPDATE USER_CHALLENGES SET status = 'completed', completed_at = NOW() WHERE id = ?`, [
        ucRows[0].id,
      ]);
    }
  }

  // Resolve the pending redemption (habit unblocks)
  await PendingRedemptionModel.resolveWithChallenge(pendingRedemptionId, connection);

  // Increase discipline
  await onChallengeCompleted(userId, connection);
}

const MAX_AI_RETRIES = 3;

// Backoff intervals in minutes: 0, 5, 15, 30 (exponential)
const BACKOFF_MINUTES = [0, 5, 15, 30];

/**
 * Calculate if enough time has passed since last failure for a retry
 * Uses exponential backoff based on retry count
 */
function shouldRetryValidation(retryCount: number, lastErrorAt: Date | null): boolean {
  if (retryCount === 0 || !lastErrorAt) {
    return true; // No previous failures or no timestamp
  }

  const backoffMinutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)];
  const backoffMs = backoffMinutes * 60 * 1000;
  const timeSinceError = Date.now() - new Date(lastErrorAt).getTime();

  return timeSinceError >= backoffMs;
}

/**
 * Process all expired pending validations
 * This should be called every 5 minutes
 * Uses exponential backoff for failed validations
 */
export async function processExpiredValidations(): Promise<number> {
  // Check if AI is available first
  const isAIAvailable = await checkLMStudioHealth();

  if (!isAIAvailable) {
    console.warn('[ValidationProcessor] AI not available, skipping expired validations processing');
    return 0;
  }

  const expiredValidations = await PendingValidationModel.getExpiredPending();

  if (expiredValidations.length === 0) {
    return 0;
  }

  console.info(`[ValidationProcessor] Processing ${expiredValidations.length} expired validations`);

  let processedCount = 0;

  for (const validation of expiredValidations) {
    // Skip validations that have failed too many times - need manual review
    const currentRetries = (validation as any).ai_retry_count || 0;
    if (currentRetries >= MAX_AI_RETRIES) {
      console.warn(
        `[ValidationProcessor] Skipping validation ${validation.id} - exceeded ${MAX_AI_RETRIES} retries. Needs manual review.`,
      );
      continue;
    }

    // CRITICAL FIX: Apply exponential backoff for failed validations
    const lastErrorAt = (validation as any).last_error_at || null;
    if (!shouldRetryValidation(currentRetries, lastErrorAt)) {
      const backoffMinutes = BACKOFF_MINUTES[Math.min(currentRetries, BACKOFF_MINUTES.length - 1)];
      console.info(
        `[ValidationProcessor] Skipping validation ${validation.id} - backoff (${backoffMinutes}min) not elapsed yet`,
      );
      continue;
    }

    try {
      await processValidationWithAI(validation);
      processedCount++;
    } catch (error) {
      // MEDIUM FIX: Better error serialization to avoid losing context
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = '[Unserializable error object]';
        }
      } else {
        errorMessage = String(error);
      }
      console.error(`[ValidationProcessor] Failed to process validation ${validation.id}:`, errorMessage);

      // Track the failure
      const newRetryCount = await PendingValidationModel.incrementRetryCount(validation.id, errorMessage);

      if (newRetryCount >= MAX_AI_RETRIES) {
        console.error(
          `[ValidationProcessor] Validation ${validation.id} has failed ${newRetryCount} times. Marking for manual review.`,
        );

        // Notify admins about stuck validation
        await NotificationModel.create({
          user_id: validation.user_id,
          type: 'challenge_result',
          title: 'Validación en revisión',
          message: `Tu prueba para "${validation.challenge_title}" requiere revisión manual. Un administrador la revisará pronto.`,
        });
      }
    }
  }

  return processedCount;
}

/**
 * Validation Processor Service
 * Handles automatic processing of expired validations
 */
export class ValidationProcessorService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private runCount: number = 0;

  // Run cleanup every 288 cycles (24 hours at 5-minute intervals)
  private static readonly CLEANUP_EVERY_N_RUNS = 288;
  private static readonly CLEANUP_KEEP_DAYS = 30;

  /**
   * Start the automatic processor
   * Runs every 5 minutes by default
   */
  start(intervalMs: number = 5 * 60 * 1000): void {
    if (this.intervalId) {
      console.warn('[ValidationProcessor] Already running');
      return;
    }

    console.info(`[ValidationProcessor] Starting (interval: ${intervalMs / 1000}s)`);

    // Run immediately
    this.runOnce();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runOnce();
    }, intervalMs);
  }

  /**
   * Stop the automatic processor
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info('[ValidationProcessor] Stopped');
    }
  }

  /**
   * Run once
   */
  private async runOnce(): Promise<void> {
    if (this.isRunning) {
      console.warn('[ValidationProcessor] Already processing, skipping');
      return;
    }

    this.isRunning = true;
    this.runCount++;

    try {
      // Process expired validations
      const count = await processExpiredValidations();
      if (count > 0) {
        console.info(`[ValidationProcessor] Processed ${count} expired validations`);
      }

      // Run cleanup periodically (once per day)
      if (this.runCount % ValidationProcessorService.CLEANUP_EVERY_N_RUNS === 0) {
        await this.runCleanup();
      }
    } catch (error) {
      console.error('[ValidationProcessor] Error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cleanup old processed validations
   */
  private async runCleanup(): Promise<void> {
    try {
      const deletedCount = await PendingValidationModel.cleanupOldValidations(
        ValidationProcessorService.CLEANUP_KEEP_DAYS,
      );
      if (deletedCount > 0) {
        console.info(
          `[ValidationProcessor] Cleaned up ${deletedCount} old validations (older than ${ValidationProcessorService.CLEANUP_KEEP_DAYS} days)`,
        );
      }
    } catch (error) {
      console.error('[ValidationProcessor] Cleanup error:', error);
    }
  }

  /**
   * Manually trigger cleanup (for admin use)
   */
  async manualCleanup(keepDays?: number): Promise<number> {
    return PendingValidationModel.cleanupOldValidations(keepDays || ValidationProcessorService.CLEANUP_KEEP_DAYS);
  }
}

// Export singleton instance
export const validationProcessorService = new ValidationProcessorService();
