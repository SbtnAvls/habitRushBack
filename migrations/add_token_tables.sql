-- Migration: Add Refresh Tokens and Token Blacklist tables
-- Date: 2025-10-19
-- Description: Adds support for refresh tokens and token blacklist for improved security

-- REFRESH TOKENS
CREATE TABLE IF NOT EXISTS REFRESH_TOKENS (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- TOKEN BLACKLIST
CREATE TABLE IF NOT EXISTS TOKEN_BLACKLIST (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  token TEXT NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  blacklisted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE
);

-- ÍNDICES para refresh tokens y blacklist
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON REFRESH_TOKENS(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON REFRESH_TOKENS(expires_at);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON TOKEN_BLACKLIST(expires_at);
