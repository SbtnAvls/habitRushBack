-- Migration: Fix NOTIFICATIONS type ENUM to include all required notification types
-- This fixes the daily evaluation service which was failing silently because
-- 'pending_redemption', 'pending_expiring', and 'death' were not in the ENUM

ALTER TABLE NOTIFICATIONS
MODIFY COLUMN type ENUM(
    'habit_reminder',
    'life_warning',
    'challenge_available',
    'league_update',
    'pending_redemption',
    'pending_expiring',
    'death'
) NOT NULL;
