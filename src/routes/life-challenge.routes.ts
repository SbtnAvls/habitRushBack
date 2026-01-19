import { Router } from 'express';
import {
  getLifeChallenges,
  redeemLifeChallenge,
  getLifeChallengeStatus,
} from '../controllers/life-challenge.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { lifeChallengeRedeemLimiter, dataFetchLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Rutas para Desafíos de Vida (Life Challenges)

// GET /api/life-challenges - Obtener todos los desafíos de vida disponibles
// Acepta query param ?withStatus=true para incluir el estado (pendiente/obtenido/redimido)
// MEDIUM FIX: Added rate limiting
router.get('/', authMiddleware, dataFetchLimiter, getLifeChallenges);

// GET /api/life-challenges/status - Obtener el estado de todos los Life Challenges del usuario
// MEDIUM FIX: Added rate limiting
router.get('/status', authMiddleware, dataFetchLimiter, getLifeChallengeStatus);

// POST /api/life-challenges/:id/redeem - Canjear un desafío de vida para ganar vidas
// MEDIUM FIX: Added UUID validation for :id parameter
// LOW FIX: Added rate limiting to prevent abuse
router.post('/:id/redeem', authMiddleware, lifeChallengeRedeemLimiter, validateIdParam, redeemLifeChallenge);

export default router;
