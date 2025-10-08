#!/usr/bin/env node
/**
 * CLI tool for running Neo4j schema migrations
 *
 * Usage:
 *   npx tsx src/cli/migrate.ts up              # Run all pending migrations
 *   npx tsx src/cli/migrate.ts down [count]    # Rollback last N migrations (default: 1)
 *   npx tsx src/cli/migrate.ts list            # List all migrations
 *   npx tsx src/cli/migrate.ts run <id>        # Run specific migration
 *   npx tsx src/cli/migrate.ts rollback <id>   # Rollback specific migration
 */

import { runMigrations, rollbackMigrations, runMigration, rollbackMigration, listMigrations } from "../services/graph/migrations/index.js";
import { initGraph, closeGraph } from "../services/graph/driver.js";

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  // Initialize Neo4j connection
  await initGraph();
  try {
    switch (command) {
      case "up":
        await runMigrations();
        break;

      case "down":
        const count = arg ? parseInt(arg, 10) : 1;
        if (isNaN(count) || count < 1) {
          console.error("Invalid count. Must be a positive integer.");
          process.exit(1);
        }
        await rollbackMigrations(count);
        break;

      case "list":
        listMigrations();
        break;

      case "run":
        if (!arg) {
          console.error("Please specify a migration ID");
          process.exit(1);
        }
        await runMigration(arg);
        break;

      case "rollback":
        if (!arg) {
          console.error("Please specify a migration ID");
          process.exit(1);
        }
        await rollbackMigration(arg);
        break;

      default:
        console.log(`
Neo4j Schema Migration Tool

Usage:
  npx tsx src/cli/migrate.ts <command> [args]

Commands:
  up                 Run all pending migrations
  down [count]       Rollback last N migrations (default: 1)
  list               List all available migrations
  run <id>           Run a specific migration by ID
  rollback <id>      Rollback a specific migration by ID

Examples:
  npx tsx src/cli/migrate.ts up
  npx tsx src/cli/migrate.ts down 2
  npx tsx src/cli/migrate.ts list
  npx tsx src/cli/migrate.ts run 001-unify-containment-relationships
  npx tsx src/cli/migrate.ts rollback 001-unify-containment-relationships
        `);
        process.exit(command ? 1 : 0);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await closeGraph();
  }
}

main();
