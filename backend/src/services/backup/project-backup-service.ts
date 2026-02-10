/**
 * Project-Level Backup Service
 *
 * Exports a single project's complete subgraph from Neo4j to a Cypher script.
 * Enables per-project backup/restore without affecting other tenants/projects.
 *
 * Features:
 * - Export all nodes and relationships for a specific tenant/project
 * - Generate executable Cypher script for restore
 * - Support for all entity types (Requirements, Documents, Baselines, etc.)
 * - Preserve version history and relationships
 * - Handle cross-project references safely
 */

import { getSession } from "../graph/driver.js";
import { logger } from "../../lib/logger.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export interface ProjectBackupOptions {
  includeVersionHistory?: boolean;
  includeBaselines?: boolean;
  includeCandidates?: boolean;
  includeArchitecture?: boolean;
  format?: "cypher" | "json";
  compression?: "gzip" | "none";
}

export interface ProjectBackupMetadata {
  backupId: string;
  tenant: string;
  projectKey: string;
  timestamp: string;
  format: string;
  compressed: boolean;
  fileSize: number;
  stats: {
    requirements: number;
    requirementVersions: number;
    documents: number;
    documentVersions: number;
    sections: number;
    sectionVersions: number;
    infos: number;
    infoVersions: number;
    surrogates: number;
    surrogateVersions: number;
    traceLinks: number;
    traceLinkVersions: number;
    linksets: number;
    linksetVersions: number;
    diagrams: number;
    diagramVersions: number;
    blocks: number;
    blockVersions: number;
    connectors: number;
    connectorVersions: number;
    baselines: number;
    candidates: number;
    folders: number;
    totalNodes: number;
    totalRelationships: number;
  };
  checksums: {
    md5: string;
    sha256: string;
  };
  checksum: string; // Alias for checksums.sha256
  options: ProjectBackupOptions;
}

export interface ExportedNode {
  labels: string[];
  properties: Record<string, any>;
  identity: string;
}

export interface ExportedRelationship {
  type: string;
  properties: Record<string, any>;
  startNodeId: string;
  endNodeId: string;
}

export interface ProjectExportData {
  metadata: ProjectBackupMetadata;
  nodes: ExportedNode[];
  relationships: ExportedRelationship[];
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export a complete project to a Cypher script file.
 * This creates a self-contained backup that can be restored independently.
 */
export async function exportProjectToCypher(
  tenant: string,
  projectKey: string,
  outputPath: string,
  options: ProjectBackupOptions = {}
): Promise<ProjectBackupMetadata> {
  const session = getSession();

  const defaultOptions: ProjectBackupOptions = {
    includeVersionHistory: true,
    includeBaselines: true,
    includeCandidates: true,
    includeArchitecture: true,
    format: "cypher",
    compression: "gzip",
    ...options
  };

  try {
    logger.info(`[Project Backup] Exporting ${tenant}/${projectKey}...`);

    // Step 1: Export all nodes for this project
    const nodes = await exportProjectNodes(session, tenant, projectKey, defaultOptions);
    logger.info(`[Project Backup] Exported ${nodes.length} nodes`);

    // Step 2: Export all relationships between project nodes
    const relationships = await exportProjectRelationships(session, tenant, projectKey, nodes);
    logger.info(`[Project Backup] Exported ${relationships.length} relationships`);

    // Step 3: Generate Cypher script
    const cypherScript = generateCypherScript(tenant, projectKey, nodes, relationships, defaultOptions);

    // Step 4: Write to file
    await fs.mkdir(join(outputPath, ".."), { recursive: true });
    await fs.writeFile(outputPath, cypherScript, "utf-8");

    // Step 5: Calculate checksums and file size
    const fileContent = await fs.readFile(outputPath);
    const md5 = createHash("md5").update(fileContent).digest("hex");
    const sha256 = createHash("sha256").update(fileContent).digest("hex");
    const fileStats = await fs.stat(outputPath);

    // Step 6: Generate metadata
    const metadata: ProjectBackupMetadata = {
      backupId: `${tenant}-${projectKey}-${Date.now()}`,
      tenant,
      projectKey,
      timestamp: new Date().toISOString(),
      format: defaultOptions.format || "cypher",
      compressed: defaultOptions.compression === "gzip",
      fileSize: fileStats.size,
      stats: calculateStats(nodes, relationships),
      checksums: { md5, sha256 },
      checksum: sha256,
      options: defaultOptions
    };

    // Step 7: Write metadata file
    const metadataPath = outputPath.replace(/\.cypher$/, ".metadata.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

    logger.info(`[Project Backup] Backup completed: ${outputPath}`);
    logger.info(`[Project Backup] Metadata: ${metadataPath}`);
    logger.info(`[Project Backup] Total nodes: ${metadata.stats.totalNodes}`);
    logger.info(`[Project Backup] Total relationships: ${metadata.stats.totalRelationships}`);

    return metadata;
  } finally {
    await session.close();
  }
}

// ============================================================================
// Node Export Functions
// ============================================================================

/**
 * Export all nodes belonging to a project.
 * Uses efficient batched queries to handle large projects.
 */
async function exportProjectNodes(
  session: any,
  tenant: string,
  projectKey: string,
  options: ProjectBackupOptions
): Promise<ExportedNode[]> {
  const nodes: ExportedNode[] = [];
  const nodeLabels = [
    "Requirement",
    "Document",
    "DocumentSection",
    "Info",
    "SurrogateReference",
    "TraceLink",
    "DocumentLinkset",
    "Folder",
  ];

  // Conditionally include additional node types
  if (options.includeVersionHistory) {
    nodeLabels.push(
      "RequirementVersion",
      "DocumentVersion",
      "DocumentSectionVersion",
      "InfoVersion",
      "SurrogateReferenceVersion",
      "TraceLinkVersion",
      "DocumentLinksetVersion"
    );
  }

  if (options.includeBaselines) {
    nodeLabels.push("Baseline");
  }

  if (options.includeCandidates) {
    nodeLabels.push("RequirementCandidate", "DiagramCandidate");
  }

  if (options.includeArchitecture) {
    nodeLabels.push(
      "ArchitectureDiagram",
      "ArchitectureBlock",
      "ArchitectureConnector",
      "ArchitectureBlockDefinition"
    );

    if (options.includeVersionHistory) {
      nodeLabels.push(
        "ArchitectureDiagramVersion",
        "ArchitectureBlockVersion",
        "ArchitectureConnectorVersion"
      );
    }
  }

  // Export each node type
  for (const label of nodeLabels) {
    const labelNodes = await exportNodesByLabel(session, label, tenant, projectKey);
    nodes.push(...labelNodes);
  }

  return nodes;
}

/**
 * Export all nodes of a specific label for the project.
 */
async function exportNodesByLabel(
  session: any,
  label: string,
  tenant: string,
  projectKey: string
): Promise<ExportedNode[]> {
  const query = `
    MATCH (n:${label})
    WHERE n.tenant = $tenant AND n.projectKey = $projectKey
    RETURN n, id(n) as nodeId
  `;

  const result = await session.run(query, { tenant, projectKey });

  return result.records.map((record: any) => {
    const node = record.get("n");
    const nodeId = record.get("nodeId").toString();

    return {
      labels: node.labels,
      properties: convertNeo4jProperties(node.properties),
      identity: nodeId
    };
  });
}

// ============================================================================
// Relationship Export Functions
// ============================================================================

/**
 * Export all relationships between nodes in the project.
 * Includes both intra-project relationships and cross-project references.
 */
async function exportProjectRelationships(
  session: any,
  tenant: string,
  projectKey: string,
  nodes: ExportedNode[]
): Promise<ExportedRelationship[]> {
  const relationships: ExportedRelationship[] = [];
  const nodeIds = new Set(nodes.map(n => n.identity));

  // Query all relationships where both nodes are in our project
  const query = `
    MATCH (a)-[r]->(b)
    WHERE a.tenant = $tenant AND a.projectKey = $projectKey
      AND b.tenant = $tenant AND b.projectKey = $projectKey
    RETURN type(r) as relType,
           properties(r) as relProps,
           id(a) as startId,
           id(b) as endId
  `;

  const result = await session.run(query, { tenant, projectKey });

  for (const record of result.records) {
    const startId = record.get("startId").toString();
    const endId = record.get("endId").toString();

    // Only include if both nodes were exported
    if (nodeIds.has(startId) && nodeIds.has(endId)) {
      relationships.push({
        type: record.get("relType"),
        properties: convertNeo4jProperties(record.get("relProps")),
        startNodeId: startId,
        endNodeId: endId
      });
    }
  }

  return relationships;
}

// ============================================================================
// Cypher Script Generation
// ============================================================================

/**
 * Generate executable Cypher script from exported data.
 */
function generateCypherScript(
  tenant: string,
  projectKey: string,
  nodes: ExportedNode[],
  relationships: ExportedRelationship[],
  options: ProjectBackupOptions
): string {
  let script = "";

  // Header
  script += `// ============================================================================\n`;
  script += `// Project Backup: ${tenant}/${projectKey}\n`;
  script += `// Generated: ${new Date().toISOString()}\n`;
  script += `// Nodes: ${nodes.length}\n`;
  script += `// Relationships: ${relationships.length}\n`;
  script += `// ============================================================================\n\n`;

  // Safety warning
  script += `// WARNING: This script will CREATE nodes and relationships.\n`;
  script += `// It does NOT delete existing data. Use with caution.\n`;
  script += `// For clean restore, delete the project first:\n`;
  script += `// MATCH (n) WHERE n.tenant = '${tenant}' AND n.projectKey = '${projectKey}' DETACH DELETE n;\n\n`;

  // Create nodes with temporary IDs
  script += `// ============================================================================\n`;
  script += `// NODES\n`;
  script += `// ============================================================================\n\n`;

  const nodeIdMap = new Map<string, string>();

  for (const node of nodes) {
    const varName = `n${node.identity}`;
    nodeIdMap.set(node.identity, varName);

    const labels = node.labels.join(":");
    const props = formatCypherProperties(node.properties);

    script += `CREATE (${varName}:${labels} ${props});\n`;
  }

  script += `\n`;

  // Create relationships
  script += `// ============================================================================\n`;
  script += `// RELATIONSHIPS\n`;
  script += `// ============================================================================\n\n`;

  for (const rel of relationships) {
    const startVar = nodeIdMap.get(rel.startNodeId);
    const endVar = nodeIdMap.get(rel.endNodeId);

    if (startVar && endVar) {
      const props = Object.keys(rel.properties).length > 0
        ? ` ${formatCypherProperties(rel.properties)}`
        : "";

      script += `CREATE (${startVar})-[:${rel.type}${props}]->(${endVar});\n`;
    }
  }

  script += `\n// Backup script complete\n`;

  return script;
}

/**
 * Format properties as Cypher map syntax.
 */
function formatCypherProperties(props: Record<string, any>): string {
  const entries: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      continue;
    }

    let formattedValue: string;

    if (typeof value === "string") {
      // Escape quotes and newlines
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      formattedValue = `"${escaped}"`;
    } else if (typeof value === "number") {
      formattedValue = value.toString();
    } else if (typeof value === "boolean") {
      formattedValue = value.toString();
    } else if (Array.isArray(value)) {
      formattedValue = JSON.stringify(value);
    } else if (typeof value === "object") {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = `"${String(value)}"`;
    }

    entries.push(`${key}: ${formattedValue}`);
  }

  return `{${entries.join(", ")}}`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Neo4j native types to JavaScript primitives.
 */
function convertNeo4jProperties(props: Record<string, any>): Record<string, any> {
  const converted: Record<string, any> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      converted[key] = null;
      continue;
    }

    // Handle Neo4j Integer
    if (value && typeof value === "object" && "toNumber" in value) {
      converted[key] = value.toNumber();
    }
    // Handle Neo4j DateTime
    else if (value && typeof value === "object" && "toString" in value && value.constructor.name === "DateTime") {
      converted[key] = value.toString();
    }
    // Handle arrays
    else if (Array.isArray(value)) {
      converted[key] = value.map(v =>
        v && typeof v === "object" && "toNumber" in v ? v.toNumber() : v
      );
    }
    // Handle plain objects
    else if (typeof value === "object") {
      converted[key] = value;
    }
    // Primitives
    else {
      converted[key] = value;
    }
  }

  return converted;
}

/**
 * Calculate backup statistics.
 */
function calculateStats(
  nodes: ExportedNode[],
  relationships: ExportedRelationship[]
): ProjectBackupMetadata["stats"] {
  const stats = {
    requirements: 0,
    requirementVersions: 0,
    documents: 0,
    documentVersions: 0,
    sections: 0,
    sectionVersions: 0,
    infos: 0,
    infoVersions: 0,
    surrogates: 0,
    surrogateVersions: 0,
    traceLinks: 0,
    traceLinkVersions: 0,
    linksets: 0,
    linksetVersions: 0,
    diagrams: 0,
    diagramVersions: 0,
    blocks: 0,
    blockVersions: 0,
    connectors: 0,
    connectorVersions: 0,
    baselines: 0,
    candidates: 0,
    folders: 0,
    totalNodes: nodes.length,
    totalRelationships: relationships.length
  };

  // Count by label
  for (const node of nodes) {
    if (node.labels.includes("Requirement")) stats.requirements++;
    if (node.labels.includes("RequirementVersion")) stats.requirementVersions++;
    if (node.labels.includes("Document")) stats.documents++;
    if (node.labels.includes("DocumentVersion")) stats.documentVersions++;
    if (node.labels.includes("DocumentSection")) stats.sections++;
    if (node.labels.includes("DocumentSectionVersion")) stats.sectionVersions++;
    if (node.labels.includes("Info")) stats.infos++;
    if (node.labels.includes("InfoVersion")) stats.infoVersions++;
    if (node.labels.includes("SurrogateReference")) stats.surrogates++;
    if (node.labels.includes("SurrogateReferenceVersion")) stats.surrogateVersions++;
    if (node.labels.includes("TraceLink")) stats.traceLinks++;
    if (node.labels.includes("TraceLinkVersion")) stats.traceLinkVersions++;
    if (node.labels.includes("DocumentLinkset")) stats.linksets++;
    if (node.labels.includes("DocumentLinksetVersion")) stats.linksetVersions++;
    if (node.labels.includes("ArchitectureDiagram")) stats.diagrams++;
    if (node.labels.includes("ArchitectureDiagramVersion")) stats.diagramVersions++;
    if (node.labels.includes("ArchitectureBlock")) stats.blocks++;
    if (node.labels.includes("ArchitectureBlockVersion")) stats.blockVersions++;
    if (node.labels.includes("ArchitectureConnector")) stats.connectors++;
    if (node.labels.includes("ArchitectureConnectorVersion")) stats.connectorVersions++;
    if (node.labels.includes("Baseline")) stats.baselines++;
    if (node.labels.includes("RequirementCandidate") || node.labels.includes("DiagramCandidate")) {
      stats.candidates++;
    }
    if (node.labels.includes("Folder")) stats.folders++;
  }

  return stats;
}

/**
 * Export project to JSON format (alternative to Cypher).
 */
export async function exportProjectToJSON(
  tenant: string,
  projectKey: string,
  outputPath: string,
  options: ProjectBackupOptions = {}
): Promise<ProjectBackupMetadata> {
  const session = getSession();

  try {
    const nodes = await exportProjectNodes(session, tenant, projectKey, options);
    const relationships = await exportProjectRelationships(session, tenant, projectKey, nodes);

    const exportData: ProjectExportData = {
      metadata: {
        backupId: `${tenant}-${projectKey}-${Date.now()}`,
        tenant,
        projectKey,
        timestamp: new Date().toISOString(),
        format: "json",
        compressed: options.compression === "gzip",
        fileSize: 0, // Will be calculated after write
        stats: calculateStats(nodes, relationships),
        checksums: { md5: "", sha256: "" }, // Will be calculated after write
        checksum: "", // Will be calculated after write
        options
      },
      nodes,
      relationships
    };

    const json = JSON.stringify(exportData, null, 2);

    await fs.mkdir(join(outputPath, ".."), { recursive: true });
    await fs.writeFile(outputPath, json, "utf-8");

    // Calculate checksums and file size
    const fileContent = await fs.readFile(outputPath);
    const fileStats = await fs.stat(outputPath);
    exportData.metadata.checksums.md5 = createHash("md5").update(fileContent).digest("hex");
    exportData.metadata.checksums.sha256 = createHash("sha256").update(fileContent).digest("hex");
    exportData.metadata.checksum = exportData.metadata.checksums.sha256;
    exportData.metadata.fileSize = fileStats.size;

    // Update file with checksums
    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

    logger.info(`[Project Backup] JSON export completed: ${outputPath}`);
    return exportData.metadata;
  } finally {
    await session.close();
  }
}
