import 'dotenv/config';
import mysql, { Pool } from 'mysql2/promise';

// LOW FIX: Validate required DB credentials in production
if (process.env.NODE_ENV === 'production') {
  const requiredDbVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missingDbVars = requiredDbVars.filter(v => !process.env[v]);
  if (missingDbVars.length > 0) {
    throw new Error(`[FATAL] Missing required database environment variables: ${missingDbVars.join(', ')}`);
  }
}

const {
  DB_HOST = 'localhost',
  DB_PORT = '3307',
  DB_USER = 'user',
  DB_PASSWORD = 'password',
  DB_NAME = 'habitrush_db',
} = process.env;

// MEDIUM FIX: Add connection pool settings with timeouts for reliability
const pool: Pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  // Connection pool settings
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000, // 60 seconds idle timeout
  queueLimit: 0,
  // Connection timeout settings
  connectTimeout: 10000, // 10 seconds to establish connection
  // Enable keep-alive to detect stale connections
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000, // 30 seconds
});

export default pool;
