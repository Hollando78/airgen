#!/usr/bin/env node
/**
 * CLI Tool: Export Project to Backup
 *
 * Exports a single project to a backup file (Cypher or JSON format).
 *
 * Usage:
 *   pnpm cli export-project --tenant <tenant> --project <projectKey> --output <path> [options]
 *
 * Options:
 *   --tenant <name>          Tenant name (required)
 *   --project <key>          Project key (required)
 *   --output <path>          Output file path (required)
 *   --format <cypher|json>   Export format (default: cypher)
 *   --skip-versions          Skip version history nodes
 *   --skip-baselines         Skip baseline nodes
 *   --compress               Compress output file with gzip
 *   --help                   Show this help message
 *
 * Examples:
 *   # Export project to Cypher script
 *   pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.cypher
 *
 *   # Export to JSON format
 *   pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.json --format json
 *
 *   # Export without version history (smaller backup)
 *   pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.cypher --skip-versions
 */

import { exportProjectToCypher, exportProjectToJSON } from "../services/backup/project-backup-service.js";
import { registerBackup } from "../services/backup/backup-metadata.js";
import { initGraph, closeGraph } from "../services/graph/driver.js";
import { promises as fs } from "node:fs";
import path from "node:path";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  tenant?: string;
  project?: string;
  output?: string;
  format?: "cypher" | "json";
  skipVersions?: boolean;
  skipBaselines?: boolean;
  compress?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--tenant":
        args.tenant = argv[++i];
        break;
      case "--project":
        args.project = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--format":
        args.format = argv[++i] as "cypher" | "json";
        break;
      case "--skip-versions":
        args.skipVersions = true;
        break;
      case "--skip-baselines":
        args.skipBaselines = true;
        break;
      case "--compress":
        args.compress = true;
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
CLI Tool: Export Project to Backup

Exports a single project to a backup file (Cypher or JSON format).

Usage:
  pnpm cli export-project --tenant <tenant> --project <projectKey> --output <path> [options]

Options:
  --tenant <name>          Tenant name (required)
  --project <key>          Project key (required)
  --output <path>          Output file path (required)
  --format <cypher|json>   Export format (default: cypher)
  --skip-versions          Skip version history nodes
  --skip-baselines         Skip baseline nodes
  --compress               Compress output file with gzip
  --help                   Show this help message

Examples:
  # Export project to Cypher script
  pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.cypher

  # Export to JSON format
  pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.json --format json

  # Export without version history (smaller backup)
  pnpm cli export-project --tenant acme --project brake-system --output ./backups/brake.cypher --skip-versions
`);
}

// ============================================================================
// Main Export Function
// ============================================================================

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!args.tenant || !args.project || !args.output) {
    console.error("Error: Missing required arguments");
    console.error("Usage: pnpm cli export-project --tenant <tenant> --project <projectKey> --output <path>");
    console.error("Run with --help for more information");
    process.exit(1);
  }

  const format = args.format || "cypher";

  // Validate format
  if (format !== "cypher" && format !== "json") {
    console.error(`Error: Invalid format '${format}'. Must be 'cypher' or 'json'`);
    process.exit(1);
  }

  // Ensure output file has correct extension
  const expectedExt = format === "cypher" ? ".cypher" : ".json";
  if (!args.output.endsWith(expectedExt)) {
    console.warn(`Warning: Output file should have '${expectedExt}' extension`);
  }

  // Create output directory if it doesn't exist
  const outputDir = path.dirname(args.output);
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    console.error(`Error: Could not create output directory: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("Project Export Tool");
  console.log("=".repeat(70));
  console.log(`Tenant:        ${args.tenant}`);
  console.log(`Project:       ${args.project}`);
  console.log(`Output:        ${args.output}`);
  console.log(`Format:        ${format}`);
  console.log(`Skip Versions: ${args.skipVersions ? "yes" : "no"}`);
  console.log(`Skip Baselines: ${args.skipBaselines ? "yes" : "no"}`);
  console.log(`Compress:      ${args.compress ? "yes" : "no"}`);
  console.log("=".repeat(70));
  console.log();

  const startTime = Date.now();

  try {
    // Initialize Neo4j connection
    await initGraph();

    // Export project based on format
    let metadata;

    if (format === "cypher") {
      console.log("Exporting project to Cypher format...");
      metadata = await exportProjectToCypher(args.tenant, args.project, args.output, {
        includeVersionHistory: !args.skipVersions,
        includeBaselines: !args.skipBaselines,
        compression: args.compress ? "gzip" : "none"
      });
    } else {
      console.log("Exporting project to JSON format...");
      metadata = await exportProjectToJSON(args.tenant, args.project, args.output, {
        includeVersionHistory: !args.skipVersions,
        includeBaselines: !args.skipBaselines,
        compression: args.compress ? "gzip" : "none"
      });
    }

    const duration = Date.now() - startTime;

    console.log();
    console.log("=".repeat(70));
    console.log("Export completed successfully!");
    console.log("=".repeat(70));
    console.log(`Duration:       ${(duration / 1000).toFixed(2)}s`);
    console.log(`Nodes exported: ${metadata.stats.totalNodes}`);
    console.log(`Relationships:  ${metadata.stats.totalRelationships}`);
    console.log(`File size:      ${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Checksum:       ${metadata.checksum}`);
    console.log();
    console.log(`Backup file:    ${args.output}`);
    console.log(`Metadata file:  ${args.output.replace(/\.(cypher|json)$/, ".metadata.json")}`);
    console.log("=".repeat(70));

    // Register backup in metadata store
    try {
      console.log();
      console.log("Registering backup in metadata store...");

      await registerBackup({
        tenant: args.tenant,
        projectKey: args.project,
        backupType: "local",
        format,
        localPath: args.output,
        size: metadata.fileSize,
        checksum: metadata.checksum,
        metadata,
        status: "completed"
      });

      console.log("Backup registered successfully.");
    } catch (error) {
      console.warn("Warning: Could not register backup in metadata store:", error);
      console.warn("The backup file is valid, but it won't appear in the backup listing.");
    }

    await closeGraph();
    process.exit(0);
  } catch (error) {
    await closeGraph().catch(() => {});
    console.error();
    console.error("=".repeat(70));
    console.error("Export failed!");
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
