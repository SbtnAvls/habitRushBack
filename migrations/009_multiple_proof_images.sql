-- Migration: Change proof_image_url to proof_image_urls (JSON array)
-- This allows users to submit 1-2 proof images instead of just one

-- Step 1: Add new column for array of image URLs (stored as JSON)
ALTER TABLE PENDING_VALIDATIONS
ADD COLUMN proof_image_urls JSON AFTER proof_text;

-- Step 2: Migrate existing data from proof_image_url to proof_image_urls
-- Convert single image URL to JSON array with one element
UPDATE PENDING_VALIDATIONS
SET proof_image_urls = JSON_ARRAY(proof_image_url)
WHERE proof_image_url IS NOT NULL AND proof_image_url != '';

-- Step 3: Drop the old column
ALTER TABLE PENDING_VALIDATIONS
DROP COLUMN proof_image_url;

-- Note: After running this migration, the application expects:
-- - proof_image_urls: JSON array of 1-2 file paths (e.g., ["user123_abc.jpg", "user123_def.jpg"])
-- - proof_type: 'image' (1-2 images only) or 'both' (1-2 images + text)
-- - Text-only proofs are no longer supported; at least 1 image is required
