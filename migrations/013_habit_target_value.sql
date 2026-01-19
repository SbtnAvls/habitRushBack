-- Migration: Add target_value field to HABITS table
-- This field stores the minimum/target value for time and count type habits
-- For 'time' habits: stores minutes (e.g., 30 = 30 minutes minimum)
-- For 'count' habits: stores quantity (e.g., 20 = 20 pages, 10 = 10 glasses of water)
-- For 'yes_no' habits: this field should be NULL (not applicable)

ALTER TABLE HABITS
ADD COLUMN target_value INT NULL DEFAULT NULL AFTER progress_type;

-- Add a comment to the column for documentation
ALTER TABLE HABITS
MODIFY COLUMN target_value INT NULL DEFAULT NULL COMMENT 'Target/minimum value for time (minutes) or count habits. NULL for yes_no type.';
