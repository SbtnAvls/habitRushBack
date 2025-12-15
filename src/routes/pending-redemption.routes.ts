import { Router } from 'express';
import { PendingRedemptionController } from '../controllers/pending-redemption.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /pending-redemptions - Get all pending redemptions for the current user
router.get('/', PendingRedemptionController.getForUser);

// POST /pending-redemptions/:id/redeem-life - Accept losing a life
router.post('/:id/redeem-life', PendingRedemptionController.redeemWithLife);

// POST /pending-redemptions/:id/redeem-challenge - Start a challenge to avoid losing a life
router.post('/:id/redeem-challenge', PendingRedemptionController.redeemWithChallenge);

// POST /pending-redemptions/:id/complete-challenge - Submit proof and complete the challenge
router.post('/:id/complete-challenge', PendingRedemptionController.completeChallenge);

export default router;
