import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// PUT /api/notifications/:id/read - Mark a notification as read
router.put('/:id/read', NotificationController.markNotificationAsRead);

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', NotificationController.deleteNotification);

export default router;
