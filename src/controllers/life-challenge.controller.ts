import { Request, Response } from 'express';
import pool from '../db';
import { LifeChallenge } from '../models/life-challenge.model';
import { User } from '../models/user.model';
import { RowDataPacket } from 'mysql2';
import { LifeHistory } from '../models/life-history.model';
import { LifeChallengeRedemption } from '../models/life-challenge-redemption.model';

// GET /api/life-challenges
export const getLifeChallenges = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM LIFE_CHALLENGES WHERE is_active = TRUE');
    res.json(rows as LifeChallenge[]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching life challenges' });
  }
};

// POST /api/life-challenges/:id/redeem
export const redeemLifeChallenge = async (req: Request, res: Response) => {
  const { id: lifeChallengeId } = req.params;
  const userId = (req as any).user.id;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Get life challenge details
    const [challengeRows] = await connection.query<RowDataPacket[]>('SELECT * FROM LIFE_CHALLENGES WHERE id = ? AND is_active = TRUE', [lifeChallengeId]);
    const lifeChallenge = challengeRows[0] as LifeChallenge;

    if (!lifeChallenge) {
      await connection.rollback();
      return res.status(404).json({ message: 'Life challenge not found or not active' });
    }

    // 2. Check if redeemable (if 'once', check if already redeemed)
    if (lifeChallenge.redeemable_type === 'once') {
      const [redemptionRows] = await connection.query<RowDataPacket[]>('SELECT id FROM LIFE_CHALLENGE_REDEMPTIONS WHERE user_id = ? AND life_challenge_id = ?', [userId, lifeChallengeId]);
      if (redemptionRows.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Life challenge already redeemed' });
      }
    }

    // 3. Get user's current lives
    const [userRows] = await connection.query<RowDataPacket[]>('SELECT lives, max_lives FROM USERS WHERE id = ?', [userId]);
    const user = userRows[0] as User;

    // 4. Calculate new lives total
    const livesGained = lifeChallenge.reward;
    const newLives = Math.min(user.lives + livesGained, user.max_lives);
    const actualLivesGained = newLives - user.lives;

    if (actualLivesGained <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Cannot gain more lives' });
    }

    // 5. Update user's lives
    await connection.query('UPDATE USERS SET lives = ? WHERE id = ?', [newLives, userId]);

    // 6. Create redemption record
    await connection.query('INSERT INTO LIFE_CHALLENGE_REDEMPTIONS (user_id, life_challenge_id, lives_gained) VALUES (?, ?, ?)', [userId, lifeChallengeId, actualLivesGained]);

    // 7. Create life history record
    await connection.query('INSERT INTO LIFE_HISTORY (user_id, lives_change, current_lives, reason, related_life_challenge_id) VALUES (?, ?, ?, ?, ?)', [userId, actualLivesGained, newLives, 'life_challenge_redeemed', lifeChallengeId]);

    await connection.commit();

    res.status(200).json({
      message: 'Life challenge redeemed successfully',
      livesGained: actualLivesGained,
      currentLives: newLives
    });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error redeeming life challenge' });
  } finally {
    connection.release();
  }
};