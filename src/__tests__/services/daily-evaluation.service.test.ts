import { DailyEvaluationService } from '../../services/daily-evaluation.service';
import * as habitEvaluationService from '../../services/habit-evaluation.service';
import { format } from 'date-fns';

// Mock del servicio de evaluación de hábitos
jest.mock('../../services/habit-evaluation.service');

// Mock de console.log para evitar spam en tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
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

  describe('runDailyEvaluation', () => {
    it('should run evaluation successfully', async () => {
      const mockResults = [
        {
          user_id: 'user-1',
          date: '2024-01-19',
          missed_habits: ['habit-1'],
          lives_lost: 1,
          new_lives_total: 1,
          habits_disabled: [],
        },
        {
          user_id: 'user-2',
          date: '2024-01-19',
          missed_habits: [],
          lives_lost: 0,
          new_lives_total: 2,
          habits_disabled: [],
        },
      ];

      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluation();

      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Starting daily evaluation'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Completed in'));
    });

    it('should not run if already running', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000)),
      );

      // Iniciar primera evaluación
      const promise1 = service.runDailyEvaluation();

      // Intentar segunda evaluación mientras la primera está corriendo
      await service.runDailyEvaluation();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Already running'));

      await promise1;
    });

    it('should not run twice on the same day', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue([]);

      // Primera ejecución
      await service.runDailyEvaluation();

      // Segunda ejecución el mismo día
      await service.runDailyEvaluation();

      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Already executed today'));
    });

    it('should log statistics correctly', async () => {
      const mockResults = [
        {
          user_id: 'user-1',
          missed_habits: ['habit-1', 'habit-2'],
          lives_lost: 2,
          new_lives_total: 0,
          habits_disabled: ['habit-1', 'habit-2', 'habit-3'],
          date: '2024-01-19',
        },
        {
          user_id: 'user-2',
          missed_habits: ['habit-1'],
          lives_lost: 1,
          new_lives_total: 1,
          habits_disabled: [],
          date: '2024-01-19',
        },
        {
          user_id: 'user-3',
          missed_habits: [],
          lives_lost: 0,
          new_lives_total: 2,
          habits_disabled: [],
          date: '2024-01-19',
        },
      ];

      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluation();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total users evaluated: 3'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Users with missed habits: 2'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total lives lost: 3'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total habits disabled: 3'));
    });

    it('should log users with no lives', async () => {
      const mockResults = [
        {
          user_id: 'user-dead',
          missed_habits: ['habit-1', 'habit-2'],
          lives_lost: 2,
          new_lives_total: 0,
          habits_disabled: ['habit-1', 'habit-2'],
          date: '2024-01-19',
        },
      ];

      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluation();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('users have no lives left'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('User user-dead'));
    });

    it('should handle errors gracefully', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.runDailyEvaluation()).rejects.toThrow('Database connection failed');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error during evaluation'), expect.any(Error));
    });
  });

  describe('startScheduled', () => {
    it('should start scheduled service with correct interval', () => {
      const intervalMs = 1000;

      const intervalId = service.startScheduled(intervalMs, false);

      expect(intervalId).toBeDefined();

      // Limpiar
      clearInterval(intervalId);
    });

    it('should run immediately if runImmediately is true', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue([]);

      service.startScheduled(1000, true);

      // Esperar a que se ejecute
      await jest.runOnlyPendingTimersAsync();

      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalled();
    });

    it('should execute periodically', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue([]);

      const intervalId = service.startScheduled(1000, false);

      // Avanzar tiempo 3 veces
      jest.advanceTimersByTime(3000);
      await jest.runOnlyPendingTimersAsync();

      // Debe haber ejecutado 3 veces
      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalledTimes(3);

      clearInterval(intervalId);
    });

    it('should continue running even if one execution fails', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock)
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce([]);

      const intervalId = service.startScheduled(1000, false);

      jest.advanceTimersByTime(2000);
      await jest.runOnlyPendingTimersAsync();

      // Debe haber intentado ejecutar 2 veces
      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalledTimes(2);

      clearInterval(intervalId);
    });
  });

  describe('getTimeUntilNextExecution', () => {
    it('should calculate time until 00:05 today if before 00:05', () => {
      // Set current time to 23:00 (before 00:05)
      const mockDate = new Date('2024-01-19T23:00:00');
      jest.setSystemTime(mockDate);

      const timeUntil = DailyEvaluationService.getTimeUntilNextExecution();

      // Debe ser aproximadamente 1 hora y 5 minutos (65 minutos)
      const expectedMs = 65 * 60 * 1000;
      expect(timeUntil).toBeGreaterThan(expectedMs - 1000);
      expect(timeUntil).toBeLessThan(expectedMs + 1000);
    });

    it('should calculate time until 00:05 tomorrow if after 00:05', () => {
      // Set current time to 01:00 (after 00:05)
      const mockDate = new Date('2024-01-19T01:00:00');
      jest.setSystemTime(mockDate);

      const timeUntil = DailyEvaluationService.getTimeUntilNextExecution();

      // Debe ser aproximadamente 23 horas y 5 minutos
      const expectedMs = (23 * 60 + 5) * 60 * 1000;
      expect(timeUntil).toBeGreaterThan(expectedMs - 1000);
      expect(timeUntil).toBeLessThan(expectedMs + 1000);
    });

    it('should handle exactly at 00:05', () => {
      const mockDate = new Date('2024-01-19T00:05:00');
      jest.setSystemTime(mockDate);

      const timeUntil = DailyEvaluationService.getTimeUntilNextExecution();

      // Debe ser 24 horas
      const expectedMs = 24 * 60 * 60 * 1000;
      expect(timeUntil).toBeGreaterThan(expectedMs - 1000);
      expect(timeUntil).toBeLessThan(expectedMs + 1000);
    });
  });

  describe('startDailyAt0005', () => {
    it('should schedule first execution at 00:05', () => {
      const mockDate = new Date('2024-01-19T23:00:00');
      jest.setSystemTime(mockDate);

      service.startDailyAt0005();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Scheduling first execution in'));
    });

    it('should execute at scheduled time', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue([]);

      const mockDate = new Date('2024-01-19T23:59:00');
      jest.setSystemTime(mockDate);

      service.startDailyAt0005();

      // Avanzar hasta 00:05 (6 minutos)
      jest.advanceTimersByTime(6 * 60 * 1000);
      await jest.runOnlyPendingTimersAsync();

      expect(habitEvaluationService.evaluateAllUsersDailyHabits).toHaveBeenCalled();
    });
  });

  describe('integration tests', () => {
    it('should handle multiple users with different outcomes', async () => {
      const mockResults = [
        {
          user_id: 'user-perfect',
          missed_habits: [],
          lives_lost: 0,
          new_lives_total: 2,
          habits_disabled: [],
          date: '2024-01-19',
        },
        {
          user_id: 'user-warning',
          missed_habits: ['habit-1'],
          lives_lost: 1,
          new_lives_total: 1,
          habits_disabled: [],
          date: '2024-01-19',
        },
        {
          user_id: 'user-dead',
          missed_habits: ['habit-1', 'habit-2'],
          lives_lost: 2,
          new_lives_total: 0,
          habits_disabled: ['habit-1', 'habit-2', 'habit-3'],
          date: '2024-01-19',
        },
      ];

      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue(mockResults);

      await service.runDailyEvaluation();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total users evaluated: 3'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Users with missed habits: 2'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('1 users have no lives left'));
    });

    it('should update lastExecutionDate after successful run', async () => {
      (habitEvaluationService.evaluateAllUsersDailyHabits as jest.Mock).mockResolvedValue([]);

      const today = format(new Date(), 'yyyy-MM-dd');

      await service.runDailyEvaluation();

      // Intentar ejecutar nuevamente
      await service.runDailyEvaluation();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`Already executed today (${today})`));
    });
  });
});
