// One shared connection pool for the whole app.
const { Pool, types } = require('pg');

// By default pg hands back NUMERIC and COUNT(*) values as strings. Turn them into JS numbers.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // BIGINT (COUNT)
types.setTypeParser(1231, (v) => (v === null ? null : v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number))); // NUMERIC[]
// DATE columns come back as plain 'YYYY-MM-DD' strings instead of shifted JS Dates.
types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (and any hosted Postgres) needs SSL. A ?sslmode=require on the URL also turns it on.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: 10,
  // Neon's free database goes to sleep after 5 idle minutes; give it time to wake up.
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000
});

// When Neon sleeps it closes idle connections. Without this listener that would crash the server.
pool.on('error', (err) => {
  console.warn('Idle database connection closed:', err.message);
});

// Shorthand for one-off queries: const { rows } = await query('SELECT ...', [a, b]);
const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN/COMMIT. Anything that throws rolls the whole thing back.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
