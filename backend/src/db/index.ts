import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';
import { logger } from '../logger.js';

const { Pool } = pg;

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/fabb6_mis';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: parseInt(process.env['DB_POOL_MAX'] ?? '20', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

pool.on('connect', () => {
  logger.debug('PostgreSQL pool: new client connected');
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export { schema };
