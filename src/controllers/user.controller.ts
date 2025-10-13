import { Request, Response } from 'express';
import { UserModel, User } from '../models/user.model';

// A middleware to get the user from the token would be ideal here
// For now, we will pass the user id in the request body or params for simplicity

export const getMe = async (req: Request, res: Response) => {
  // In a real app, you would get the user id from the authenticated token
  const userId = (req as any).user?.id; // Assuming a middleware adds user to req

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
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateMe = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { name, theme, font_size } = req.body;

  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updates: Partial<User> = {};
    if (name) updates.name = name;
    if (theme) updates.theme = theme;
    if (font_size) updates.font_size = font_size;
    updates.updated_at = new Date();

    await UserModel.update(userId, updates);

    const updatedUser = await UserModel.findById(userId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userWithoutPassword } = updatedUser!;

    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteMe = async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

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
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
