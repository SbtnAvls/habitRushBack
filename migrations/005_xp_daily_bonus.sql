-- Migration: Add last_daily_bonus_date to USER_STATS
-- Purpose: Track when daily bonus was last granted to prevent duplicates

ALTER TABLE USER_STATS
ADD COLUMN last_daily_bonus_date DATE NULL;
