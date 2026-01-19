import pool from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface CronJobExecution {
  id: string;
  name: string;
  last_execution: Date;
  last_status: 'success' | 'failed' | 'skipped';
  last_error: string | null;
  execution_count: number;
  created_at: Date;
  updated_at: Date;
}

interface CronJobExecutionRow extends RowDataPacket, CronJobExecution {}

export class CronJobExecutionModel {
  /**
   * Get the last execution record for a job
   */
  static async getById(id: string): Promise<CronJobExecution | null> {
    const [rows] = await pool.query<CronJobExecutionRow[]>(
      'SELECT * FROM CRON_JOB_EXECUTIONS WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all job execution records
   */
  static async getAll(): Promise<CronJobExecution[]> {
    const [rows] = await pool.query<CronJobExecutionRow[]>(
      'SELECT * FROM CRON_JOB_EXECUTIONS ORDER BY last_execution DESC'
    );
    return rows;
  }

  /**
   * Record a job execution (insert or update)
   */
  static async recordExecution(
    id: string,
    name: string,
    status: 'success' | 'failed' | 'skipped',
    error?: string
  ): Promise<void> {
    await pool.query<ResultSetHeader>(
      `INSERT INTO CRON_JOB_EXECUTIONS (id, name, last_execution, last_status, last_error, execution_count)
       VALUES (?, ?, NOW(), ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         last_execution = NOW(),
         last_status = VALUES(last_status),
         last_error = VALUES(last_error),
         execution_count = execution_count + 1`,
      [id, name, status, error || null]
    );
  }

  /**
   * Check if a job should run based on last execution time
   * @param id Job ID
   * @param maxAgeHours Maximum hours since last execution before catch-up is needed
   * @returns true if job should run (never ran or older than maxAgeHours)
   */
  static async shouldRunCatchUp(id: string, maxAgeHours: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT last_execution,
              TIMESTAMPDIFF(HOUR, last_execution, NOW()) as hours_since
       FROM CRON_JOB_EXECUTIONS
       WHERE id = ?`,
      [id]
    );

    // Never ran before - should run
    if (rows.length === 0) {
      return true;
    }

    // Check if enough time has passed
    return rows[0].hours_since >= maxAgeHours;
  }

  /**
   * Check if a job has already run today (based on server timezone)
   * @param id Job ID
   * @returns true if job has already executed today
   */
  static async hasRunToday(id: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM CRON_JOB_EXECUTIONS
       WHERE id = ?
       AND DATE(last_execution) = CURDATE()
       AND last_status = 'success'
       LIMIT 1`,
      [id]
    );
    return rows.length > 0;
  }

  /**
   * Get jobs that need catch-up execution
   * @param jobIds List of job IDs to check
   * @param maxAgeHours Maximum hours since last execution
   * @returns List of job IDs that need to run
   */
  static async getJobsNeedingCatchUp(jobIds: string[], maxAgeHours: number): Promise<string[]> {
    if (jobIds.length === 0) return [];

    // Get all recorded executions for these jobs
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, TIMESTAMPDIFF(HOUR, last_execution, NOW()) as hours_since
       FROM CRON_JOB_EXECUTIONS
       WHERE id IN (?)`,
      [jobIds]
    );

    const executionMap = new Map<string, number>();
    rows.forEach(row => {
      executionMap.set(row.id, row.hours_since);
    });

    // Jobs that need catch-up: never ran OR older than maxAgeHours
    return jobIds.filter(id => {
      const hoursSince = executionMap.get(id);
      return hoursSince === undefined || hoursSince >= maxAgeHours;
    });
  }
}
