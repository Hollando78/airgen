/**
 * Migration Runner for Neo4j Schema Changes
 *
 * This module provides a simple migration system for applying and rolling back
 * schema changes to the Neo4j database.
 */

import { migration001 } from "./001-unify-containment-relationships.js";
import { migration002 } from "./002-remove-redundant-denormalization.js";
import { migration003 } from "./003-simplify-document-hierarchy.js";
import { migration004 } from "./004-version-history-indexes.js";
import { migration005 } from "./005-upgrade-existing-baselines.js";

export interface Migration {
  id: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

// Registry of all migrations in order
const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005
];

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  console.log("=".repeat(80));
  console.log("Starting Neo4j Schema Migrations");
  console.log("=".repeat(80));

  for (const migration of migrations) {
    console.log(`\nRunning migration: ${migration.id}`);
    console.log(`Description: ${migration.description}`);
    await migration.up();
    console.log(`✓ Completed: ${migration.id}\n`);
  }

  console.log("=".repeat(80));
  console.log("All migrations completed successfully");
  console.log("=".repeat(80));
}

/**
 * Rollback the last N migrations
 */
export async function rollbackMigrations(count: number = 1): Promise<void> {
  console.log("=".repeat(80));
  console.log(`Rolling back last ${count} migration(s)`);
  console.log("=".repeat(80));

  const toRollback = migrations.slice(-count).reverse();

  for (const migration of toRollback) {
    console.log(`\nRolling back migration: ${migration.id}`);
    console.log(`Description: ${migration.description}`);
    await migration.down();
    console.log(`✓ Rolled back: ${migration.id}\n`);
  }

  console.log("=".repeat(80));
  console.log("Rollback completed successfully");
  console.log("=".repeat(80));
}

/**
 * Run a specific migration by ID
 */
export async function runMigration(migrationId: string): Promise<void> {
  const migration = migrations.find(m => m.id === migrationId);
  if (!migration) {
    throw new Error(`Migration not found: ${migrationId}`);
  }

  console.log(`Running migration: ${migration.id}`);
  console.log(`Description: ${migration.description}`);
  await migration.up();
  console.log(`✓ Completed: ${migration.id}`);
}

/**
 * Rollback a specific migration by ID
 */
export async function rollbackMigration(migrationId: string): Promise<void> {
  const migration = migrations.find(m => m.id === migrationId);
  if (!migration) {
    throw new Error(`Migration not found: ${migrationId}`);
  }

  console.log(`Rolling back migration: ${migration.id}`);
  console.log(`Description: ${migration.description}`);
  await migration.down();
  console.log(`✓ Rolled back: ${migration.id}`);
}

/**
 * List all available migrations
 */
export function listMigrations(): void {
  console.log("Available migrations:");
  migrations.forEach((migration, index) => {
    console.log(`${index + 1}. ${migration.id}`);
    console.log(`   ${migration.description}`);
  });
}
