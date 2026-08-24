import { Pool } from 'pg';

// A single shared pool for the whole process. Every query/transaction in the
// app goes through this — no ORM, raw parameterized SQL per the finalized stack.
//
// DATABASE_URL takes priority — that's what Neon's Vercel Marketplace
// integration injects. The individual PG* vars remain as the local/docker-compose
// path so `docker-compose up` still works unchanged.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'trusttrail',
      password: process.env.PGPASSWORD || 'trusttrail_dev_password',
      database: process.env.PGDATABASE || 'trusttrail',
    });

pool.on('error', (err) => {
  // A background/idle client error should not crash the whole API process.
  console.error('Unexpected Postgres pool error:', err);
});

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
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
