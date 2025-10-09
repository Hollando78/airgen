import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "../driver.js";
import type { ArchitectureDiagramRecord } from "./types.js";

export type ArchitectureDiagramVersionRecord = {
  versionId: string;
  diagramId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of diagram state
  name: string;
  description?: string;
  view: ArchitectureDiagramRecord["view"];
  contentHash: string;
};

/**
 * Generate content hash for ArchitectureDiagram node to detect changes
 */
export function generateArchitectureDiagramContentHash(params: {
  name: string;
  description?: string | null;
  view: string;
}): string {
  const content = JSON.stringify({
    name: params.name,
    description: params.description || null,
    view: params.view
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for an ArchitectureDiagram node
 */
export async function createArchitectureDiagramVersion(
  tx: ManagedTransaction,
  params: {
    diagramId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current diagram state
    name: string;
    description?: string | null;
    view: ArchitectureDiagramRecord["view"];
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (diagram:ArchitectureDiagram {id: $diagramId})
      OPTIONAL MATCH (diagram)-[:HAS_VERSION]->(v:ArchitectureDiagramVersion)
      RETURN count(v) as versionCount
    `,
    { diagramId: params.diagramId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (diagram:ArchitectureDiagram {id: $diagramId})
      CREATE (version:ArchitectureDiagramVersion {
        versionId: $versionId,
        diagramId: $diagramId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        name: $name,
        description: $description,
        view: $view,
        contentHash: $contentHash
      })
      CREATE (diagram)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, diagram
      OPTIONAL MATCH (diagram)-[:HAS_VERSION]->(prevVersion:ArchitectureDiagramVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      diagramId: params.diagramId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      name: params.name,
      description: params.description || null,
      view: params.view,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for an ArchitectureDiagram node
 */
export async function getArchitectureDiagramHistory(
  tenant: string,
  projectKey: string,
  diagramId: string
): Promise<ArchitectureDiagramVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (diagram:ArchitectureDiagram {id: $diagramId})
        MATCH (diagram)-[:HAS_VERSION]->(version:ArchitectureDiagramVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { diagramId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        diagramId: String(v.diagramId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        name: String(v.name),
        description: v.description ? String(v.description) : undefined,
        view: String(v.view) as ArchitectureDiagramRecord["view"],
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of an ArchitectureDiagram node
 */
export type ArchitectureDiagramDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getArchitectureDiagramDiff(
  tenant: string,
  projectKey: string,
  diagramId: string,
  fromVersion: number,
  toVersion: number
): Promise<ArchitectureDiagramDiff[]> {
  const history = await getArchitectureDiagramHistory(tenant, projectKey, diagramId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof ArchitectureDiagramVersionRecord)[] = [
    "name", "description", "view"
  ];

  const diff: ArchitectureDiagramDiff[] = [];

  for (const field of fields) {
    const oldValue = from[field];
    const newValue = to[field];
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    diff.push({
      field,
      oldValue,
      newValue,
      changed
    });
  }

  return diff;
}
