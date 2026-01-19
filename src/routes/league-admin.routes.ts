import express, { Router } from 'express';
import { adminKeyMiddleware } from '../middleware/auth.middleware';
import { cronTrackingMiddleware } from '../middleware/cron-tracking.middleware';
import * as leagueAdminController from '../controllers/league-admin.controller';

const router: Router = express.Router();

// Todas las rutas admin requieren API key (X-Admin-Key header)
router.use(adminKeyMiddleware);

// Track cron job executions for catch-up system
router.use(cronTrackingMiddleware);

// POST /leagues/admin/start-week - Iniciar nueva semana
router.post('/start-week', leagueAdminController.startWeek);

// POST /leagues/admin/simulate-bots - Simular XP de bots (LEGACY - full daily XP)
router.post('/simulate-bots', leagueAdminController.simulateBots);

// POST /leagues/admin/end-week - Procesar fin de semana
router.post('/end-week', leagueAdminController.endWeek);

// GET /leagues/admin/summary - Resumen de semana actual
router.get('/summary', leagueAdminController.getWeekStatus);

// POST /leagues/admin/update-positions - Actualizar posiciones
router.post('/update-positions', leagueAdminController.updatePositions);

// DELETE /leagues/admin/cleanup - Limpiar semanas antiguas
router.delete('/cleanup', leagueAdminController.cleanup);

// ============================================================================
// TESTING ENDPOINTS - Realistic Bot XP Simulation
// ============================================================================

// GET /leagues/admin/bot-progress - Ver progreso diario de bots
router.get('/bot-progress', leagueAdminController.getBotProgress);

// POST /leagues/admin/bot-reset - Ejecutar reset diario (asignar targets)
router.post('/bot-reset', leagueAdminController.triggerBotReset);

// POST /leagues/admin/bot-simulate-habits - Ejecutar simulacion de habitos
router.post('/bot-simulate-habits', leagueAdminController.triggerBotHabitSimulation);

// GET /leagues/admin/activity-info - Ver info de actividad por hora
router.get('/activity-info', leagueAdminController.getActivityInfo);

export default router;
