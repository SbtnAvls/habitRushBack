import 'dotenv/config';
import mysql, { Pool } from 'mysql2/promise';

const {
  DB_HOST = 'localhost',
  DB_PORT = '3307',
  DB_USER = 'user',
  DB_PASSWORD = 'password',
  DB_NAME = 'habitrush_db',
} = process.env;

const pool: Pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

export default pool;
