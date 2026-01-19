-- Migration: Add category_id to HABITS table if missing
-- This was supposed to be added in 002_challenges_system.sql but failed due to MySQL syntax

-- Add category_id column (will fail gracefully if exists)
ALTER TABLE HABITS ADD COLUMN category_id VARCHAR(50) NOT NULL DEFAULT 'health';

-- Add foreign key constraint
ALTER TABLE HABITS ADD CONSTRAINT fk_habit_category
  FOREIGN KEY (category_id) REFERENCES HABIT_CATEGORIES(id);

-- Create index for category lookups
CREATE INDEX idx_habits_category ON HABITS(category_id);
