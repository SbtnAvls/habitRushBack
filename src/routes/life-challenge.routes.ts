import { Router } from 'express';
import {
  getLifeChallenges,
  redeemLifeChallenge,
  getLifeChallengeStatus
} from '../controllers/life-challenge.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Rutas para Desafíos de Vida (Life Challenges)

// GET /api/life-challenges - Obtener todos los desafíos de vida disponibles
// Acepta query param ?withStatus=true para incluir el estado (pendiente/obtenido/redimido)
router.get('/', authMiddleware, getLifeChallenges);

// GET /api/life-challenges/status - Obtener el estado de todos los Life Challenges del usuario
router.get('/status', authMiddleware, getLifeChallengeStatus);

// POST /api/life-challenges/:id/redeem - Canjear un desafío de vida para ganar vidas
router.post('/:id/redeem', authMiddleware, redeemLifeChallenge);

export default router;