import { Router, Response } from 'express';
import { HabitCategoryModel } from '../models/habit-category.model';
import { ChallengeModel } from '../models/challenge.model';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { dataFetchLimiter } from '../middleware/rate-limit.middleware';
import { validateIdParam } from '../middleware/uuid-validation.middleware';

const router = Router();

// All category routes require authentication
router.use(authMiddleware);

/**
 * GET /categories
 * Get all habit categories
 * CRITICAL FIX: Added rate limiting to prevent API abuse
 */
router.get('/', dataFetchLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await HabitCategoryModel.getAll();
    res.json({
      success: true,
      categories,
      count: categories.length,
    });
  } catch (error) {
    // MEDIUM FIX: Sanitize error logging - only log error message, not full stack
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting categories:', errorMessage);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
});

/**
 * GET /categories/:id
 * Get a single category with its challenges
 * CRITICAL FIX: Added rate limiting and UUID validation
 */
router.get('/:id', dataFetchLimiter, validateIdParam, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await HabitCategoryModel.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    const challenges = await ChallengeModel.getByCategory(id);

    res.json({
      success: true,
      category,
      challenges,
      challenges_count: challenges.length,
    });
  } catch (error) {
    // MEDIUM FIX: Sanitize error logging - only log error message, not full stack
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting category:', errorMessage);
    res.status(500).json({ message: 'Error al obtener categoría' });
  }
});

export default router;
