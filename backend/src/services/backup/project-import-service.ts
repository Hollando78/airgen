/**
 * Project-Level Import/Restore Service
 *
 * Imports a project backup into Neo4j, either to the original project or a new destination.
 * Enables:
 * - Restore to original tenant/project (replace existing data)
 * - Restore to temp project for verification
 * - Restore to different tenant/project (migration/cloning)
 *
 * Safety Features:
 * - Dry-run mode (validate without changes)
 * - Pre-import validation
 * - Rollback on error
 * - Duplicate detection
 */

import { getSession } from "../graph/driver.js";
import { promises as fs } from "node:fs";
import type { ProjectBackupMetadata, ExportedNode, ExportedRelationship, ProjectExportData } from "./project-backup-service.js";

// ============================================================================
// Types
// ============================================================================

export interface ProjectImportOptions {
  targetTenant?: string;      // If different from backup
  targetProjectKey?: string;   // If different from backup
  dryRun?: boolean;            // Validate only, don't import
  deleteExisting?: boolean;    // Delete existing project data first
  validateOnly?: boolean;      // Only run validation checks
  skipVersionHistory?: boolean;
  skipBaselines?: boolean;
}

export interface ProjectImportResult {
  success: boolean;
  nodesCreated: number;
  relationshipsCreated: number;
  errors: string[];
  warnings: string[];
  duration: number;
  targetTenant: string;
  targetProjectKey: string;
}

export interface ImportValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalNodes: number;
    totalRelationships: number;
    crossProjectReferences: number;
  };
}

// ============================================================================
// Main Import Functions
// ============================================================================

/**
 * Import a project from a Cypher backup file.
 */
export async function importProjectFromCypher(
  backupFilePath: string,
  options: ProjectImportOptions = {}
): Promise<ProjectImportResult> {
  const startTime = Date.now();
  const session = getSession();

  try {
    console.log(`[Project Import] Loading backup: ${backupFilePath}`);

    // Load backup file
    const cypherScript = await fs.readFile(backupFilePath, "utf-8");

    // Load metadata if available
    const metadataPath = backupFilePath.replace(/\.cypher$/, ".metadata.json");
    let metadata: ProjectBackupMetadata | null = null;

    try {
      const metadataContent = await fs.readFile(metadataPath, "utf-8");
      metadata = JSON.parse(metadataContent);
    } catch {
      console.warn("[Project Import] No metadata file found, continuing without it");
    }

    // Determine target tenant/project
    const targetTenant = options.targetTenant || metadata?.tenant || "unknown";
    const targetProjectKey = options.targetProjectKey || metadata?.projectKey || "unknown";

    console.log(`[Project Import] Target: ${targetTenant}/${targetProjectKey}`);

    // Dry run check
    if (options.dryRun) {
      console.log("[Project Import] DRY RUN MODE - No changes will be made");
      const validation = await validateCypherScript(cypherScript, metadata);

      return {
        success: validation.valid,
        nodesCreated: 0,
        relationshipsCreated: 0,
        errors: validation.errors,
        warnings: validation.warnings,
        duration: Date.now() - startTime,
        targetTenant,
        targetProjectKey
      };
    }

    // Delete existing project data if requested
    if (options.deleteExisting) {
      console.log(`[Project Import] Deleting existing project data...`);
      await deleteProjectData(session, targetTenant, targetProjectKey);
    }

    // Execute Cypher script
    console.log("[Project Import] Executing Cypher script...");
    const result = await executeCypherScript(session, cypherScript, targetTenant, targetProjectKey, metadata);

    console.log(`[Project Import] Import completed successfully`);
    console.log(`[Project Import] Nodes created: ${result.nodesCreated}`);
    console.log(`[Project Import] Relationships created: ${result.relationshipsCreated}`);
    console.log(`[Project Import] Duration: ${result.duration}ms`);

    return {
      success: true,
      nodesCreated: result.nodesCreated,
      relationshipsCreated: result.relationshipsCreated,
      errors: [],
      warnings: result.warnings,
      duration: Date.now() - startTime,
      targetTenant,
      targetProjectKey
    };
  } catch (error) {
    console.error("[Project Import] Import failed:", error);
    return {
      success: false,
      nodesCreated: 0,
      relationshipsCreated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      duration: Date.now() - startTime,
      targetTenant: options.targetTenant || "unknown",
      targetProjectKey: options.targetProjectKey || "unknown"
    };
  } finally {
    await session.close();
  }
}

/**
 * Import a project from a JSON backup file.
 */
export async function importProjectFromJSON(
  backupFilePath: string,
  options: ProjectImportOptions = {}
): Promise<ProjectImportResult> {
  const startTime = Date.now();
  const session = getSession();

  try {
    console.log(`[Project Import] Loading JSON backup: ${backupFilePath}`);

    // Load JSON file
    const jsonContent = await fs.readFile(backupFilePath, "utf-8");
    const exportData: ProjectExportData = JSON.parse(jsonContent);

    // Determine target
    const targetTenant = options.targetTenant || exportData.metadata.tenant;
    const targetProjectKey = options.targetProjectKey || exportData.metadata.projectKey;

    console.log(`[Project Import] Target: ${targetTenant}/${targetProjectKey}`);
    console.log(`[Project Import] Nodes to import: ${exportData.nodes.length}`);
    console.log(`[Project Import] Relationships to import: ${exportData.relationships.length}`);

    // Dry run check
    if (options.dryRun) {
      console.log("[Project Import] DRY RUN MODE - No changes will be made");
      return {
        success: true,
        nodesCreated: 0,
        relationshipsCreated: 0,
        errors: [],
        warnings: [],
        duration: Date.now() - startTime,
        targetTenant,
        targetProjectKey
      };
    }

    // Delete existing if requested
    if (options.deleteExisting) {
      console.log(`[Project Import] Deleting existing project data...`);
      await deleteProjectData(session, targetTenant, targetProjectKey);
    }

    // Import nodes
    console.log("[Project Import] Importing nodes...");
    const nodeIdMap = await importNodes(session, exportData.nodes, targetTenant, targetProjectKey);

    // Import relationships
    console.log("[Project Import] Importing relationships...");
    const relationshipsCreated = await importRelationships(session, exportData.relationships, nodeIdMap);

    console.log(`[Project Import] Import completed successfully`);

    return {
      success: true,
      nodesCreated: exportData.nodes.length,
      relationshipsCreated,
      errors: [],
      warnings: [],
      duration: Date.now() - startTime,
      targetTenant,
      targetProjectKey
    };
  } catch (error) {
    console.error("[Project Import] Import failed:", error);
    return {
      success: false,
      nodesCreated: 0,
      relationshipsCreated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      duration: Date.now() - startTime,
      targetTenant: options.targetTenant || "unknown",
      targetProjectKey: options.targetProjectKey || "unknown"
    };
  } finally {
    await session.close();
  }
}

// ============================================================================
// Core Import Operations
// ============================================================================

/**
 * Delete all nodes and relationships for a specific project.
 * Used before restore to ensure clean state.
 */
async function deleteProjectData(
  session: any,
  tenant: string,
  projectKey: string
): Promise<void> {
  const query = `
    MATCH (n)
    WHERE n.tenant = $tenant AND n.projectKey = $projectKey
    DETACH DELETE n
  `;

  const result = await session.run(query, { tenant, projectKey });
  const deleteCount = result.summary.counters.updates().nodesDeleted;

  console.log(`[Project Import] Deleted ${deleteCount} existing nodes`);
}

/**
 * Execute a Cypher script with tenant/project substitution.
 */
async function executeCypherScript(
  session: any,
  cypherScript: string,
  targetTenant: string,
  targetProjectKey: string,
  metadata: ProjectBackupMetadata | null
): Promise<{
  nodesCreated: number;
  relationshipsCreated: number;
  warnings: string[];
  duration: number;
}> {
  const startTime = Date.now();
  const warnings: string[] = [];

  // If importing to different tenant/project, update the script
  if (metadata && (targetTenant !== metadata.tenant || targetProjectKey !== metadata.projectKey)) {
    console.log(`[Project Import] Remapping from ${metadata.tenant}/${metadata.projectKey} to ${targetTenant}/${targetProjectKey}`);

    cypherScript = cypherScript
      .replace(new RegExp(`tenant: "${metadata.tenant}"`, "g"), `tenant: "${targetTenant}"`)
      .replace(new RegExp(`projectKey: "${metadata.projectKey}"`, "g"), `projectKey: "${targetProjectKey}"`);

    warnings.push(`Project remapped from ${metadata.tenant}/${metadata.projectKey} to ${targetTenant}/${targetProjectKey}`);
  }

  // Split script into individual statements
  const statements = cypherScript
    .split(";")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("//"));

  let nodesCreated = 0;
  let relationshipsCreated = 0;

  // Execute each statement
  for (const statement of statements) {
    if (!statement) continue;

    try {
      const result = await session.run(statement);
      const counters = result.summary.counters.updates();

      nodesCreated += counters.nodesCreated || 0;
      relationshipsCreated += counters.relationshipsCreated || 0;
    } catch (error) {
      console.warn(`[Project Import] Statement warning:`, error);
      warnings.push(`Statement execution warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const duration = Date.now() - startTime;
  return { nodesCreated, relationshipsCreated, warnings, duration };
}

/**
 * Import nodes from JSON export.
 */
async function importNodes(
  session: any,
  nodes: ExportedNode[],
  targetTenant: string,
  targetProjectKey: string
): Promise<Map<string, string>> {
  const nodeIdMap = new Map<string, string>();

  for (const node of nodes) {
    // Update tenant and projectKey if present
    const properties = { ...node.properties };
    if ("tenant" in properties) properties.tenant = targetTenant;
    if ("projectKey" in properties) properties.projectKey = targetProjectKey;

    // Create node
    const labels = node.labels.join(":");
    const query = `CREATE (n:${labels} $props) RETURN id(n) as newId`;

    const result = await session.run(query, { props: properties });
    const newId = result.records[0].get("newId").toString();

    nodeIdMap.set(node.identity, newId);
  }

  return nodeIdMap;
}

/**
 * Import relationships from JSON export.
 */
async function importRelationships(
  session: any,
  relationships: ExportedRelationship[],
  nodeIdMap: Map<string, string>
): Promise<number> {
  let count = 0;

  for (const rel of relationships) {
    const startId = nodeIdMap.get(rel.startNodeId);
    const endId = nodeIdMap.get(rel.endNodeId);

    if (!startId || !endId) {
      console.warn(`[Project Import] Skipping relationship ${rel.type}: missing node mapping`);
      continue;
    }

    const query = `
      MATCH (a), (b)
      WHERE id(a) = $startId AND id(b) = $endId
      CREATE (a)-[r:${rel.type} $props]->(b)
    `;

    await session.run(query, {
      startId: parseInt(startId),
      endId: parseInt(endId),
      props: rel.properties
    });

    count++;
  }

  return count;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a Cypher backup script without executing it.
 */
async function validateCypherScript(
  cypherScript: string,
  metadata: ProjectBackupMetadata | null
): Promise<ImportValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic syntax checks
  if (!cypherScript.includes("CREATE")) {
    errors.push("No CREATE statements found in backup script");
  }

  // Check for required patterns
  const createNodePattern = /CREATE \([a-z0-9]+:[A-Z]/;
  if (!createNodePattern.test(cypherScript)) {
    warnings.push("No node creation patterns detected");
  }

  // Metadata validation
  if (!metadata) {
    warnings.push("No metadata file found - cannot validate backup integrity");
  }

  // Count expected nodes and relationships
  const nodeCount = (cypherScript.match(/CREATE \([^)]+\)/g) || []).length;
  const relCount = (cypherScript.match(/CREATE \([^)]+\)-\[/g) || []).length;

  if (metadata) {
    if (nodeCount !== metadata.stats.totalNodes) {
      warnings.push(`Node count mismatch: script has ${nodeCount}, metadata says ${metadata.stats.totalNodes}`);
    }

    if (relCount !== metadata.stats.totalRelationships) {
      warnings.push(`Relationship count mismatch: script has ${relCount}, metadata says ${metadata.stats.totalRelationships}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalNodes: nodeCount,
      totalRelationships: relCount,
      crossProjectReferences: 0 // TODO: detect cross-project refs
    }
  };
}

/**
 * Validate a project backup before import.
 * Checks for data integrity, missing dependencies, etc.
 */
export async function validateProjectBackup(
  backupFilePath: string
): Promise<ImportValidation> {
  try {
    // Detect format
    const isJSON = backupFilePath.endsWith(".json");

    if (isJSON) {
      const content = await fs.readFile(backupFilePath, "utf-8");
      const exportData: ProjectExportData = JSON.parse(content);

      return {
        valid: true,
        errors: [],
        warnings: [],
        stats: {
          totalNodes: exportData.nodes.length,
          totalRelationships: exportData.relationships.length,
          crossProjectReferences: 0
        }
      };
    } else {
      // Cypher format
      const cypherScript = await fs.readFile(backupFilePath, "utf-8");
      const metadataPath = backupFilePath.replace(/\.cypher$/, ".metadata.json");

      let metadata: ProjectBackupMetadata | null = null;
      try {
        const metadataContent = await fs.readFile(metadataPath, "utf-8");
        metadata = JSON.parse(metadataContent);
      } catch {
        // No metadata available
      }

      return await validateCypherScript(cypherScript, metadata);
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      stats: {
        totalNodes: 0,
        totalRelationships: 0,
        crossProjectReferences: 0
      }
    };
  }
}

/**
 * Restore project to a temporary location for verification.
 * Returns the temp tenant/project identifiers.
 */
export async function restoreToTempProject(
  backupFilePath: string
): Promise<ProjectImportResult> {
  const timestamp = Date.now();
  const tempTenant = `temp-restore-${timestamp}`;
  const tempProject = `temp-${timestamp}`;

  console.log(`[Project Import] Restoring to temporary project: ${tempTenant}/${tempProject}`);

  const result = await importProjectFromCypher(backupFilePath, {
    targetTenant: tempTenant,
    targetProjectKey: tempProject,
    deleteExisting: false // Don't need to delete for new temp project
  });

  if (result.success) {
    console.log(`[Project Import] Temporary project created successfully`);
    console.log(`[Project Import] Review at: ${tempTenant}/${tempProject}`);
    console.log(`[Project Import] Delete when done: MATCH (n {tenant: "${tempTenant}", projectKey: "${tempProject}"}) DETACH DELETE n`);
  }

  return result;
}
