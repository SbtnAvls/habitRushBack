import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { RowDataPacket } from 'mysql2';
import db from '../db';
import { LeagueCompetitor } from '../models/league-competitor.model';
import { UserLeagueHistory } from '../models/user-league-history.model';

// @desc    Get current league classification
// @route   GET /api/leagues/current
// @access  Private
const getCurrentLeague = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    // 1. Find the current week
    const [weekRows] = await db.query<RowDataPacket[]>(
        'SELECT id FROM LEAGUE_WEEKS ORDER BY week_start DESC LIMIT 1'
    );

    if (weekRows.length === 0) {
        res.status(404).json({ message: 'No active league week found.' });
        return;
    }
    const currentWeekId = weekRows[0].id;

    // 2. Find the user's current league
    const [competitorRows] = await db.query<RowDataPacket[]>(
        'SELECT league_id FROM LEAGUE_COMPETITORS WHERE user_id = ? AND league_week_id = ?',
        [userId, currentWeekId]
    );

    if (competitorRows.length === 0) {
        res.status(200).json({ message: 'User not found in any league for the current week.', competitors: [] });
        return;
    }
    const userLeagueId = competitorRows[0].league_id;

    // 3. Get league info and all competitors for that league
    const [leagueInfoRows] = await db.query<RowDataPacket[]>(
        'SELECT id, name, color_hex as colorHex FROM LEAGUES WHERE id = ?',
        [userLeagueId]
    );
    
    const [competitors] = await db.query<LeagueCompetitor[]>(
        `SELECT name, weekly_xp as weeklyXp, position, is_real as isReal, user_id as userId
         FROM LEAGUE_COMPETITORS 
         WHERE league_id = ? AND league_week_id = ? 
         ORDER BY position ASC`,
        [userLeagueId, currentWeekId]
    );

    res.status(200).json({
        league: leagueInfoRows[0],
        competitors
    });
});

// @desc    Get user's league history
// @route   GET /api/users/me/league-history
// @access  Private
const getLeagueHistory = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    const [historyRows] = await db.query<UserLeagueHistory[]>(
        `SELECT 
            ulh.weekly_xp as weeklyXp, 
            ulh.position, 
            ulh.change_type as changeType,
            l.name as leagueName,
            l.color_hex as leagueColor,
            lw.week_start as weekStart
         FROM USER_LEAGUE_HISTORY ulh
         JOIN LEAGUES l ON ulh.league_id = l.id
         JOIN LEAGUE_WEEKS lw ON ulh.league_week_id = lw.id
         WHERE ulh.user_id = ?
         ORDER BY lw.week_start DESC`,
        [userId]
    );

    res.status(200).json(historyRows);
});

export { getCurrentLeague, getLeagueHistory };
