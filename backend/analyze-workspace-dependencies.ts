import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";

interface WorkspaceUsage {
  file: string;
  line: number;
  operation: string;
  context: string;
}

interface AuditReport {
  totalFiles: number;
  operations: {
    writes: WorkspaceUsage[];
    reads: WorkspaceUsage[];
    deletes: WorkspaceUsage[];
    other: WorkspaceUsage[];
  };
  byEntityType: {
    requirements: WorkspaceUsage[];
    infos: WorkspaceUsage[];
    surrogates: WorkspaceUsage[];
  };
  byFeature: Record<string, WorkspaceUsage[]>;
}

// Patterns to search for
const WORKSPACE_PATTERNS = {
  write: [
    /writeRequirementMarkdown/,
    /writeInfoMarkdown/,
    /writeSurrogateMarkdown/,
    /fs\.writeFile.*workspace/i
  ],
  read: [
    /readRequirementMarkdown/,
    /readInfoMarkdown/,
    /readSurrogateMarkdown/,
    /fs\.readFile.*workspace/i,
    /getRequirementFile/,
    /getInfoFile/,
    /getSurrogateFile/
  ],
  delete: [
    /deleteRequirementMarkdown/,
    /deleteInfoMarkdown/,
    /deleteSurrogateMarkdown/,
    /fs\.unlink.*workspace/i,
    /fs\.rm.*workspace/i
  ]
};

const ENTITY_PATTERNS = {
  requirements: /requirement/i,
  infos: /info/i,
  surrogates: /surrogate/i
};

async function findTypeScriptFiles(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip certain directories
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") {
        continue;
      }
      await findTypeScriptFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function auditWorkspaceDependencies(): Promise<void> {
  console.log("=".repeat(80));
  console.log("WORKSPACE DEPENDENCY AUDIT");
  console.log("=".repeat(80));
  console.log("\nScanning codebase for workspace file operations...\n");

  const report: AuditReport = {
    totalFiles: 0,
    operations: {
      writes: [],
      reads: [],
      deletes: [],
      other: []
    },
    byEntityType: {
      requirements: [],
      infos: [],
      surrogates: []
    },
    byFeature: {}
  };

  // Find all TypeScript files
  const files = await findTypeScriptFiles("src");

  report.totalFiles = files.length;

  // Analyze each file
  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const lines = content.split("\n");

    // Check if file imports workspace service
    const importsWorkspace = lines.some(line =>
      /from\s+['"].*workspace/.test(line) ||
      line.includes("workspace")
    );

    if (!importsWorkspace && !file.includes("workspace.ts")) {
      continue;
    }

    // Analyze each line
    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      const trimmedLine = line.trim();

      // Categorize by operation type
      let operationType: keyof typeof report.operations = "other";
      let matchedPattern = "";

      for (const [type, patterns] of Object.entries(WORKSPACE_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(trimmedLine)) {
            // Map operation types: write -> writes, read -> reads, delete -> deletes
            operationType = (type + 's') as keyof typeof report.operations;
            matchedPattern = pattern.source;
            break;
          }
        }
        if (matchedPattern) break;
      }

      // If workspace-related, add to report
      if (matchedPattern || trimmedLine.includes("workspace")) {
        const usage: WorkspaceUsage = {
          file: relative(process.cwd(), file),
          line: lineNumber,
          operation: matchedPattern || "workspace-related",
          context: trimmedLine.substring(0, 80)
        };

        report.operations[operationType].push(usage);

        // Categorize by entity type
        for (const [entity, pattern] of Object.entries(ENTITY_PATTERNS)) {
          if (pattern.test(trimmedLine)) {
            report.byEntityType[entity as keyof typeof report.byEntityType].push(usage);
          }
        }

        // Categorize by feature (based on file path)
        const featurePath = file.split("/").slice(1, -1).join("/");
        if (!report.byFeature[featurePath]) {
          report.byFeature[featurePath] = [];
        }
        report.byFeature[featurePath].push(usage);
      }
    });
  }

  // Print report
  printReport(report);
}

function printReport(report: AuditReport): void {
  console.log(`Scanned ${report.totalFiles} TypeScript files\n`);

  // Summary by operation type
  console.log("=".repeat(80));
  console.log("OPERATIONS SUMMARY");
  console.log("=".repeat(80));
  console.log(`Write operations:  ${report.operations.writes.length}`);
  console.log(`Read operations:   ${report.operations.reads.length}`);
  console.log(`Delete operations: ${report.operations.deletes.length}`);
  console.log(`Other references:  ${report.operations.other.length}`);
  console.log(`Total:             ${
    report.operations.writes.length +
    report.operations.reads.length +
    report.operations.deletes.length +
    report.operations.other.length
  }\n`);

  // Summary by entity type
  console.log("=".repeat(80));
  console.log("BY ENTITY TYPE");
  console.log("=".repeat(80));
  console.log(`Requirements: ${report.byEntityType.requirements.length} operations`);
  console.log(`Infos:        ${report.byEntityType.infos.length} operations`);
  console.log(`Surrogates:   ${report.byEntityType.surrogates.length} operations\n`);

  // Detailed write operations (critical for migration)
  console.log("=".repeat(80));
  console.log("WRITE OPERATIONS (CRITICAL FOR PHASE 2)");
  console.log("=".repeat(80));
  if (report.operations.writes.length === 0) {
    console.log("✓ No write operations found!\n");
  } else {
    const writesByFile = groupByFile(report.operations.writes);
    for (const [file, usages] of Object.entries(writesByFile)) {
      console.log(`\n${file} (${usages.length} writes):`);
      usages.forEach(usage => {
        console.log(`  Line ${usage.line}: ${usage.context}`);
      });
    }
    console.log();
  }

  // Detailed read operations
  console.log("=".repeat(80));
  console.log("READ OPERATIONS");
  console.log("=".repeat(80));
  if (report.operations.reads.length === 0) {
    console.log("✓ No read operations found!\n");
  } else {
    const readsByFile = groupByFile(report.operations.reads);
    for (const [file, usages] of Object.entries(readsByFile)) {
      console.log(`\n${file} (${usages.length} reads):`);
      usages.forEach(usage => {
        console.log(`  Line ${usage.line}: ${usage.context}`);
      });
    }
    console.log();
  }

  // By feature area
  console.log("=".repeat(80));
  console.log("BY FEATURE AREA");
  console.log("=".repeat(80));
  const sortedFeatures = Object.entries(report.byFeature)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  for (const [feature, usages] of sortedFeatures) {
    console.log(`${feature}: ${usages.length} operations`);
  }
  console.log();

  // Migration recommendations
  console.log("=".repeat(80));
  console.log("MIGRATION RECOMMENDATIONS");
  console.log("=".repeat(80));

  console.log("\n📋 Phase 2 Priority (Remove Workspace Writes):");
  const criticalWrites = groupByFile(report.operations.writes);
  const writeFileCount = Object.keys(criticalWrites).length;
  console.log(`  - ${writeFileCount} files contain write operations`);
  console.log(`  - ${report.operations.writes.length} total write calls to remove`);
  console.log(`  - Focus on: requirements-crud.ts, airgen.ts, admin-requirements.ts`);

  console.log("\n📋 Phase 3 Priority (Replace Workspace Reads):");
  const criticalReads = groupByFile(report.operations.reads);
  const readFileCount = Object.keys(criticalReads).length;
  console.log(`  - ${readFileCount} files contain read operations`);
  console.log(`  - ${report.operations.reads.length} total read calls to replace`);
  console.log(`  - Replace with direct Neo4j queries`);

  console.log("\n📋 Services to Refactor:");
  console.log("  1. src/services/workspace.ts - Mark as deprecated");
  console.log("  2. src/services/markdown-sync.ts - Remove after Phase 3");
  console.log("  3. Create src/services/export-service.ts - New export-only system");

  console.log("\n📋 Estimated Effort:");
  const estimatedDays = Math.ceil(
    (report.operations.writes.length * 0.5 +
      report.operations.reads.length * 0.3) /
      8
  );
  console.log(`  - Write removals: ~${report.operations.writes.length * 0.5} hours`);
  console.log(`  - Read replacements: ~${report.operations.reads.length * 0.3} hours`);
  console.log(`  - Testing & validation: ~16 hours`);
  console.log(`  - Total: ~${estimatedDays} days`);

  console.log("\n" + "=".repeat(80));
  console.log("✓ Audit complete!");
  console.log("=".repeat(80) + "\n");
}

function groupByFile(usages: WorkspaceUsage[]): Record<string, WorkspaceUsage[]> {
  return usages.reduce((acc, usage) => {
    if (!acc[usage.file]) {
      acc[usage.file] = [];
    }
    acc[usage.file].push(usage);
    return acc;
  }, {} as Record<string, WorkspaceUsage[]>);
}

// Run the audit
auditWorkspaceDependencies().catch(console.error);
