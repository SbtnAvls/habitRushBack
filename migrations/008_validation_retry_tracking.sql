-- Migration: Add AI retry tracking to PENDING_VALIDATIONS
-- Tracks how many times AI validation has failed for a given validation

ALTER TABLE PENDING_VALIDATIONS ADD COLUMN ai_retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE PENDING_VALIDATIONS ADD COLUMN last_ai_error TEXT;
