import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';
import { completionModifyLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.use(authMiddleware);

// PUT /api/notifications/:id/read - Mark a notification as read
// MEDIUM FIX: Added rate limiting
router.put('/:id/read', completionModifyLimiter, validateIdParam, NotificationController.markNotificationAsRead);

// DELETE /api/notifications/:id - Delete a notification
// MEDIUM FIX: Added rate limiting
router.delete('/:id', completionModifyLimiter, validateIdParam, NotificationController.deleteNotification);

export default router;
