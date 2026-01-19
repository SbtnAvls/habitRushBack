-- Migration: Add PENDING_VALIDATIONS table for manual moderation system
-- This allows admins to review challenge proofs before AI validation

CREATE TABLE IF NOT EXISTS PENDING_VALIDATIONS (
    id CHAR(36) PRIMARY KEY,
    pending_redemption_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    challenge_id CHAR(36) NOT NULL,

    -- Proof data
    proof_text TEXT,
    proof_image_url TEXT,
    proof_type ENUM('text', 'image', 'both') NOT NULL,

    -- Validation status
    status ENUM(
        'pending_review',      -- Waiting for admin or AI
        'approved_manual',     -- Admin approved
        'rejected_manual',     -- Admin rejected
        'approved_ai',         -- AI approved (after 1 hour timeout)
        'rejected_ai'          -- AI rejected (after 1 hour timeout)
    ) NOT NULL DEFAULT 'pending_review',

    -- Admin review data
    reviewer_notes TEXT,
    reviewed_by CHAR(36),      -- Admin user ID if manual review
    reviewed_at DATETIME,

    -- AI result (stored for analysis even if not used)
    ai_result JSON,
    ai_validated_at DATETIME,

    -- Challenge context (denormalized for easy dashboard display)
    challenge_title VARCHAR(255),
    challenge_description TEXT,
    challenge_difficulty VARCHAR(50),
    habit_name VARCHAR(255),
    user_email VARCHAR(255),

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,  -- When AI should auto-validate (created_at + 1 hour)

    -- Foreign keys
    FOREIGN KEY (pending_redemption_id) REFERENCES PENDING_REDEMPTIONS(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES USERS(id) ON DELETE CASCADE,
    FOREIGN KEY (challenge_id) REFERENCES CHALLENGES(id) ON DELETE CASCADE,

    -- Indexes
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_expires_at (expires_at),
    INDEX idx_user_id (user_id)
);

-- Add is_admin column to USERS if not exists
ALTER TABLE USERS ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
