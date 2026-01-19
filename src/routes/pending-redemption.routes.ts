import { Router } from 'express';
import { PendingRedemptionController } from '../controllers/pending-redemption.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { proofSubmissionLimiter, redemptionActionLimiter, dataFetchLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /pending-redemptions - Get all pending redemptions for the current user
// CRITICAL FIX: Added rate limiting to prevent API abuse
router.get('/', dataFetchLimiter, PendingRedemptionController.getForUser);

// POST /pending-redemptions/:id/redeem-life - Accept losing a life
router.post('/:id/redeem-life', validateIdParam, redemptionActionLimiter, PendingRedemptionController.redeemWithLife);

// POST /pending-redemptions/:id/redeem-challenge - Start a challenge to avoid losing a life
router.post(
  '/:id/redeem-challenge',
  validateIdParam,
  redemptionActionLimiter,
  PendingRedemptionController.redeemWithChallenge,
);

// POST /pending-redemptions/:id/complete-challenge - Submit proof for validation
router.post(
  '/:id/complete-challenge',
  validateIdParam,
  proofSubmissionLimiter,
  PendingRedemptionController.completeChallenge,
);

// GET /pending-redemptions/:id/validation-status - Check validation status
// CRITICAL FIX: Added rate limiting to prevent API abuse
router.get('/:id/validation-status', dataFetchLimiter, validateIdParam, PendingRedemptionController.getValidationStatus);

export default router;
