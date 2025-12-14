import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { RowDataPacket } from 'mysql2';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  lives: number;
  max_lives: number;
  total_habits: number;
  xp: number;
  weekly_xp: number;
  league: number;
  league_week_start: Date;
  theme: string;
  font_size: string;
  created_at: Date;
  updated_at: Date;
}

export class UserModel {
  static async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const newUser: User = {
      id: uuidv4(),
      ...user,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await pool.query('INSERT INTO USERS SET ?', newUser);
    return newUser;
  }

  static async findByEmail(email: string): Promise<User | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USERS WHERE email = ?', [email]);
    return rows[0] as User | undefined;
  }

  static async findById(id: string): Promise<User | undefined> {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM USERS WHERE id = ?', [id]);
    return rows[0] as User | undefined;
  }

  static async update(id: string, updates: Partial<User>): Promise<void> {
    await pool.query('UPDATE USERS SET ? WHERE id = ?', [updates, id]);
  }

  static async delete(id: string): Promise<void> {
    await pool.query('DELETE FROM USERS WHERE id = ?', [id]);
  }

  static async updateLives(userId: string, newLives: number): Promise<void> {
    await pool.query('UPDATE USERS SET lives = ? WHERE id = ?', [newLives, userId]);
  }
}
