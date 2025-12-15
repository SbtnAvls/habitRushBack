import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { PendingRedemptionModel } from '../models/pending-redemption.model';
import { ChallengeModel } from '../models/challenge.model';
import { LifeHistoryModel } from '../models/life-history.model';
import { UserChallengeModel } from '../models/user-challenge.model';
import { onFailRedeemedWithLife, onChallengeCompleted } from '../services/stats.service';
import { handleUserDeath } from '../services/habit-evaluation.service';
import pool from '../db';
import { RowDataPacket } from 'mysql2';

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
      connection.release();
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

      if (!challenge_id) {
        return res.status(400).json({ message: 'challenge_id es requerido' });
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
        return res.status(404).json({ message: 'H\u00e1bito no encontrado' });
      }

      const habitCategoryId = habitRows[0].category_id;

      // Verify the challenge belongs to the habit's category (or is general)
      if (!challenge.is_general && challenge.category_id !== habitCategoryId) {
        return res.status(400).json({
          message: 'El challenge debe ser de la misma categor\u00eda que el h\u00e1bito fallado',
        });
      }

      await connection.beginTransaction();

      // Assign the challenge to the user
      const userChallenge = await UserChallengeModel.assign(userId, challenge_id, pending.habit_id);

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
      connection.release();
    }
  }

  /**
   * POST /pending-redemptions/:id/complete-challenge
   * Submit proof and complete the challenge (no life lost, discipline boost)
   */
  static async completeChallenge(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { proof_text, proof_image_url } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Verify the pending redemption
      const pending = await PendingRedemptionModel.findByIdAndUser(id, userId);
      if (!pending) {
        return res.status(404).json({ message: 'Redenci\u00f3n no encontrada' });
      }

      if (pending.status === 'expired') {
        return res.status(400).json({
          message: 'Esta redenci\u00f3n expir\u00f3. Ya perdiste la vida asociada.',
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
          message: 'Ya completaste el challenge para esta redenci\u00f3n.',
          error_code: 'ALREADY_COMPLETED',
        });
      }

      if (pending.status !== 'challenge_assigned') {
        return res.status(400).json({
          message: 'Primero debes elegir un challenge con POST /pending-redemptions/:id/redeem-challenge',
          error_code: 'NO_CHALLENGE_ASSIGNED',
        });
      }

      if (!proof_text && !proof_image_url) {
        return res.status(400).json({
          message: 'Debes enviar prueba (proof_text o proof_image_url) del challenge completado',
        });
      }

      // TODO: Here would go AI validation (currently simulated as always approved)
      // For now, we just verify that some proof was sent

      await connection.beginTransaction();

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

      // NOW resolve the pending redemption (habit unblocks)
      await PendingRedemptionModel.resolveWithChallenge(id, connection);

      // Increase discipline (user didn't lose a life!)
      await onChallengeCompleted(userId, connection);

      await connection.commit();

      res.json({
        success: true,
        message:
          '\u00a1Challenge completado! No perdiste vida y ganaste puntos de disciplina. Tu h\u00e1bito ha sido desbloqueado.',
        habit_unblocked: true,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error completing challenge:', error);
      res.status(500).json({ message: 'Error al completar challenge' });
    } finally {
      connection.release();
    }
  }
}
