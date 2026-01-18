-- Migration 012: Add daily XP tracking columns for bots
-- Purpose: Track accumulated XP per day for realistic bot simulation
-- Part of: realistic-bot-xp development (Phase 2)

-- Add columns for daily XP tracking
-- daily_xp_today: XP accumulated today (resets at midnight)
-- daily_xp_target: Random target for today based on profile (set at reset)
-- last_xp_reset_date: Date of last reset (to know when to reset)
ALTER TABLE LEAGUE_COMPETITORS
ADD COLUMN daily_xp_today INT DEFAULT 0,
ADD COLUMN daily_xp_target INT DEFAULT 0,
ADD COLUMN last_xp_reset_date DATE DEFAULT NULL;

-- Index for efficient queries when filtering bots that need updates
CREATE INDEX idx_league_competitors_bot_daily ON LEAGUE_COMPETITORS (
  league_week_id,
  is_real,
  last_xp_reset_date
);
