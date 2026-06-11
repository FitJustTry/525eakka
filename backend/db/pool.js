require('dotenv').config();
const { Pool, types } = require('pg');
types.setTypeParser(1082, val => val);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || 'ekarat_capacity',
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || 'ekarat_user',
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD || 'your_password',
  ssl: String(process.env.PGSSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
});
module.exports = pool;
