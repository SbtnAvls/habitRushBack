import { Response } from 'express';
import { NotificationModel } from '../models/notification.model';
import { AuthRequest } from '../middleware/auth.middleware';

// MEDIUM FIX: Pagination constants
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class NotificationController {
  // MEDIUM FIX: Added pagination support with query params ?limit=50&offset=0
  static async getNotificationsForUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      // MEDIUM FIX: Parse and validate pagination params
      const limitParam = parseInt(req.query.limit as string, 10);
      const offsetParam = parseInt(req.query.offset as string, 10);

      const limit = !isNaN(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
      const offset = !isNaN(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

      const [notifications, total] = await Promise.all([
        NotificationModel.findByUserId(userId, limit, offset),
        NotificationModel.getCountForUser(userId),
      ]);

      res.json({
        data: notifications,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + notifications.length < total,
        },
      });
    } catch (_error) {
      res.status(500).json({ message: 'Error getting notifications' });
    }
  }

  static async markNotificationAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const { id } = req.params;

      const notification = await NotificationModel.findById(id);

      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }

      if (notification.user_id !== userId) {
        return res.status(403).json({ message: 'Forbidden: You can only update your own notifications' });
      }

      await NotificationModel.updateReadStatus(id, true);

      res.status(204).send();
    } catch (_error) {
      res.status(500).json({ message: 'Error marking notification as read' });
    }
  }

  static async deleteNotification(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      const { id } = req.params;

      const notification = await NotificationModel.findById(id);

      if (!notification) {
        // Consider returning 204 to be idempotent, but 404 is also fine.
        return res.status(404).json({ message: 'Notification not found' });
      }

      if (notification.user_id !== userId) {
        return res.status(403).json({ message: 'Forbidden: You can only delete your own notifications' });
      }

      await NotificationModel.deleteById(id);

      res.status(204).send();
    } catch (_error) {
      res.status(500).json({ message: 'Error deleting notification' });
    }
  }
}
