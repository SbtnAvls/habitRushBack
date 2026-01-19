import { CronJobExecutionModel } from '../models/cron-job-execution.model';
import * as fs from 'fs';
import * as path from 'path';

interface CronJob {
  id: string;
  name: string;
  description: string;
  schedule: string;
  endpoint: string;
  method: string;
  priority: string;
  timeout: number;
  retries: number;
}

interface CronConfig {
  baseUrl: string;
  headers: Record<string, string>;
  jobs: {
    daily: CronJob[];
    weekly: CronJob[];
    monthly: CronJob[];
  };
}

// Maximum age in hours before a job needs catch-up
const CATCH_UP_THRESHOLDS = {
  daily: 24,    // 24 hours
  weekly: 168,  // 7 days
  monthly: 720, // 30 days
};

class CronCatchUpService {
  private config: CronConfig | null = null;
  private baseUrl: string = '';
  private adminKey: string = '';

  /**
   * Load cron configuration from file
   * CRITICAL FIX: Added try-catch for JSON.parse and file read operations
   */
  private loadConfig(): CronConfig {
    if (this.config) return this.config;

    const configPath = path.join(process.cwd(), 'cron.config.json');

    // CRITICAL FIX: Check if file exists before reading
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cron config file not found: ${configPath}`);
    }

    let rawConfig: CronConfig;
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      rawConfig = JSON.parse(fileContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in cron config file: ${error.message}`);
      }
      throw new Error(`Failed to read cron config file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // CRITICAL FIX: Validate required structure
    if (!rawConfig.jobs || typeof rawConfig.jobs !== 'object') {
      throw new Error('Invalid cron config: missing or invalid "jobs" property');
    }

    // Replace environment variables
    this.baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    this.adminKey = process.env.ADMIN_API_KEY || '';

    this.config = rawConfig;
    return this.config;
  }

  /**
   * Execute a single cron job
   */
  private async executeJob(job: CronJob): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}${job.endpoint}`;

    console.log(`[CronCatchUp] Executing missed job: ${job.name} (${job.id})`);
    console.log(`[CronCatchUp] URL: ${job.method} ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), job.timeout);

      const response = await fetch(url, {
        method: job.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': this.adminKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json().catch(() => ({}));
      console.log(`[CronCatchUp] Job ${job.id} completed successfully:`, result);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CronCatchUp] Job ${job.id} failed:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check and execute missed jobs for a specific frequency
   */
  private async processMissedJobs(
    jobs: CronJob[],
    frequency: 'daily' | 'weekly' | 'monthly'
  ): Promise<void> {
    const maxAgeHours = CATCH_UP_THRESHOLDS[frequency];
    const jobIds = jobs.map(j => j.id);

    // Get jobs that need catch-up
    const jobsNeedingCatchUp = await CronJobExecutionModel.getJobsNeedingCatchUp(jobIds, maxAgeHours);

    if (jobsNeedingCatchUp.length === 0) {
      console.log(`[CronCatchUp] No ${frequency} jobs need catch-up`);
      return;
    }

    console.log(`[CronCatchUp] Found ${jobsNeedingCatchUp.length} ${frequency} jobs needing catch-up:`, jobsNeedingCatchUp);

    // Sort jobs by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const jobsToRun = jobs
      .filter(j => jobsNeedingCatchUp.includes(j.id))
      .sort((a, b) => (priorityOrder[a.priority as keyof typeof priorityOrder] || 3) - (priorityOrder[b.priority as keyof typeof priorityOrder] || 3));

    // Execute jobs sequentially (to avoid overwhelming the server)
    for (const job of jobsToRun) {
      const result = await this.executeJob(job);

      // Record execution
      await CronJobExecutionModel.recordExecution(
        job.id,
        job.name,
        result.success ? 'success' : 'failed',
        result.error
      );

      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Run catch-up for all missed cron jobs
   * Should be called on server startup
   */
  async runCatchUp(): Promise<void> {
    console.log('[CronCatchUp] Starting catch-up check for missed cron jobs...');

    try {
      const config = this.loadConfig();

      if (!this.adminKey) {
        console.warn('[CronCatchUp] ADMIN_API_KEY not configured, skipping catch-up');
        return;
      }

      // Process each frequency type
      if (config.jobs.daily?.length > 0) {
        await this.processMissedJobs(config.jobs.daily, 'daily');
      }

      if (config.jobs.weekly?.length > 0) {
        await this.processMissedJobs(config.jobs.weekly, 'weekly');
      }

      if (config.jobs.monthly?.length > 0) {
        await this.processMissedJobs(config.jobs.monthly, 'monthly');
      }

      console.log('[CronCatchUp] Catch-up check completed');
    } catch (error) {
      console.error('[CronCatchUp] Error during catch-up:', error);
    }
  }

  /**
   * Manually record a job execution (for use by actual cron runners)
   */
  async recordJobExecution(
    jobId: string,
    jobName: string,
    status: 'success' | 'failed' | 'skipped',
    error?: string
  ): Promise<void> {
    await CronJobExecutionModel.recordExecution(jobId, jobName, status, error);
  }
}

export const cronCatchUpService = new CronCatchUpService();
