import { Router } from 'express';
import { AdminValidationController, requireAdmin } from '../controllers/admin-validation.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { adminValidationLimiter, aiTriggerLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin as any);

// Validation management
router.get('/validations', AdminValidationController.list);
router.get('/validations/pending', AdminValidationController.listPending);
router.get('/validations/stats', AdminValidationController.getStats);
router.get('/validations/:id', validateIdParam, AdminValidationController.getById);
router.post(
  '/validations/:id/approve',
  validateIdParam,
  adminValidationLimiter,
  AdminValidationController.approve,
);
router.post(
  '/validations/:id/reject',
  validateIdParam,
  adminValidationLimiter,
  AdminValidationController.reject,
);
router.post('/validations/:id/run-ai', validateIdParam, aiTriggerLimiter, AdminValidationController.runAI);

export default router;
