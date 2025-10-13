import { Request, Response } from 'express';
import { NotificationModel } from '../models/notification.model';

export class NotificationController {

  static async getNotificationsForUser(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const notifications = await NotificationModel.findByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error getting notifications' });
    }
  }

  static async markNotificationAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
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
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error marking notification as read' });
    }
  }

  static async deleteNotification(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
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
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error deleting notification' });
    }
  }
}
