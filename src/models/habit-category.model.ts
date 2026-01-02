import { RowDataPacket } from 'mysql2';
import pool from '../db';

export interface HabitCategory {
  id: string;
  name: string;
  icon: string | null;
  color_hex: string | null;
}

interface HabitCategoryRow extends RowDataPacket, HabitCategory {}

export class HabitCategoryModel {
  /**
   * Get all habit categories
   */
  static async getAll(): Promise<HabitCategory[]> {
    const [rows] = await pool.query<HabitCategoryRow[]>('SELECT * FROM HABIT_CATEGORIES ORDER BY name');
    return rows;
  }

  /**
   * Find a category by ID
   */
  static async findById(id: string): Promise<HabitCategory | null> {
    const [rows] = await pool.query<HabitCategoryRow[]>('SELECT * FROM HABIT_CATEGORIES WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Check if a category exists
   */
  static async exists(id: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 FROM HABIT_CATEGORIES WHERE id = ? LIMIT 1', [id]);
    return rows.length > 0;
  }
}
