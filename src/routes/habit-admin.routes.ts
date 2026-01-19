import express, { Router, Request, Response } from 'express';
import { adminKeyMiddleware } from '../middleware/auth.middleware';
import { cleanupInactiveHabits } from '../services/habit-cleanup.service';

const router: Router = express.Router();

// Todas las rutas admin requieren API key (X-Admin-Key header)
router.use(adminKeyMiddleware);

// POST /habits/admin/cleanup-inactive - Eliminar hábitos inactivos
router.post('/cleanup-inactive', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;

    if (isNaN(days) || days < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid days parameter. Must be a positive integer.',
      });
    }

    const result = await cleanupInactiveHabits(days);

    res.json({
      success: true,
      message: `Cleanup completed. Deleted ${result.deleted_count} inactive habits.`,
      data: result,
    });
  } catch (error) {
    console.error('[HabitAdmin] Error in cleanup-inactive:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing cleanup',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
