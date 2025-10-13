import { Router } from 'express';
import { getLifeChallenges, redeemLifeChallenge } from '../controllers/life-challenge.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Rutas para Desafíos de Vida (Life Challenges)

// GET /api/life-challenges - Obtener todos los desafíos de vida disponibles
router.get('/', getLifeChallenges);

// POST /api/life-challenges/:id/redeem - Canjear un desafío de vida para ganar vidas
router.post('/:id/redeem', authMiddleware, redeemLifeChallenge);

export default router;