import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { authRateLimiter, refreshRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Public routes with rate limiting
router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', refreshRateLimiter, authController.refresh);

// Protected routes
router.get('/me', authMiddleware, authController.getCurrentUser);
router.post('/logout', authMiddleware, authController.logout);

export default router;
