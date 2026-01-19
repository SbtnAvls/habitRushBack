-- Migration: Track cron job executions for catch-up on server restart
-- This table stores the last execution time of each cron job

CREATE TABLE IF NOT EXISTS CRON_JOB_EXECUTIONS (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  last_execution DATETIME NOT NULL,
  last_status ENUM('success', 'failed', 'skipped') NOT NULL DEFAULT 'success',
  last_error TEXT NULL,
  execution_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX idx_cron_last_execution ON CRON_JOB_EXECUTIONS(last_execution);
