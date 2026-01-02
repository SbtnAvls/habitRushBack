import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { startNewLeagueWeek, getCurrentLeagueWeek } from '../services/league-management.service';
import { fillAllLeaguesWithBots, simulateDailyBotXp, updateAllLeaguePositions } from '../services/league-bot.service';
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ message: 'Error during cleanup' });
  }
};
