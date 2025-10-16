#!/usr/bin/env node
/**
 * CLI tool for running PostgreSQL schema migrations
 *
 * Usage:
 *   npx tsx src/cli/migrate-postgres.ts up              # Run all pending migrations
 *   npx tsx src/cli/migrate-postgres.ts list            # List migrations
 */

import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "../lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "../../migrations");

// Table to track applied migrations
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

interface Migration {
  filename: string;
  applied: boolean;
  appliedAt?: Date;
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(MIGRATIONS_TABLE);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT filename FROM schema_migrations ORDER BY id"
  );
  return new Set(result.rows.map(row => row.filename));
}

async function getAllMigrationFiles(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter(f => f.endsWith(".sql"))
    .sort(); // Lexicographic sort ensures 001, 002, 003 order
}

async function runMigrationFile(filename: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename);
  console.log(`\n📄 Running migration: ${filename}`);

  const sql = await fs.readFile(filePath, "utf-8");
  const pool = getPool();

  // Execute the SQL file
  await pool.query(sql);

  // Record the migration
  await pool.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1)",
    [filename]
  );

  console.log(`✅ Migration ${filename} completed`);
}

async function listMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const allFiles = await getAllMigrationFiles();
  const applied = await getAppliedMigrations();

  console.log("\n📋 Migration Status:\n");
  console.log("STATUS     | MIGRATION");
  console.log("-----------|" + "-".repeat(60));

  for (const file of allFiles) {
    const status = applied.has(file) ? "✅ Applied" : "⏳ Pending";
    console.log(`${status.padEnd(10)} | ${file}`);
  }

  console.log("");
}

async function runPendingMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const allFiles = await getAllMigrationFiles();
  const applied = await getAppliedMigrations();

  const pending = allFiles.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log("\n✅ All migrations are up to date\n");
    return;
  }

  console.log(`\n🚀 Running ${pending.length} pending migration(s)...\n`);

  for (const file of pending) {
    await runMigrationFile(file);
  }

  console.log(`\n✅ All migrations completed successfully\n`);
}

async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case "up":
        await runPendingMigrations();
        break;

      case "list":
        await listMigrations();
        break;

      case "status":
        await listMigrations();
        break;

      default:
        console.log(`
PostgreSQL Migration Tool

Usage:
  npx tsx src/cli/migrate-postgres.ts <command>

Commands:
  up       Run all pending migrations
  list     List all migrations and their status
  status   Same as 'list'

Examples:
  npx tsx src/cli/migrate-postgres.ts up
  npx tsx src/cli/migrate-postgres.ts list
        `);
        process.exit(command ? 1 : 0);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
