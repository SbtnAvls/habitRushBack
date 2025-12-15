import { UserStatsModel } from '../models/user-stats.model';
import { PoolConnection } from 'mysql2/promise';

/**
 * Discipline score changes for different events
 */
export const DISCIPLINE_CHANGES = {
  // Positive events
  HABIT_COMPLETED: 1,
  PERFECT_WEEK: 10,
  CHALLENGE_COMPLETED: 5,
  LIFE_CHALLENGE_REDEEMED: 5,

  // Negative events
  FAIL_REDEEMED_LIFE: -10,
  PENDING_EXPIRED: -15,
  DEATH_CHALLENGE: -20, // Multiplier: 0.8 (keep 80%)
  DEATH_RESET: -50, // Multiplier: 0.5 (keep 50%)
} as const;

export type DisciplineEvent = keyof typeof DISCIPLINE_CHANGES;

/**
 * Adjust discipline score based on an event
 */
export async function adjustDiscipline(
  userId: string,
  event: DisciplineEvent,
  connection?: PoolConnection,
): Promise<void> {
  const change = DISCIPLINE_CHANGES[event];

  // For death events, use multiplier instead of fixed change
  if (event === 'DEATH_RESET') {
    await UserStatsModel.multiplyDiscipline(userId, 0.5, connection);
  } else if (event === 'DEATH_CHALLENGE') {
    await UserStatsModel.multiplyDiscipline(userId, 0.8, connection);
  } else {
    await UserStatsModel.updateDiscipline(userId, change, connection);
  }
}

/**
 * Handle stats update when a habit is completed
 */
export async function onHabitCompleted(
  userId: string,
  currentStreak: number,
  connection?: PoolConnection,
): Promise<void> {
  await adjustDiscipline(userId, 'HABIT_COMPLETED', connection);
  await UserStatsModel.incrementStat(userId, 'total_completions', connection);
  await UserStatsModel.updateMaxStreak(userId, currentStreak, connection);
}

/**
 * Handle stats update when a perfect week is achieved
 */
export async function onPerfectWeek(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'PERFECT_WEEK', connection);
  await UserStatsModel.incrementStat(userId, 'perfect_weeks', connection);
}

/**
 * Handle stats update when user redeems a failed habit with a life
 */
export async function onFailRedeemedWithLife(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'FAIL_REDEEMED_LIFE', connection);
}

/**
 * Handle stats update when a pending redemption expires
 */
export async function onPendingExpired(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'PENDING_EXPIRED', connection);
}

/**
 * Handle stats update when user completes a challenge (either for redemption or revival)
 */
export async function onChallengeCompleted(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'CHALLENGE_COMPLETED', connection);
}

/**
 * Handle stats update when user revives with a challenge
 */
export async function onRevivalWithChallenge(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'DEATH_CHALLENGE', connection);
  await UserStatsModel.incrementStat(userId, 'revival_count', connection);
}

/**
 * Handle stats update when user does a full reset
 */
export async function onRevivalWithReset(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'DEATH_RESET', connection);
  await UserStatsModel.incrementStat(userId, 'reset_count', connection);
}

/**
 * Handle stats update when a life challenge is redeemed
 */
export async function onLifeChallengeRedeemed(userId: string, connection?: PoolConnection): Promise<void> {
  await adjustDiscipline(userId, 'LIFE_CHALLENGE_REDEEMED', connection);
}

/**
 * Ensure user has stats record (create if not exists)
 */
export async function ensureUserStats(userId: string): Promise<void> {
  await UserStatsModel.getOrCreate(userId);
}
