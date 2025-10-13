import { Router } from 'express';
import { getLifeHistory } from '../controllers/life-history.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// GET /api/users/me/life-history - Obtener el historial de cambios de vidas del usuario
router.get('/', authMiddleware, getLifeHistory);

export default router;