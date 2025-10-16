#!/usr/bin/env node
/**
 * CLI Tool: Import/Restore Project from Backup
 *
 * Imports a project backup into Neo4j, with options for target location and dry-run.
 *
 * Usage:
 *   pnpm cli import-project --input <path> [options]
 *
 * Options:
 *   --input <path>           Backup file path (required)
 *   --tenant <name>          Target tenant (overrides backup metadata)
 *   --project <key>          Target project key (overrides backup metadata)
 *   --delete-existing        Delete existing project data before import
 *   --dry-run                Validate backup without importing
 *   --temp                   Restore to temporary project for verification
 *   --validate               Only validate backup integrity
 *   --help                   Show this help message
 *
 * Examples:
 *   # Restore project to original location
 *   pnpm cli import-project --input ./backups/brake.cypher
 *
 *   # Restore to different project (migration/cloning)
 *   pnpm cli import-project --input ./backups/brake.cypher --tenant acme --project brake-system-v2
 *
 *   # Restore to temporary project for verification
 *   pnpm cli import-project --input ./backups/brake.cypher --temp
 *
 *   # Validate backup without importing
 *   pnpm cli import-project --input ./backups/brake.cypher --validate
 *
 *   # Replace existing project data
 *   pnpm cli import-project --input ./backups/brake.cypher --delete-existing
 *
 *   # Dry run (validate only)
 *   pnpm cli import-project --input ./backups/brake.cypher --dry-run
 */

import {
  importProjectFromCypher,
  importProjectFromJSON,
  validateProjectBackup,
  restoreToTempProject
} from "../services/backup/project-import-service.js";
import { promises as fs } from "node:fs";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  input?: string;
  tenant?: string;
  project?: string;
  deleteExisting?: boolean;
  dryRun?: boolean;
  temp?: boolean;
  validate?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--input":
        args.input = argv[++i];
        break;
      case "--tenant":
        args.tenant = argv[++i];
        break;
      case "--project":
        args.project = argv[++i];
        break;
      case "--delete-existing":
        args.deleteExisting = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--temp":
        args.temp = true;
        break;
      case "--validate":
        args.validate = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return args;
}

function showHelp() {
  console.log(`
CLI Tool: Import/Restore Project from Backup

Imports a project backup into Neo4j, with options for target location and dry-run.

Usage:
  pnpm cli import-project --input <path> [options]

Options:
  --input <path>           Backup file path (required)
  --tenant <name>          Target tenant (overrides backup metadata)
  --project <key>          Target project key (overrides backup metadata)
  --delete-existing        Delete existing project data before import
  --dry-run                Validate backup without importing
  --temp                   Restore to temporary project for verification
  --validate               Only validate backup integrity
  --help                   Show this help message

Examples:
  # Restore project to original location
  pnpm cli import-project --input ./backups/brake.cypher

  # Restore to different project (migration/cloning)
  pnpm cli import-project --input ./backups/brake.cypher --tenant acme --project brake-system-v2

  # Restore to temporary project for verification
  pnpm cli import-project --input ./backups/brake.cypher --temp

  # Validate backup without importing
  pnpm cli import-project --input ./backups/brake.cypher --validate

  # Replace existing project data
  pnpm cli import-project --input ./backups/brake.cypher --delete-existing

  # Dry run (validate only)
  pnpm cli import-project --input ./backups/brake.cypher --dry-run

Safety:
  - Always test restore in temporary project first (--temp)
  - Use --dry-run to validate before actual import
  - Use --delete-existing carefully - it will remove all existing project data
  - Backups can be imported to different tenant/project (migration/cloning)
`);
}

// ============================================================================
// Main Import Function
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.input) {
    console.error("Error: Missing required argument --input");
    console.error("Usage: pnpm cli import-project --input <path>");
    console.error("Run with --help for more information");
    process.exit(1);
  }

  // Check if backup file exists
  try {
    await fs.access(args.input);
  } catch {
    console.error(`Error: Backup file not found: ${args.input}`);
    process.exit(1);
  }

  // Detect format from extension
  const isJSON = args.input.endsWith(".json");
  const format = isJSON ? "JSON" : "Cypher";

  console.log("=".repeat(70));
  console.log("Project Import Tool");
  console.log("=".repeat(70));
  console.log(`Input file:     ${args.input}`);
  console.log(`Format:         ${format}`);
  console.log(`Target tenant:  ${args.tenant || "(from backup metadata)"}`);
  console.log(`Target project: ${args.project || "(from backup metadata)"}`);
  console.log(`Mode:           ${args.temp ? "Temporary" : args.validate ? "Validate Only" : args.dryRun ? "Dry Run" : "Import"}`);
  console.log(`Delete existing: ${args.deleteExisting ? "yes" : "no"}`);
  console.log("=".repeat(70));
  console.log();

  const startTime = Date.now();

  try {
    // Validation-only mode
    if (args.validate) {
      console.log("Validating backup integrity...");
      const validation = await validateProjectBackup(args.input);

      console.log();
      console.log("=".repeat(70));
      console.log("Validation Results");
      console.log("=".repeat(70));
      console.log(`Status:         ${validation.valid ? "✓ VALID" : "✗ INVALID"}`);
      console.log(`Nodes:          ${validation.stats.totalNodes}`);
      console.log(`Relationships:  ${validation.stats.totalRelationships}`);
      console.log(`Cross-project refs: ${validation.stats.crossProjectReferences}`);

      if (validation.errors.length > 0) {
        console.log();
        console.log("Errors:");
        validation.errors.forEach(err => console.log(`  - ${err}`));
      }

      if (validation.warnings.length > 0) {
        console.log();
        console.log("Warnings:");
        validation.warnings.forEach(warn => console.log(`  - ${warn}`));
      }

      console.log("=".repeat(70));

      process.exit(validation.valid ? 0 : 1);
    }

    // Temporary restore mode
    if (args.temp) {
      console.log("Restoring to temporary project for verification...");
      console.log();

      const result = await restoreToTempProject(args.input);

      const duration = Date.now() - startTime;

      console.log();
      console.log("=".repeat(70));
      if (result.success) {
        console.log("Temporary restore completed successfully!");
      } else {
        console.log("Temporary restore failed!");
      }
      console.log("=".repeat(70));
      console.log(`Status:         ${result.success ? "✓ SUCCESS" : "✗ FAILED"}`);
      console.log(`Duration:       ${(duration / 1000).toFixed(2)}s`);
      console.log(`Nodes created:  ${result.nodesCreated}`);
      console.log(`Relationships:  ${result.relationshipsCreated}`);
      console.log(`Target:         ${result.targetTenant}/${result.targetProjectKey}`);

      if (result.errors.length > 0) {
        console.log();
        console.log("Errors:");
        result.errors.forEach(err => console.log(`  - ${err}`));
      }

      if (result.warnings.length > 0) {
        console.log();
        console.log("Warnings:");
        result.warnings.forEach(warn => console.log(`  - ${warn}`));
      }

      console.log();
      console.log("To delete the temporary project after verification:");
      console.log(`  MATCH (n {tenant: "${result.targetTenant}", projectKey: "${result.targetProjectKey}"}) DETACH DELETE n`);
      console.log("=".repeat(70));

      process.exit(result.success ? 0 : 1);
    }

    // Regular import mode
    console.log(args.dryRun ? "Performing dry-run (validation only)..." : "Importing project...");

    let result;

    if (isJSON) {
      result = await importProjectFromJSON(args.input, {
        targetTenant: args.tenant,
        targetProjectKey: args.project,
        deleteExisting: args.deleteExisting,
        dryRun: args.dryRun
      });
    } else {
      result = await importProjectFromCypher(args.input, {
        targetTenant: args.tenant,
        targetProjectKey: args.project,
        deleteExisting: args.deleteExisting,
        dryRun: args.dryRun
      });
    }

    const duration = Date.now() - startTime;

    console.log();
    console.log("=".repeat(70));
    if (result.success) {
      console.log(args.dryRun ? "Dry-run validation passed!" : "Import completed successfully!");
    } else {
      console.log(args.dryRun ? "Dry-run validation failed!" : "Import failed!");
    }
    console.log("=".repeat(70));
    console.log(`Status:         ${result.success ? "✓ SUCCESS" : "✗ FAILED"}`);
    console.log(`Duration:       ${(duration / 1000).toFixed(2)}s`);

    if (!args.dryRun) {
      console.log(`Nodes created:  ${result.nodesCreated}`);
      console.log(`Relationships:  ${result.relationshipsCreated}`);
    }

    console.log(`Target:         ${result.targetTenant}/${result.targetProjectKey}`);

    if (result.errors.length > 0) {
      console.log();
      console.log("Errors:");
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log();
      console.log("Warnings:");
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log("=".repeat(70));

    if (!args.dryRun && result.success) {
      console.log();
      console.log("Next steps:");
      console.log("  1. Verify the imported data in the application");
      console.log("  2. Check for any missing relationships or data");
      console.log("  3. Test critical functionality with the restored project");
      console.log();
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error();
    console.error("=".repeat(70));
    console.error("Import failed!");
    console.error("=".repeat(70));
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof Error && error.stack) {
      console.error();
      console.error("Stack trace:");
      console.error(error.stack);
    }

    console.error("=".repeat(70));

    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  process.exit(1);
});

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
