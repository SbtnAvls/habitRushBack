import { Response } from 'express';
import { UserModel, User } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';

const ALLOWED_THEMES = ['light', 'dark'];
const ALLOWED_FONT_SIZES = ['small', 'medium', 'large'];

export const getMe = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = user;
    res.json({
      ...userWithoutPassword,
      is_dead: user.lives === 0,
    });
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateMe = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { name, theme, font_size } = req.body;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!name && !theme && !font_size) {
    return res.status(400).json({ message: 'At least one field (name, theme, font_size) is required' });
  }

  if (theme && !ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({ message: 'Invalid theme provided' });
  }

  if (font_size && !ALLOWED_FONT_SIZES.includes(font_size)) {
    return res.status(400).json({ message: 'Invalid font_size provided' });
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updates: Partial<User> = {};
    if (name) {
      updates.name = name;
    }
    if (theme) {
      updates.theme = theme;
    }
    if (font_size) {
      updates.font_size = font_size;
    }
    updates.updated_at = new Date();

    await UserModel.update(userId, updates);

    const updatedUser = await UserModel.findById(userId);

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found after update' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = updatedUser;

    res.json(userWithoutPassword);
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteMe = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await UserModel.delete(userId);

    res.status(204).send();
  } catch (_error) {
    res.status(500).json({ message: 'Server error' });
  }
};
