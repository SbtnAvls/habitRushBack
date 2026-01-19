-- Migration: 010_user_follows.sql
-- Description: Create social module tables and rename name to username
-- Date: 2025-01-05

-- =====================================================
-- ALTER TABLE: USERS
-- Rename 'name' to 'username' and make it unique for social features
-- =====================================================

-- Step 1: Rename column name to username
ALTER TABLE USERS CHANGE COLUMN name username VARCHAR(50) NOT NULL;

-- Step 2: Add unique constraint to username
ALTER TABLE USERS ADD CONSTRAINT unique_username UNIQUE (username);

-- Step 3: Add social counters and privacy settings
ALTER TABLE USERS
  ADD COLUMN followers_count INT UNSIGNED DEFAULT 0,
  ADD COLUMN following_count INT UNSIGNED DEFAULT 0,
  ADD COLUMN is_profile_public BOOLEAN DEFAULT TRUE;

-- Index for searching users by username (for social search)
CREATE INDEX idx_users_username_search ON USERS(username);


-- =====================================================
-- ALTER TABLE: LEAGUE_COMPETITORS
-- Rename 'name' to 'username' for consistency
-- =====================================================
ALTER TABLE LEAGUE_COMPETITORS CHANGE COLUMN name username VARCHAR(50) NOT NULL;


-- =====================================================
-- TABLE: USER_FOLLOWS
-- Stores follow relationships between users
-- =====================================================
CREATE TABLE IF NOT EXISTS USER_FOLLOWS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  follower_id CHAR(36) NOT NULL COMMENT 'User who follows',
  following_id CHAR(36) NOT NULL COMMENT 'User being followed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys with CASCADE delete (if user is deleted, remove follows)
  CONSTRAINT fk_follower FOREIGN KEY (follower_id)
    REFERENCES USERS(id) ON DELETE CASCADE,
  CONSTRAINT fk_following FOREIGN KEY (following_id)
    REFERENCES USERS(id) ON DELETE CASCADE,

  -- Prevent duplicate follows (also creates index for pair lookups)
  CONSTRAINT unique_follow UNIQUE (follower_id, following_id),

  -- Prevent self-follow at DB level
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- Index for getting followers of a user (who follows me?)
CREATE INDEX idx_user_follows_following ON USER_FOLLOWS(following_id);

-- Index for getting following of a user (who do I follow?)
CREATE INDEX idx_user_follows_follower ON USER_FOLLOWS(follower_id);
