-- Migration: Add Google ID support for OAuth authentication
-- Run this migration to enable Google Sign-In

-- Add google_id column (UNIQUE constraint creates an index automatically)
ALTER TABLE USERS
ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER password_hash;
