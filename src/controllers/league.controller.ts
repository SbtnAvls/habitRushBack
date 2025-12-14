import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import db from '../db';
import { AuthRequest } from '../middleware/auth.middleware';

// @desc    Get current league classification
// @route   GET /api/leagues/current
// @access  Private
const getCurrentLeague = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const [weekRows] = await db.query<RowDataPacket[]>('SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT 1');

    if (weekRows.length === 0) {
      res.status(404).json({ message: 'No active league week found.' });
      return;
    }
    const currentWeekId = weekRows[0].id as number;

    const [competitorRows] = await db.query<RowDataPacket[]>(
      'SELECT league_id FROM LEAGUE_COMPETITORS WHERE user_id = ? AND league_week_id = ?',
      [userId, currentWeekId],
    );

    if (competitorRows.length === 0) {
      res.status(200).json({ message: 'User not found in any league for the current week.', competitors: [] });
      return;
    }
    const userLeagueId = competitorRows[0].league_id as number;

    const [leagueInfoRows] = await db.query<RowDataPacket[]>(
      'SELECT id, name, color_hex as colorHex FROM LEAGUES WHERE id = ?',
      [userLeagueId],
    );

    if (leagueInfoRows.length === 0) {
      res.status(404).json({ message: 'League not found.' });
      return;
    }

    const [competitorsRows] = await db.query<RowDataPacket[]>(
      `SELECT 
          name, 
          weekly_xp AS weeklyXp, 
          position, 
          is_real AS isReal, 
          user_id AS userId
       FROM LEAGUE_COMPETITORS 
       WHERE league_id = ? AND league_week_id = ? 
       ORDER BY position ASC`,
      [userLeagueId, currentWeekId],
    );

    res.status(200).json({
      league: leagueInfoRows[0],
      competitors: competitorsRows,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error fetching current league information.' });
  }
};

// @desc    Get user's league history
// @route   GET /api/users/me/league-history
// @access  Private
const getLeagueHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const [historyRows] = await db.query<RowDataPacket[]>(
      `SELECT 
          ulh.weekly_xp AS weeklyXp, 
          ulh.position, 
          ulh.change_type AS changeType,
          l.name AS leagueName,
          l.color_hex AS leagueColor,
          lw.week_start AS weekStart
       FROM USER_LEAGUE_HISTORY ulh
       JOIN LEAGUES l ON ulh.league_id = l.id
       JOIN LEAGUE_WEEKS lw ON ulh.league_week_id = lw.id
       WHERE ulh.user_id = ?
       ORDER BY lw.week_start DESC`,
      [userId],
    );

    res.status(200).json(historyRows);
  } catch (_error) {
    res.status(500).json({ message: 'Error fetching league history.' });
  }
};

export { getCurrentLeague, getLeagueHistory };
