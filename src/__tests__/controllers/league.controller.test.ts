import { Response } from 'express';
import * as leagueController from '../../controllers/league.controller';
import db from '../../db';
import { mockRequest, mockResponse } from '../helpers/test-helpers';
import { RowDataPacket } from 'mysql2';

// Mock the database module
jest.mock('../../db');

describe('League Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentLeague', () => {
    it('should return current league and competitors successfully', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 2;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      // Mock LEAGUE_WEEKS query
      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];

      // Mock LEAGUE_COMPETITORS query (user's league)
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];

      // Mock LEAGUES query
      const leagueInfoRows: RowDataPacket[] = [
        {
          id: leagueId,
          name: 'Silver',
          colorHex: '#C0C0C0',
        },
      ] as RowDataPacket[];

      // Mock competitors list
      const competitorsRows: RowDataPacket[] = [
        {
          name: 'Alice Johnson',
          weeklyXp: 1850,
          position: 1,
          isReal: true,
          userId: 'user-456',
        },
        {
          name: 'Test User',
          weeklyXp: 1500,
          position: 2,
          isReal: true,
          userId: userId,
        },
        {
          name: 'Bot Player',
          weeklyXp: 1200,
          position: 3,
          isReal: false,
          userId: null,
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows])
        .mockResolvedValueOnce([competitorsRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        league: {
          id: leagueId,
          name: 'Silver',
          colorHex: '#C0C0C0',
        },
        competitors: competitorsRows,
      });

      // Verify database queries
      expect(db.query).toHaveBeenCalledTimes(4);
      expect(db.query).toHaveBeenNthCalledWith(1, 'SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT 1');
      expect(db.query).toHaveBeenNthCalledWith(
        2,
        'SELECT league_id FROM LEAGUE_COMPETITORS WHERE user_id = ? AND league_week_id = ?',
        [userId, currentWeekId],
      );
    });

    it('should return 404 if no active league week found', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      // Mock empty LEAGUE_WEEKS query
      const weekRows: RowDataPacket[] = [] as RowDataPacket[];
      (db.query as jest.Mock).mockResolvedValueOnce([weekRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'No active league week found.',
      });
    });

    it('should return 200 with empty competitors if user not in any league', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      // Mock LEAGUE_WEEKS query
      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];

      // Mock empty LEAGUE_COMPETITORS query
      const competitorRows: RowDataPacket[] = [] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([weekRows]).mockResolvedValueOnce([competitorRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User not found in any league for the current week.',
        competitors: [],
      });
    });

    it('should return 404 if league not found in database', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 99; // Non-existent league

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      // Mock LEAGUE_WEEKS query
      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];

      // Mock LEAGUE_COMPETITORS query
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];

      // Mock empty LEAGUES query
      const leagueInfoRows: RowDataPacket[] = [] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'League not found.',
      });
    });

    it('should handle user in Bronze league (league_id = 1)', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 1;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];
      const leagueInfoRows: RowDataPacket[] = [
        {
          id: leagueId,
          name: 'Bronze',
          colorHex: '#CD7F32',
        },
      ] as RowDataPacket[];

      const competitorsRows: RowDataPacket[] = [
        {
          name: 'Test User',
          weeklyXp: 500,
          position: 10,
          isReal: true,
          userId: userId,
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows])
        .mockResolvedValueOnce([competitorsRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        league: {
          id: 1,
          name: 'Bronze',
          colorHex: '#CD7F32',
        },
        competitors: competitorsRows,
      });
    });

    it('should handle user in Master league (league_id = 5)', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 5;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];
      const leagueInfoRows: RowDataPacket[] = [
        {
          id: leagueId,
          name: 'Master',
          colorHex: '#E5E4E2',
        },
      ] as RowDataPacket[];

      const competitorsRows: RowDataPacket[] = [
        {
          name: 'Test User',
          weeklyXp: 5000,
          position: 1,
          isReal: true,
          userId: userId,
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows])
        .mockResolvedValueOnce([competitorsRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        league: {
          id: 5,
          name: 'Master',
          colorHex: '#E5E4E2',
        },
        competitors: competitorsRows,
      });
    });

    it('should return competitors ordered by position ASC', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 2;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];
      const leagueInfoRows: RowDataPacket[] = [
        {
          id: leagueId,
          name: 'Silver',
          colorHex: '#C0C0C0',
        },
      ] as RowDataPacket[];

      // Competitors should be ordered by position
      const competitorsRows: RowDataPacket[] = [
        { name: 'First Place', weeklyXp: 2000, position: 1, isReal: true, userId: 'user-1' },
        { name: 'Second Place', weeklyXp: 1800, position: 2, isReal: true, userId: 'user-2' },
        { name: 'Third Place', weeklyXp: 1600, position: 3, isReal: false, userId: null },
        { name: 'Last Place', weeklyXp: 100, position: 20, isReal: false, userId: null },
      ] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows])
        .mockResolvedValueOnce([competitorsRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = (res.json as jest.Mock).mock.calls[0][0];

      // Verify ordering
      expect(response.competitors[0].position).toBe(1);
      expect(response.competitors[1].position).toBe(2);
      expect(response.competitors[2].position).toBe(3);
      expect(response.competitors[3].position).toBe(20);
    });

    it('should return 500 if database error occurs', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (db.query as jest.Mock).mockRejectedValueOnce(new Error('Database connection failed'));

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Error fetching current league information.',
      });
    });

    it('should handle mixture of real users and bots', async () => {
      const userId = 'user-123';
      const currentWeekId = 1;
      const leagueId = 3;

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const weekRows: RowDataPacket[] = [{ id: currentWeekId }] as RowDataPacket[];
      const competitorRows: RowDataPacket[] = [{ league_id: leagueId }] as RowDataPacket[];
      const leagueInfoRows: RowDataPacket[] = [
        {
          id: leagueId,
          name: 'Gold',
          colorHex: '#FFD700',
        },
      ] as RowDataPacket[];

      const competitorsRows: RowDataPacket[] = [
        { name: 'Real User 1', weeklyXp: 2000, position: 1, isReal: true, userId: 'user-1' },
        { name: 'Bot 1', weeklyXp: 1900, position: 2, isReal: false, userId: null },
        { name: 'Real User 2', weeklyXp: 1800, position: 3, isReal: true, userId: 'user-2' },
        { name: 'Bot 2', weeklyXp: 1700, position: 4, isReal: false, userId: null },
        { name: 'Test User', weeklyXp: 1600, position: 5, isReal: true, userId: userId },
      ] as RowDataPacket[];

      (db.query as jest.Mock)
        .mockResolvedValueOnce([weekRows])
        .mockResolvedValueOnce([competitorRows])
        .mockResolvedValueOnce([leagueInfoRows])
        .mockResolvedValueOnce([competitorsRows]);

      await leagueController.getCurrentLeague(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      const response = (res.json as jest.Mock).mock.calls[0][0];

      // Verify mix of bots and real users
      expect(response.competitors.filter((c: any) => c.isReal)).toHaveLength(3);
      expect(response.competitors.filter((c: any) => !c.isReal)).toHaveLength(2);
      expect(response.competitors.filter((c: any) => c.userId === null)).toHaveLength(2);
    });
  });

  describe('getLeagueHistory', () => {
    it('should return league history successfully', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 1850,
          position: 3,
          changeType: 'promoted',
          leagueName: 'Silver',
          leagueColor: '#C0C0C0',
          weekStart: new Date('2025-10-14'),
        },
        {
          weeklyXp: 1520,
          position: 5,
          changeType: 'promoted',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-10-07'),
        },
        {
          weeklyXp: 1200,
          position: 12,
          changeType: 'stayed',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-09-30'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(historyRows);

      // Verify query
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM USER_LEAGUE_HISTORY ulh'), [userId]);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY lw.week_start DESC'), [userId]);
    });

    it('should return empty array if user has no league history', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should return history with promoted status', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 2000,
          position: 2,
          changeType: 'promoted',
          leagueName: 'Gold',
          leagueColor: '#FFD700',
          weekStart: new Date('2025-10-14'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: 'promoted',
            position: 2,
          }),
        ]),
      );
    });

    it('should return history with relegated status', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 500,
          position: 18,
          changeType: 'relegated',
          leagueName: 'Silver',
          leagueColor: '#C0C0C0',
          weekStart: new Date('2025-10-14'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: 'relegated',
            position: 18,
          }),
        ]),
      );
    });

    it('should return history with stayed status', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 1200,
          position: 10,
          changeType: 'stayed',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-10-14'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: 'stayed',
            position: 10,
          }),
        ]),
      );
    });

    it('should return history ordered by week_start DESC (most recent first)', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 1850,
          position: 3,
          changeType: 'promoted',
          leagueName: 'Silver',
          leagueColor: '#C0C0C0',
          weekStart: new Date('2025-10-21'), // Most recent
        },
        {
          weeklyXp: 1520,
          position: 5,
          changeType: 'stayed',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-10-14'),
        },
        {
          weeklyXp: 1200,
          position: 12,
          changeType: 'stayed',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-10-07'), // Oldest
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      const response = (res.json as jest.Mock).mock.calls[0][0];

      // Verify ordering (most recent first)
      expect(new Date(response[0].weekStart).getTime()).toBeGreaterThan(new Date(response[1].weekStart).getTime());
      expect(new Date(response[1].weekStart).getTime()).toBeGreaterThan(new Date(response[2].weekStart).getTime());
    });

    it('should return history with multiple leagues progression', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 2500,
          position: 1,
          changeType: 'promoted',
          leagueName: 'Diamond',
          leagueColor: '#B9F2FF',
          weekStart: new Date('2025-10-21'),
        },
        {
          weeklyXp: 2200,
          position: 3,
          changeType: 'promoted',
          leagueName: 'Gold',
          leagueColor: '#FFD700',
          weekStart: new Date('2025-10-14'),
        },
        {
          weeklyXp: 1850,
          position: 4,
          changeType: 'promoted',
          leagueName: 'Silver',
          leagueColor: '#C0C0C0',
          weekStart: new Date('2025-10-07'),
        },
        {
          weeklyXp: 1500,
          position: 5,
          changeType: 'promoted',
          leagueName: 'Bronze',
          leagueColor: '#CD7F32',
          weekStart: new Date('2025-09-30'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      const response = (res.json as jest.Mock).mock.calls[0][0];

      // Verify progression through leagues
      expect(response).toHaveLength(4);
      expect(response[0].leagueName).toBe('Diamond');
      expect(response[1].leagueName).toBe('Gold');
      expect(response[2].leagueName).toBe('Silver');
      expect(response[3].leagueName).toBe('Bronze');
    });

    it('should return 500 if database error occurs', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      (db.query as jest.Mock).mockRejectedValueOnce(new Error('Database connection failed'));

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Error fetching league history.',
      });
    });

    it('should include all league information in response', async () => {
      const userId = 'user-123';

      const req = mockRequest({
        user: { id: userId },
      }) as any;
      const res = mockResponse() as unknown as Response;

      const historyRows: RowDataPacket[] = [
        {
          weeklyXp: 1850,
          position: 3,
          changeType: 'promoted',
          leagueName: 'Silver',
          leagueColor: '#C0C0C0',
          weekStart: new Date('2025-10-14'),
        },
      ] as RowDataPacket[];

      (db.query as jest.Mock).mockResolvedValueOnce([historyRows]);

      await leagueController.getLeagueHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);

      const response = (res.json as jest.Mock).mock.calls[0][0];

      // Verify all fields are present
      expect(response[0]).toHaveProperty('weeklyXp');
      expect(response[0]).toHaveProperty('position');
      expect(response[0]).toHaveProperty('changeType');
      expect(response[0]).toHaveProperty('leagueName');
      expect(response[0]).toHaveProperty('leagueColor');
      expect(response[0]).toHaveProperty('weekStart');
    });
  });
});
