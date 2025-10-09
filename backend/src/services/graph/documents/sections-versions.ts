import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "../driver.js";

export type DocumentSectionVersionRecord = {
  versionId: string;
  sectionId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of section state
  name: string;
  description?: string;
  shortCode?: string;
  order: number;
  contentHash: string;
};

/**
 * Generate content hash for DocumentSection node to detect changes
 */
export function generateDocumentSectionContentHash(params: {
  name: string;
  description?: string | null;
  shortCode?: string | null;
  order: number;
}): string {
  const content = JSON.stringify({
    name: params.name,
    description: params.description || null,
    shortCode: params.shortCode || null,
    order: params.order
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for a DocumentSection node
 */
export async function createDocumentSectionVersion(
  tx: ManagedTransaction,
  params: {
    sectionId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current section state
    name: string;
    description?: string | null;
    shortCode?: string | null;
    order: number;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (section:DocumentSection {id: $sectionId})
      OPTIONAL MATCH (section)-[:HAS_VERSION]->(v:DocumentSectionVersion)
      RETURN count(v) as versionCount
    `,
    { sectionId: params.sectionId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (section:DocumentSection {id: $sectionId})
      CREATE (version:DocumentSectionVersion {
        versionId: $versionId,
        sectionId: $sectionId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        name: $name,
        description: $description,
        shortCode: $shortCode,
        order: $order,
        contentHash: $contentHash
      })
      CREATE (section)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, section
      OPTIONAL MATCH (section)-[:HAS_VERSION]->(prevVersion:DocumentSectionVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      sectionId: params.sectionId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      name: params.name,
      description: params.description || null,
      shortCode: params.shortCode || null,
      order: params.order,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for a DocumentSection node
 */
export async function getDocumentSectionHistory(
  tenant: string,
  projectKey: string,
  sectionId: string
): Promise<DocumentSectionVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})
        MATCH (section)-[:HAS_VERSION]->(version:DocumentSectionVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { sectionId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        sectionId: String(v.sectionId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        name: String(v.name),
        description: v.description ? String(v.description) : undefined,
        shortCode: v.shortCode ? String(v.shortCode) : undefined,
        order: typeof v.order === 'number' ? v.order : v.order.toNumber(),
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of a DocumentSection node
 */
export type DocumentSectionDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getDocumentSectionDiff(
  tenant: string,
  projectKey: string,
  sectionId: string,
  fromVersion: number,
  toVersion: number
): Promise<DocumentSectionDiff[]> {
  const history = await getDocumentSectionHistory(tenant, projectKey, sectionId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof DocumentSectionVersionRecord)[] = [
    "name", "description", "shortCode", "order"
  ];

  const diff: DocumentSectionDiff[] = [];

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
