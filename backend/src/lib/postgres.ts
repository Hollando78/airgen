/**
 * PostgreSQL Connection Pool
 *
 * Simple connection pooling for PostgreSQL database operations.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Get or create the PostgreSQL connection pool.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    pool = new Pool({
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on("error", (err: Error) => {
      console.error("[PostgreSQL] Unexpected error on idle client", err);
    });
  }

  return pool;
}

/**
 * Execute a SQL query.
 */
export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Close the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
