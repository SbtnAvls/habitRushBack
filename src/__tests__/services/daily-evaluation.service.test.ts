import { DailyEvaluationService } from '../../services/daily-evaluation.service';
import * as habitEvaluationService from '../../services/habit-evaluation.service';

// Mock del servicio de evaluación de hábitos
jest.mock('../../services/habit-evaluation.service');

// Mock de console.warn y console.error para evitar spam en tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

describe('Daily Evaluation Service', () => {
  let service: DailyEvaluationService;

  beforeEach(() => {
    service = new DailyEvaluationService();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('runDailyEvaluationWithPendingRedemptions', () => {
    it('should run evaluation successfully', async () => {
      const mockResults = [
        {
          user_id: 'user-1',
          date: '2024-01-19',
          missed_habits: ['habit-1'],
          pending_redemptions_created: 1,
        },
        {
          user_id: 'user-2',
          date: '2024-01-19',
          missed_habits: [],
          pending_redemptions_created: 0,
        },
      ];

      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockResolvedValue(0);
      (habitEvaluationService.evaluateAllUsersWithPendingRedemptions as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluationWithPendingRedemptions();

      expect(habitEvaluationService.processExpiredPendingRedemptions).toHaveBeenCalledTimes(1);
      expect(habitEvaluationService.evaluateAllUsersWithPendingRedemptions).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Starting daily evaluation'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Completed in'));
    });

    it('should not run if already running', async () => {
      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000)),
      );

      // Start first evaluation (don't await)
      const promise1 = service.runDailyEvaluationWithPendingRedemptions();

      // Try second evaluation while the first is running
      await service.runDailyEvaluationWithPendingRedemptions();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Already running'));

      // Clean up
      jest.advanceTimersByTime(1000);
      await promise1;
    });

    it('should not run twice on the same day', async () => {
      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockResolvedValue(0);
      (habitEvaluationService.evaluateAllUsersWithPendingRedemptions as jest.Mock).mockResolvedValue([]);

      // First execution
      await service.runDailyEvaluationWithPendingRedemptions();

      // Second execution the same day
      await service.runDailyEvaluationWithPendingRedemptions();

      expect(habitEvaluationService.evaluateAllUsersWithPendingRedemptions).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Already executed today'));
    });

    it('should log statistics correctly', async () => {
      const mockResults = [
        {
          user_id: 'user-1',
          date: '2024-01-19',
          missed_habits: ['habit-1', 'habit-2'],
          pending_redemptions_created: 2,
        },
        {
          user_id: 'user-2',
          date: '2024-01-19',
          missed_habits: ['habit-1'],
          pending_redemptions_created: 1,
        },
        {
          user_id: 'user-3',
          date: '2024-01-19',
          missed_habits: [],
          pending_redemptions_created: 0,
        },
      ];

      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockResolvedValue(2);
      (habitEvaluationService.evaluateAllUsersWithPendingRedemptions as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluationWithPendingRedemptions();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Processed 2 expired pending redemptions'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Stats: users=3'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('missed=2'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('pendingCreated=3'));
    });

    it('should handle errors gracefully', async () => {
      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.runDailyEvaluationWithPendingRedemptions()).rejects.toThrow('Database connection failed');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[DailyEvaluation] Error during daily evaluation'),
        expect.any(Error),
      );
    });
  });

  describe('getTimeUntilNextExecution', () => {
    it('should calculate time until 00:05 today if before 00:05', () => {
      // Set current time to 23:00 (before 00:05)
      const mockDate = new Date('2024-01-19T23:00:00');
      jest.setSystemTime(mockDate);

      const timeUntil = DailyEvaluationService.getTimeUntilNextExecution();

      // Should be approximately 1 hour and 5 minutes (65 minutes)
      const expectedMs = 65 * 60 * 1000;
      expect(timeUntil).toBeGreaterThan(expectedMs - 1000);
      expect(timeUntil).toBeLessThan(expectedMs + 1000);
    });

    it('should calculate time until 00:05 tomorrow if after 00:05', () => {
      // Set current time to 01:00 (after 00:05)
      const mockDate = new Date('2024-01-19T01:00:00');
      jest.setSystemTime(mockDate);

      const timeUntil = DailyEvaluationService.getTimeUntilNextExecution();

      // Should be approximately 23 hours and 5 minutes
      const expectedMs = (23 * 60 + 5) * 60 * 1000;
      expect(timeUntil).toBeGreaterThan(expectedMs - 1000);
      expect(timeUntil).toBeLessThan(expectedMs + 1000);
    });
  });

  describe('startWithPendingRedemptions', () => {
    it('should schedule first execution', () => {
      const mockDate = new Date('2024-01-19T23:00:00');
      jest.setSystemTime(mockDate);

      service.startWithPendingRedemptions();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Scheduling daily evaluation in'));
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Starting hourly notification job for expiring redemptions'),
      );
    });

    it('should execute at scheduled time', async () => {
      (habitEvaluationService.processExpiredPendingRedemptions as jest.Mock).mockResolvedValue(0);
      (habitEvaluationService.evaluateAllUsersWithPendingRedemptions as jest.Mock).mockResolvedValue([]);
      (habitEvaluationService.notifyExpiringRedemptions as jest.Mock).mockResolvedValue(0);

      const mockDate = new Date('2024-01-19T23:59:00');
      jest.setSystemTime(mockDate);

      service.startWithPendingRedemptions();

      // Advance until 00:05 (6 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);
      await jest.runOnlyPendingTimersAsync();

      expect(habitEvaluationService.processExpiredPendingRedemptions).toHaveBeenCalled();
      expect(habitEvaluationService.evaluateAllUsersWithPendingRedemptions).toHaveBeenCalled();
    });
  });

  describe('startHourlyNotifications', () => {
    it('should run notifications immediately and then every hour', async () => {
      (habitEvaluationService.notifyExpiringRedemptions as jest.Mock).mockResolvedValue(5);

      service.startHourlyNotifications();

      // Should run immediately
      await jest.runOnlyPendingTimersAsync();
      expect(habitEvaluationService.notifyExpiringRedemptions).toHaveBeenCalledWith(3);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Sent 5 expiring redemption notifications'),
      );
    });

    it('should handle notification errors gracefully', async () => {
      (habitEvaluationService.notifyExpiringRedemptions as jest.Mock).mockRejectedValue(
        new Error('Notification failed'),
      );

      service.startHourlyNotifications();

      await jest.runOnlyPendingTimersAsync();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[DailyEvaluation] Error sending expiring notifications'),
        expect.any(Error),
      );
    });
  });
});
