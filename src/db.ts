import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  port: 3307,
  user: 'user',
  password: 'password',
  database: 'habitrush_db'
});

export default pool;
