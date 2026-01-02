import express, { Router } from 'express';
import { adminKeyMiddleware } from '../middleware/auth.middleware';
import * as leagueAdminController from '../controllers/league-admin.controller';

const router: Router = express.Router();

// Todas las rutas admin requieren API key (X-Admin-Key header)
router.use(adminKeyMiddleware);

// POST /leagues/admin/start-week - Iniciar nueva semana
router.post('/start-week', leagueAdminController.startWeek);

// POST /leagues/admin/simulate-bots - Simular XP de bots
router.post('/simulate-bots', leagueAdminController.simulateBots);

// POST /leagues/admin/end-week - Procesar fin de semana
router.post('/end-week', leagueAdminController.endWeek);

// GET /leagues/admin/summary - Resumen de semana actual
router.get('/summary', leagueAdminController.getWeekStatus);

// POST /leagues/admin/update-positions - Actualizar posiciones
router.post('/update-positions', leagueAdminController.updatePositions);

// DELETE /leagues/admin/cleanup - Limpiar semanas antiguas
router.delete('/cleanup', leagueAdminController.cleanup);

export default router;
