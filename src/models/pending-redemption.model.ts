import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { PoolConnection } from 'mysql2/promise';

export type PendingRedemptionStatus =
  | 'pending'
  | 'challenge_assigned'
  | 'redeemed_life'
  | 'redeemed_challenge'
  | 'expired';

export interface PendingRedemption {
  id: string;
  user_id: string;
  habit_id: string;
  failed_date: Date;
  expires_at: Date;
  status: PendingRedemptionStatus;
  notified_expiring: boolean;
  resolved_at: Date | null;
  challenge_id: string | null;
  created_at: Date;
}

export interface PendingRedemptionWithDetails extends PendingRedemption {
  habit_name: string;
  habit_category_id: string;
  category_name: string;
  category_icon: string | null;
}

interface PendingRedemptionRow extends RowDataPacket, PendingRedemption {}
interface PendingRedemptionDetailsRow extends RowDataPacket, PendingRedemptionWithDetails {}

export class PendingRedemptionModel {
  /**
   * Create a new pending redemption
   * Expires at the next daily evaluation (user has until end of day to decide)
   */
  static async create(userId: string, habitId: string, failedDate: Date, connection?: PoolConnection): Promise<string> {
    const conn = connection || pool;
    const id = uuidv4();
    // Set expires_at to end of current day (23:59:59) in UTC
    // IMPORTANT: Using UTC to avoid timezone inconsistencies between server and clients
    const expiresAt = new Date();
    expiresAt.setUTCHours(23, 59, 59, 999);

    await conn.query(
      `INSERT INTO PENDING_REDEMPTIONS
       (id, user_id, habit_id, failed_date, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, habitId, failedDate, expiresAt],
    );

    return id;
  }

  /**
   * Check if a habit has an active (unresolved) pending redemption
   * Both 'pending' and 'challenge_assigned' are considered active (habit blocked)
   */
  static async hasActivePending(habitId: string, userId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM PENDING_REDEMPTIONS
       WHERE habit_id = ? AND user_id = ? AND status IN ('pending', 'challenge_assigned')
       LIMIT 1`,
      [habitId, userId],
    );
    return rows.length > 0;
  }

  /**
   * Get the active pending redemption for a habit
   * Both 'pending' and 'challenge_assigned' are considered active
   */
  static async getActivePendingForHabit(habitId: string, userId: string): Promise<PendingRedemption | null> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      `SELECT * FROM PENDING_REDEMPTIONS
       WHERE habit_id = ? AND user_id = ? AND status IN ('pending', 'challenge_assigned')
       LIMIT 1`,
      [habitId, userId],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all pending redemptions that should be auto-expired
   * (expires_at has passed - user didn't decide in time, or picked challenge but didn't complete it)
   */
  static async getPendingToAutoExpire(): Promise<PendingRedemption[]> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      `SELECT * FROM PENDING_REDEMPTIONS
       WHERE status IN ('pending', 'challenge_assigned')
       AND expires_at < NOW()`,
    );
    return rows;
  }

  /**
   * Cancel all pending redemptions for a user (when they die)
   * Marks them as 'expired' without deducting lives
   * Cancels both 'pending' and 'challenge_assigned' status
   */
  static async cancelAllForUser(userId: string, connection?: PoolConnection): Promise<number> {
    const conn = connection || pool;
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'expired', resolved_at = NOW()
       WHERE user_id = ? AND status IN ('pending', 'challenge_assigned')`,
      [userId],
    );
    return result.affectedRows;
  }

  /**
   * Get all pending redemptions for a user with habit details
   * Includes both 'pending' and 'challenge_assigned' status
   */
  static async getPendingForUser(userId: string): Promise<PendingRedemptionWithDetails[]> {
    const [rows] = await pool.query<PendingRedemptionDetailsRow[]>(
      `SELECT pr.*,
              h.name as habit_name,
              h.category_id as habit_category_id,
              COALESCE(hc.name, 'Sin categoría') as category_name,
              hc.icon as category_icon
       FROM PENDING_REDEMPTIONS pr
       JOIN HABITS h ON pr.habit_id = h.id
       LEFT JOIN HABIT_CATEGORIES hc ON h.category_id = hc.id
       WHERE pr.user_id = ? AND pr.status IN ('pending', 'challenge_assigned')
       ORDER BY pr.expires_at ASC`,
      [userId],
    );
    return rows;
  }

  /**
   * Find a pending redemption by ID
   * Optionally accepts a connection for transactional reads
   */
  static async findById(id: string, connection?: PoolConnection): Promise<PendingRedemption | null> {
    const conn = connection || pool;
    const [rows] = await conn.query<PendingRedemptionRow[]>('SELECT * FROM PENDING_REDEMPTIONS WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a pending redemption by ID with ownership check
   */
  static async findByIdAndUser(id: string, userId: string): Promise<PendingRedemption | null> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      'SELECT * FROM PENDING_REDEMPTIONS WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find a pending redemption by ID with ownership check and row lock
   * MUST be used within a transaction to prevent race conditions
   */
  static async findByIdAndUserForUpdate(
    id: string,
    userId: string,
    connection: PoolConnection,
  ): Promise<PendingRedemption | null> {
    const [rows] = await connection.query<PendingRedemptionRow[]>(
      'SELECT * FROM PENDING_REDEMPTIONS WHERE id = ? AND user_id = ? FOR UPDATE',
      [id, userId],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Resolve a pending redemption by redeeming with a life
   */
  static async resolveWithLife(id: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'redeemed_life', resolved_at = NOW()
       WHERE id = ?`,
      [id],
    );
    // LOW FIX: Add audit log for critical operation
    console.info(`[PendingRedemption] Resolved with life: ${id}`);
  }

  /**
   * Assign a challenge to a pending redemption (user chose challenge path)
   * Status changes to 'challenge_assigned', but habit remains blocked until challenge is completed
   */
  static async assignChallenge(id: string, challengeId: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'challenge_assigned', challenge_id = ?
       WHERE id = ?`,
      [challengeId, id],
    );
    // LOW FIX: Add audit log for critical operation
    console.info(`[PendingRedemption] Challenge assigned: ${id} -> challenge ${challengeId}`);
  }

  /**
   * Resolve a pending redemption by completing a challenge
   * Called after AI validates the challenge proof
   */
  static async resolveWithChallenge(id: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'redeemed_challenge', resolved_at = NOW()
       WHERE id = ?`,
      [id],
    );
    // LOW FIX: Add audit log for critical operation
    console.info(`[PendingRedemption] Resolved with challenge: ${id}`);
  }

  /**
   * Get all expired pending redemptions that need processing
   * Includes both 'pending' and 'challenge_assigned' (user didn't complete challenge in time)
   */
  static async getExpiredToProcess(): Promise<PendingRedemption[]> {
    const [rows] = await pool.query<PendingRedemptionRow[]>(
      `SELECT * FROM PENDING_REDEMPTIONS
       WHERE status IN ('pending', 'challenge_assigned') AND expires_at < NOW()`,
    );
    return rows;
  }

  /**
   * Mark expired pending redemptions as expired
   */
  static async markAsExpired(id: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query(
      `UPDATE PENDING_REDEMPTIONS
       SET status = 'expired', resolved_at = NOW()
       WHERE id = ?`,
      [id],
    );
    // LOW FIX: Add audit log for critical operation
    console.info(`[PendingRedemption] Marked as expired: ${id}`);
  }

  /**
   * Get pending redemptions that are about to expire (for notifications)
   * Includes both 'pending' and 'challenge_assigned' status
   */
  static async getExpiringWithinHours(hours: number): Promise<PendingRedemptionWithDetails[]> {
    const [rows] = await pool.query<PendingRedemptionDetailsRow[]>(
      `SELECT pr.*,
              h.name as habit_name,
              h.category_id as habit_category_id,
              COALESCE(hc.name, 'Sin categoría') as category_name,
              hc.icon as category_icon
       FROM PENDING_REDEMPTIONS pr
       JOIN HABITS h ON pr.habit_id = h.id
       LEFT JOIN HABIT_CATEGORIES hc ON h.category_id = hc.id
       WHERE pr.status IN ('pending', 'challenge_assigned')
       AND pr.notified_expiring = FALSE
       AND pr.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [hours],
    );
    return rows;
  }

  /**
   * Mark a pending redemption as notified for expiring
   */
  static async markAsNotified(id: string, connection?: PoolConnection): Promise<void> {
    const conn = connection || pool;
    await conn.query('UPDATE PENDING_REDEMPTIONS SET notified_expiring = TRUE WHERE id = ?', [id]);
  }

  /**
   * Count pending redemptions for a user
   * Includes both 'pending' and 'challenge_assigned' status
   */
  static async countPendingForUser(userId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM PENDING_REDEMPTIONS
       WHERE user_id = ? AND status IN ('pending', 'challenge_assigned')`,
      [userId],
    );
    return rows[0].count;
  }
}
