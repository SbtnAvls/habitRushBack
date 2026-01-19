import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ChallengeModel } from '../models/challenge.model';
import { UserStatsModel } from '../models/user-stats.model';
import { LifeHistoryModel } from '../models/life-history.model';
import { NotificationModel } from '../models/notification.model';
import { isValidUUID } from '../middleware/uuid-validation.middleware';
import pool from '../db';
import { RowDataPacket } from 'mysql2';

export class RevivalController {
  /**
   * GET /revival/options
   * Get available revival options for a dead user
   */
  static async getOptions(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Check if user is dead
      const [userRows] = await pool.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);

      if (userRows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      const currentLives = userRows[0].lives;

      if (currentLives > 0) {
        return res.status(400).json({
          message: 'No necesitas revivir, tienes vidas',
          is_dead: false,
          lives: currentLives,
        });
      }

      // Get general challenges available for penance
      const generalChallenges = await ChallengeModel.getGeneralChallenges();

      // Get current stats to show impact
      const stats = await UserStatsModel.getOrCreate(userId);

      res.json({
        success: true,
        is_dead: true,
        options: {
          reset: {
            description: 'Empezar de cero. Pierdes todo el progreso de tus hábitos.',
            discipline_penalty: Math.floor(stats.discipline_score * 0.5),
            new_discipline: Math.floor(stats.discipline_score * 0.5),
            lives_gained: 1,
            effects: [
              'Se reinician los streaks de todos los hábitos',
              'Pierdes 50% de tu puntuación de disciplina',
              'Recibes 1 vida para empezar',
            ],
          },
          challenge: {
            description: 'Completa una penitencia para mantener tu progreso.',
            discipline_penalty: Math.floor(stats.discipline_score * 0.2),
            new_discipline: Math.floor(stats.discipline_score * 0.8),
            lives_gained: 1,
            available_challenges: generalChallenges,
            effects: [
              'Mantienes todo tu progreso y streaks',
              'Pierdes 20% de tu puntuación de disciplina',
              'Recibes 1 vida para continuar',
            ],
          },
        },
        current_stats: {
          discipline_score: stats.discipline_score,
          max_streak: stats.max_streak,
          revival_count: stats.revival_count,
          reset_count: stats.reset_count,
        },
      });
    } catch (error) {
      console.error('Error getting revival options:', error);
      res.status(500).json({ message: 'Error al obtener opciones de revival' });
    }
  }

  /**
   * POST /revival/reset
   * Option A: Total reset - lose all progress but revive
   */
  static async resetTotal(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // Check if user is dead
      const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);

      if (userRows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      if (userRows[0].lives > 0) {
        return res.status(400).json({
          message: 'No estás muerto. No necesitas revivir.',
          is_dead: false,
        });
      }

      await connection.beginTransaction();

      // Ensure USER_STATS exist before updating
      await UserStatsModel.getOrCreate(userId);

      // 1. Reset streaks ONLY for habits disabled due to 'no_lives' and reactivate them
      // Habits manually disabled by user stay disabled
      await connection.query(
        `UPDATE HABITS
         SET current_streak = 0,
             is_active = 1,
             disabled_at = NULL,
             disabled_reason = NULL
         WHERE user_id = ?
         AND disabled_reason = 'no_lives'
         AND deleted_at IS NULL`,
        [userId],
      );

      // 2. Give 1 life
      await connection.query('UPDATE USERS SET lives = 1 WHERE id = ?', [userId]);

      // 3. Penalize discipline (-50%) and increment reset_count
      await UserStatsModel.multiplyDiscipline(userId, 0.5, connection);
      await UserStatsModel.incrementStat(userId, 'reset_count', connection);

      // 4. Record in LIFE_HISTORY
      await LifeHistoryModel.create(userId, 1, 1, 'revival_reset', undefined, connection);

      // 5. Create revival notification
      await NotificationModel.create(
        {
          user_id: userId,
          type: 'life_warning',
          title: 'Has renacido',
          message: 'Empezaste de cero. Todos tus streaks fueron reiniciados. ¡Buena suerte!',
        },
        connection,
      );

      await connection.commit();

      // Get updated stats
      const stats = await UserStatsModel.getForUser(userId);

      res.json({
        success: true,
        message: '¡Has renacido! Tu progreso se ha reiniciado.',
        lives: 1,
        stats,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error in reset revival:', error);
      res.status(500).json({ message: 'Error al reiniciar' });
    } finally {
      connection.release();
    }
  }

  /**
   * POST /revival/challenge
   * Option B: Complete a penance challenge to revive with progress intact
   */
  static async reviveWithChallenge(req: AuthRequest, res: Response) {
    const connection = await pool.getConnection();

    try {
      const userId = req.user?.id;
      const { challenge_id, proof_text, proof_image_url } = req.body;

      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      if (!challenge_id) {
        return res.status(400).json({ message: 'challenge_id es requerido' });
      }

      // MEDIUM FIX: Validate challenge_id UUID format
      if (typeof challenge_id !== 'string' || !isValidUUID(challenge_id)) {
        return res.status(400).json({ message: 'challenge_id tiene formato inválido' });
      }

      if (!proof_text && !proof_image_url) {
        return res.status(400).json({
          message: 'Debes enviar prueba (proof_text o proof_image_url)',
        });
      }

      // Check if user is dead
      const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);

      if (userRows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      if (userRows[0].lives > 0) {
        return res.status(400).json({
          message: 'No estás muerto. No necesitas revivir.',
          is_dead: false,
        });
      }

      // Verify it's a general challenge (valid for revival)
      const challenge = await ChallengeModel.findById(challenge_id);
      if (!challenge || !challenge.is_general || !challenge.is_active) {
        return res.status(400).json({
          message: 'Challenge no válido para revival. Debe ser un challenge general y activo.',
        });
      }

      // LOW FIX: Improved proof validation with better rules
      // MEDIUM FIX: Added image size validation
      const PROOF_TEXT_MIN_LENGTH = 50;
      const PROOF_TEXT_MAX_LENGTH = 2000;
      const PROOF_IMAGE_URL_MAX_LENGTH = 5 * 1024 * 1024; // 5MB base64 max
      const VALID_IMAGE_PREFIXES = ['data:image/jpeg', 'data:image/png', 'data:image/jpg', 'data:image/gif', 'data:image/webp'];

      let hasValidText = false;
      let hasValidImage = false;

      // Validate proof_text if provided
      if (proof_text) {
        if (typeof proof_text !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'proof_text debe ser un string',
          });
        }
        const trimmedText = proof_text.trim();
        if (trimmedText.length > PROOF_TEXT_MAX_LENGTH) {
          return res.status(400).json({
            success: false,
            message: `El texto de prueba no puede exceder ${PROOF_TEXT_MAX_LENGTH} caracteres`,
          });
        }
        // Check minimum length and that it's not just whitespace/repeated chars
        if (trimmedText.length >= PROOF_TEXT_MIN_LENGTH) {
          // Basic check: at least 3 different words
          const words = trimmedText.split(/\s+/).filter(w => w.length > 2);
          hasValidText = words.length >= 3;
        }
      }

      // Validate proof_image_url if provided
      if (proof_image_url) {
        if (typeof proof_image_url !== 'string') {
          return res.status(400).json({
            success: false,
            message: 'proof_image_url debe ser un string',
          });
        }
        // MEDIUM FIX: Check size limit for base64 data URLs to prevent memory exhaustion
        if (proof_image_url.length > PROOF_IMAGE_URL_MAX_LENGTH) {
          return res.status(400).json({
            success: false,
            message: 'La imagen es demasiado grande. Máximo 5MB.',
          });
        }
        // Check if it's a valid base64 data URL
        const isValidDataUrl = VALID_IMAGE_PREFIXES.some(prefix => proof_image_url.startsWith(prefix));
        // Or a valid HTTP(S) URL
        const isValidHttpUrl = proof_image_url.startsWith('http://') || proof_image_url.startsWith('https://');
        hasValidImage = isValidDataUrl || isValidHttpUrl;
      }

      if (!hasValidText && !hasValidImage) {
        return res.status(400).json({
          success: false,
          message: `Pruebas insuficientes. Proporciona una descripción detallada (mínimo ${PROOF_TEXT_MIN_LENGTH} caracteres con al menos 3 palabras) o una imagen válida.`,
        });
      }

      await connection.beginTransaction();

      // Ensure USER_STATS exist before updating
      await UserStatsModel.getOrCreate(userId);

      // 1. Reactivate habits (keep streaks intact)
      await connection.query(
        `UPDATE HABITS
         SET is_active = 1,
             disabled_at = NULL,
             disabled_reason = NULL
         WHERE user_id = ?
         AND disabled_reason = 'no_lives'
         AND deleted_at IS NULL`,
        [userId],
      );

      // 2. Give 1 life
      await connection.query('UPDATE USERS SET lives = 1 WHERE id = ?', [userId]);

      // 3. Penalize discipline (-20%) and increment revival_count
      await UserStatsModel.multiplyDiscipline(userId, 0.8, connection);
      await UserStatsModel.incrementStat(userId, 'revival_count', connection);

      // 4. Record challenge as completed
      await connection.query(
        `INSERT INTO USER_CHALLENGES
         (id, user_id, habit_id, challenge_id, status, completed_at)
         VALUES (UUID(), ?, NULL, ?, 'completed', NOW())`,
        [userId, challenge_id],
      );

      // 5. Record in LIFE_HISTORY
      await LifeHistoryModel.create(userId, 1, 1, 'revival_challenge', undefined, connection);

      // 6. Create revival notification
      await NotificationModel.create(
        {
          user_id: userId,
          type: 'life_warning',
          title: '¡Penitencia completada!',
          message: 'Has revivido con tu progreso intacto. ¡No vuelvas a fallar!',
        },
        connection,
      );

      await connection.commit();

      // Get updated stats
      const stats = await UserStatsModel.getForUser(userId);

      res.json({
        success: true,
        message: '¡Penitencia completada! Has revivido con tu progreso intacto.',
        lives: 1,
        stats,
        challenge_completed: challenge,
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error in challenge revival:', error);
      res.status(500).json({ message: 'Error al completar penitencia' });
    } finally {
      connection.release();
    }
  }

  /**
   * GET /revival/status
   * Check if user is dead and needs to revive
   */
  static async getStatus(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const [userRows] = await pool.query<RowDataPacket[]>('SELECT lives FROM USERS WHERE id = ?', [userId]);

      if (userRows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      const isDead = userRows[0].lives === 0;

      res.json({
        success: true,
        is_dead: isDead,
        lives: userRows[0].lives,
        ...(isDead && { revival_url: '/revival/options' }),
      });
    } catch (error) {
      console.error('Error checking revival status:', error);
      res.status(500).json({ message: 'Error al verificar estado' });
    }
  }
}
