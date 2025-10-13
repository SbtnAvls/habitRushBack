import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';

export interface CompletionImageRecord extends RowDataPacket {
  id: string;
  completion_id: string;
  user_id: string;
  image_url: string;
  thumbnail_url: string | null;
  order: number;
  created_at: Date;
}

export class CompletionImage {
  static async create(
    completionId: string,
    userId: string,
    imageUrl: string,
    thumbnailUrl: string | null
  ): Promise<CompletionImageRecord> {
    const [completionRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM HABIT_COMPLETIONS WHERE id = ? AND user_id = ?',
      [completionId, userId]
    );
    if (completionRows.length === 0) {
      throw new Error('Completion not found or user does not have permission.');
    }

    const [orderRows] = await pool.query<RowDataPacket[]>(
      'SELECT MAX(`order`) as max_order FROM COMPLETION_IMAGES WHERE completion_id = ?',
      [completionId]
    );
    const currentMaxOrder = orderRows[0]?.max_order as number | null;
    const nextOrder = (currentMaxOrder ?? 0) + 1;

    if (nextOrder > 5) {
      throw new Error('Maximum number of images (5) for this completion reached.');
    }

    const id = uuidv4();
    await pool.query(
      'INSERT INTO COMPLETION_IMAGES (id, completion_id, user_id, image_url, thumbnail_url, `order`) VALUES (?, ?, ?, ?, ?, ?)',
      [id, completionId, userId, imageUrl, thumbnailUrl, nextOrder]
    );
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM COMPLETION_IMAGES WHERE id = ?', [id]);
    return rows[0] as CompletionImageRecord;
  }

  static async delete(id: string, userId: string): Promise<boolean> {
    const [result] = await pool.query(
      'DELETE FROM COMPLETION_IMAGES WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return (result as any).affectedRows > 0;
  }
}
