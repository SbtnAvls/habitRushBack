import pool from '../db';

export class CompletionImage {

  static async create(completionId: string, userId: string, imageUrl: string, thumbnailUrl: string | null) {
    // First, verify the completion belongs to the user
    const [completionRows] = await pool.query<any[]>('SELECT id FROM HABIT_COMPLETIONS WHERE id = ? AND user_id = ?', [completionId, userId]);
    if (completionRows.length === 0) {
      throw new Error('Completion not found or user does not have permission.');
    }

    // Determine the order
    const [orderRows] = await pool.query<any[]>('SELECT MAX(`order`) as max_order FROM COMPLETION_IMAGES WHERE completion_id = ?', [completionId]);
    const order = (orderRows[0].max_order || 0) + 1;

    if (order > 5) {
      throw new Error('Maximum number of images (5) for this completion reached.');
    }

    const [result] = await pool.query(
      'INSERT INTO COMPLETION_IMAGES (completion_id, user_id, image_url, thumbnail_url, `order`) VALUES (?, ?, ?, ?, ?)',
      [completionId, userId, imageUrl, thumbnailUrl, order]
    );
    const id = (result as any).insertId;
    const [rows] = await pool.query<any[]>('SELECT * FROM COMPLETION_IMAGES WHERE id = ?', [id]);
    return rows[0];
  }

  static async delete(id: string, userId: string) {
    // We need to ensure the image belongs to the user who is trying to delete it.
    const [result] = await pool.query('DELETE FROM COMPLETION_IMAGES WHERE id = ? AND user_id = ?', [id, userId]);
    return (result as any).affectedRows > 0;
  }
}