import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { startNewLeagueWeek, getCurrentLeagueWeek } from '../services/league-management.service';
import {
  fillAllLeaguesWithBots,
  simulateDailyBotXp,
  updateAllLeaguePositions,
  resetDailyBotXp,
  simulateBotHabitCompletion,
  getBotDailyProgress,
  getCurrentHourActivityInfo,
  HOURLY_ACTIVITY_WEIGHTS,
} from '../services/league-bot.service';
import { processWeekEnd, resetWeeklyXp, getWeekSummary, cleanupOldLeagueWeeks } from '../services/league-weekly-processor.service';

/**
 * Obtener el lunes de la semana actual
 */
function getCurrentMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now); // Create copy to avoid mutation
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// @desc    Iniciar nueva semana de liga
// @route   POST /leagues/admin/start-week
// @access  Private (Admin)
export const startWeek = async (req: AuthRequest, res: Response) => {
  try {
    const weekStart = getCurrentMonday();

    // 1. Crear semana y distribuir usuarios
    const { weekId, distributed, byLeague } = await startNewLeagueWeek(weekStart);

    // 2. Rellenar con bots
    const botsResult = await fillAllLeaguesWithBots(weekId);

    // 3. Actualizar posiciones iniciales
    await updateAllLeaguePositions(weekId);

    res.status(201).json({
      message: 'League week started successfully',
      weekId,
      weekStart: weekStart.toISOString().split('T')[0],
      usersDistributed: distributed,
      usersByLeague: byLeague,
      botsCreated: botsResult.totalCreated,
      botsByLeagueGroup: botsResult.byLeagueGroup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error starting league week';
    res.status(400).json({ message });
  }
};

// @desc    Simular XP de bots (ejecutar diariamente)
// @route   POST /leagues/admin/simulate-bots
// @access  Private (Admin)
// @deprecated Use triggerBotHabitSimulation instead - this gives all XP at once
//             The new system simulates incremental XP throughout the day
export const simulateBots = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const result = await simulateDailyBotXp(currentWeek.id);
    await updateAllLeaguePositions(currentWeek.id);

    res.status(200).json({
      message: 'Bot XP simulated successfully',
      weekId: currentWeek.id,
      botsUpdated: result.botsUpdated,
      totalXpAdded: result.totalXpAdded,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error simulating bot XP' });
  }
};

// @desc    Procesar fin de semana (promociones/descensos)
// @route   POST /leagues/admin/end-week
// @access  Private (Admin)
export const endWeek = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    // 1. Procesar fin de semana (idempotente)
    const result = await processWeekEnd(currentWeek.id);

    // Si ya fue procesada, retornar sin resetear XP
    if (result.alreadyProcessed) {
      res.status(200).json({
        message: 'League week already processed',
        weekId: currentWeek.id,
        alreadyProcessed: true,
      });
      return;
    }

    // 2. Resetear XP semanal de usuarios (solo si se procesó)
    const usersReset = await resetWeeklyXp();

    res.status(200).json({
      message: 'League week ended successfully',
      weekId: currentWeek.id,
      usersProcessed: result.totalProcessed,
      resultsByLeague: result.byLeague,
      usersXpReset: usersReset,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error ending league week' });
  }
};

// @desc    Obtener resumen de semana actual
// @route   GET /leagues/admin/summary
// @access  Private (Admin)
export const getWeekStatus = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const summary = await getWeekSummary(currentWeek.id);

    res.status(200).json({
      weekId: currentWeek.id,
      weekStart: currentWeek.week_start,
      ...summary,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error getting week summary' });
  }
};

// @desc    Actualizar posiciones (recalcular ranking)
// @route   POST /leagues/admin/update-positions
// @access  Private (Admin)
export const updatePositions = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const { usersSynced, groupsUpdated } = await updateAllLeaguePositions(currentWeek.id);

    res.status(200).json({
      message: 'Positions updated successfully',
      weekId: currentWeek.id,
      usersSynced,
      groupsUpdated,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error updating positions' });
  }
};

// @desc    Limpiar semanas de liga antiguas
// @route   DELETE /leagues/admin/cleanup
// @access  Private (Admin)
export const cleanup = async (req: AuthRequest, res: Response) => {
  try {
    const weeksToKeepParam = req.query.weeksToKeep as string | undefined;
    const weeksToKeep = weeksToKeepParam ? parseInt(weeksToKeepParam, 10) : 12;

    if (isNaN(weeksToKeep) || weeksToKeep < 1 || weeksToKeep > 52) {
      res.status(400).json({ message: 'weeksToKeep must be an integer between 1 and 52' });
      return;
    }

    const result = await cleanupOldLeagueWeeks(weeksToKeep);

    res.status(200).json({
      message: 'Cleanup completed successfully',
      weeksKept: weeksToKeep,
      weeksDeleted: result.weeksDeleted,
      competitorsDeleted: result.competitorsDeleted,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error during cleanup' });
  }
};

// ============================================================================
// TESTING ENDPOINTS - Realistic Bot XP Simulation (Phase 5)
// ============================================================================

// @desc    Get bot daily progress statistics
// @route   GET /leagues/admin/bot-progress
// @access  Private (Admin)
export const getBotProgress = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const progress = await getBotDailyProgress(currentWeek.id);
    const activityInfo = getCurrentHourActivityInfo();

    res.status(200).json({
      weekId: currentWeek.id,
      currentHour: activityInfo.hour,
      hourlyActivity: {
        baseWeight: activityInfo.baseWeight,
        expectedLevel: activityInfo.expectedActivity,
      },
      botProgress: {
        totalBots: progress.totalBots,
        botsActive: progress.botsActive,
        botsSkipping: progress.botsSkipping,
        botsAtTarget: progress.botsAtTarget,
        botsNotInitialized: progress.botsNotInitialized,
        avgProgressPercent: progress.avgProgressPercent,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error getting bot progress' });
  }
};

// @desc    Manually trigger daily bot reset (sets daily XP targets)
// @route   POST /leagues/admin/bot-reset
// @access  Private (Admin)
export const triggerBotReset = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const result = await resetDailyBotXp(currentWeek.id);

    res.status(200).json({
      message: 'Daily bot reset executed successfully',
      weekId: currentWeek.id,
      botsReset: result.botsReset,
      botsSkippingToday: result.botsSkippingToday,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error executing daily bot reset' });
  }
};

// @desc    Manually trigger bot habit simulation (incremental XP)
// @route   POST /leagues/admin/bot-simulate-habits
// @access  Private (Admin)
export const triggerBotHabitSimulation = async (req: AuthRequest, res: Response) => {
  try {
    const currentWeek = await getCurrentLeagueWeek();
    if (!currentWeek) {
      res.status(404).json({ message: 'No active league week found' });
      return;
    }

    const activityInfo = getCurrentHourActivityInfo();
    const result = await simulateBotHabitCompletion(currentWeek.id);

    // Also update positions after simulation
    const posResult = await updateAllLeaguePositions(currentWeek.id);

    res.status(200).json({
      message: 'Bot habit simulation executed successfully',
      weekId: currentWeek.id,
      simulationTime: {
        hour: activityInfo.hour,
        expectedActivityLevel: activityInfo.expectedActivity,
        baseWeight: activityInfo.baseWeight,
      },
      simulationResult: {
        botsUpdated: result.botsUpdated,
        totalXpAdded: result.totalXpAdded,
        botsAtLimit: result.botsAtLimit,
        botsSkippedByHour: result.botsSkippedByHour,
      },
      positionsUpdated: {
        usersSynced: posResult.usersSynced,
        groupsUpdated: posResult.groupsUpdated,
      },
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error executing bot habit simulation' });
  }
};

// @desc    Get current hour activity info (for debugging patterns)
// @route   GET /leagues/admin/activity-info
// @access  Private (Admin)
export const getActivityInfo = async (req: AuthRequest, res: Response) => {
  try {
    const activityInfo = getCurrentHourActivityInfo();

    // Generate the full 24-hour activity table for reference
    const hourlyWeights: Record<number, { weight: number; level: string }> = {};
    for (let h = 0; h < 24; h++) {
      const weight = HOURLY_ACTIVITY_WEIGHTS[h];
      let level: string;
      if (weight >= 0.8) level = 'very high';
      else if (weight >= 0.6) level = 'high';
      else if (weight >= 0.4) level = 'medium';
      else if (weight >= 0.2) level = 'low';
      else level = 'very low';

      hourlyWeights[h] = { weight, level };
    }

    res.status(200).json({
      currentHour: activityInfo.hour,
      currentActivity: {
        baseWeight: activityInfo.baseWeight,
        expectedLevel: activityInfo.expectedActivity,
      },
      description:
        'Activity weights determine the probability of bots being active at each hour. ' +
        'Higher weights mean more bot activity. Peaks are at 8am (0.8), 12pm (0.7), and 8pm (1.0).',
      hourlyWeights,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Error getting activity info' });
  }
};
