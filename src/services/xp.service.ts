import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { UserModel } from '../models/user.model';
import { UserStatsModel } from '../models/user-stats.model';
import pool from '../db';

/**
 * XP values for different events
 */
export const XP_VALUES = {
  HABIT_COMPLETED: 10,
  STREAK_BONUS_PER_DAY: 2,
  STREAK_BONUS_MAX: 20,
  ALL_HABITS_DAILY_BONUS: 25,
  CHALLENGE_COMPLETED: 50,
} as const;

export type XpReason =
  | 'habit_completed'
  | 'streak_bonus'
  | 'all_habits_daily_bonus'
  | 'challenge_completed';

/**
 * Grant XP to a user
 * Updates both total XP and weekly XP
 */
export async function grantXp(
  userId: string,
  amount: number,
  _reason: XpReason,
  connection?: PoolConnection,
): Promise<void> {
  await UserModel.updateXp(userId, amount, connection);
}

/**
 * Calculate streak bonus based on current streak
 * Bonus: +2 XP per day of streak, max +20
 */
export function calculateStreakBonus(currentStreak: number): number {
  if (currentStreak <= 1) return 0;
  const bonus = (currentStreak - 1) * XP_VALUES.STREAK_BONUS_PER_DAY;
  return Math.min(bonus, XP_VALUES.STREAK_BONUS_MAX);
}

/**
 * Grant XP for completing a habit
 * Includes base XP + streak bonus
 * Returns total XP granted
 */
export async function grantHabitCompletionXp(
  userId: string,
  currentStreak: number,
  connection?: PoolConnection,
): Promise<number> {
  const baseXp = XP_VALUES.HABIT_COMPLETED;
  const streakBonus = calculateStreakBonus(currentStreak);
  const totalXp = baseXp + streakBonus;

  await grantXp(userId, totalXp, 'habit_completed', connection);

  return totalXp;
}

/**
 * Grant XP for completing a challenge
 */
export async function grantChallengeCompletionXp(
  userId: string,
  connection?: PoolConnection,
): Promise<number> {
  const xp = XP_VALUES.CHALLENGE_COMPLETED;
  await grantXp(userId, xp, 'challenge_completed', connection);
  return xp;
}

// MEDIUM FIX: Date format validation regex
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate date string format (YYYY-MM-DD) and return parsed components
 * Returns null if invalid
 */
function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!DATE_REGEX.test(dateStr)) {
    return null;
  }

  const [year, month, day] = dateStr.split('-').map(Number);

  // Validate ranges
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  // Basic validation for days in month (not perfect but catches obvious errors)
  const maxDays = new Date(year, month, 0).getDate();
  if (day > maxDays) {
    return null;
  }

  return { year, month, day };
}

/**
 * Get day of week from date string (0 = Sunday, 6 = Saturday)
 * MEDIUM FIX: Added validation for date string format
 */
function getDayOfWeekFromDateString(dateStr: string): number {
  const parsed = parseDateString(dateStr);
  if (!parsed) {
    console.error(`[XP Service] Invalid date string: ${dateStr}`);
    return 0; // Default to Sunday if invalid (safe fallback)
  }

  const { year, month, day } = parsed;
  // Create date at noon to avoid any DST edge cases
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.getDay();
}

/**
 * Check if user completed all habits for the day and grant bonus if so
 * Returns the bonus amount granted (25 if granted, 0 if not)
 */
export async function checkAndGrantDailyBonus(
  userId: string,
  date: string,
  connection?: PoolConnection,
): Promise<number> {
  const conn = connection || pool;

  // 1. Get the day of week for the date (0 = Sunday, 6 = Saturday)
  const dayOfWeek = getDayOfWeekFromDateString(date);

  // 2. Get active habits that apply for this day
  // - is_active = 1 (not disabled by system)
  // - active_by_user = 1 (not disabled by user)
  // - start_date <= date (habit has started)
  // - matches frequency for this day of week
  const [habits] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM HABITS
     WHERE user_id = ?
     AND is_active = 1
     AND active_by_user = 1
     AND deleted_at IS NULL
     AND start_date <= ?
     AND (
       frequency_type = 'daily'
       OR (frequency_type = 'weekly' AND FIND_IN_SET(?, frequency_days_of_week) > 0)
       OR (frequency_type = 'custom' AND FIND_IN_SET(?, frequency_days_of_week) > 0)
     )`,
    [userId, date, dayOfWeek.toString(), dayOfWeek.toString()],
  );

  // No habits for today = no bonus
  if (habits.length === 0) {
    return 0;
  }

  // 3. Check if all habits are completed for this date
  const habitIds = habits.map(h => h.id);
  const [completions] = await conn.query<RowDataPacket[]>(
    `SELECT habit_id FROM HABIT_COMPLETIONS
     WHERE user_id = ?
     AND \`date\` = ?
     AND completed = 1
     AND habit_id IN (?)`,
    [userId, date, habitIds],
  );

  // Not all habits completed
  if (completions.length < habits.length) {
    return 0;
  }

  // 4. Atomically try to set the daily bonus date (prevents race condition)
  // Only updates if last_daily_bonus_date is NULL or different from today
  const [result] = await conn.query<RowDataPacket[]>(
    `UPDATE USER_STATS
     SET last_daily_bonus_date = ?, updated_at = NOW()
     WHERE user_id = ?
     AND (last_daily_bonus_date IS NULL OR last_daily_bonus_date != ?)`,
    [date, userId, date],
  );

  // If no rows affected, bonus was already granted (race condition prevented)
  const affectedRows = (result as unknown as { affectedRows: number }).affectedRows;
  if (affectedRows === 0) {
    return 0;
  }

  // 5. All habits completed and we claimed the bonus! Grant XP
  await grantXp(userId, XP_VALUES.ALL_HABITS_DAILY_BONUS, 'all_habits_daily_bonus', connection);

  return XP_VALUES.ALL_HABITS_DAILY_BONUS;
}
