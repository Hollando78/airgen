/**
 * PostgreSQL Connection Pool
 *
 * Simple connection pooling for PostgreSQL database operations.
 */

import pg from "pg";
import { readFileSync } from "node:fs";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Get or create the PostgreSQL connection pool.
 * Reads connection string from config (which supports Docker secrets).
 */
export function getPool(): pg.Pool {
  if (!pool) {
    // Read connection string directly from environment to avoid circular dependency
    let connectionString = process.env.DATABASE_URL;

    // If DATABASE_URL not set, construct it from template and Docker secret
    if (!connectionString && process.env.DATABASE_URL_TEMPLATE) {
      try {
        const passwordFile = "/run/secrets/postgres_password";
        const password = readFileSync(passwordFile, "utf-8").trim();
        connectionString = process.env.DATABASE_URL_TEMPLATE.replace("__PASSWORD__", password);
      } catch (error) {
        console.error("[PostgreSQL] Failed to read postgres_password secret:", error);
      }
    }

    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured. Check config.ts or environment variables.");
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
