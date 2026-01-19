-- Migration: Add category_id and is_general columns to CHALLENGES table
-- These columns are required for the pending redemption system to filter
-- challenges by habit category

ALTER TABLE CHALLENGES
ADD COLUMN category_id VARCHAR(50) NULL AFTER type,
ADD COLUMN is_general TINYINT(1) NOT NULL DEFAULT 1 AFTER category_id;

-- Existing challenges are marked as general (can be used for any category)
-- New category-specific challenges can be added with is_general = 0
