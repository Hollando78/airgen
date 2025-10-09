import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "./driver.js";

export type DocumentLinksetVersionRecord = {
  versionId: string;
  linksetId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of linkset state
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  defaultLinkType?: string;
  contentHash: string;
};

/**
 * Generate content hash for DocumentLinkset node to detect changes
 */
export function generateDocumentLinksetContentHash(params: {
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  defaultLinkType?: string | null;
}): string {
  const content = JSON.stringify({
    sourceDocumentSlug: params.sourceDocumentSlug,
    targetDocumentSlug: params.targetDocumentSlug,
    defaultLinkType: params.defaultLinkType || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for a DocumentLinkset node
 */
export async function createDocumentLinksetVersion(
  tx: ManagedTransaction,
  params: {
    linksetId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current linkset state
    sourceDocumentSlug: string;
    targetDocumentSlug: string;
    defaultLinkType?: string | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (linkset:DocumentLinkset {id: $linksetId})
      OPTIONAL MATCH (linkset)-[:HAS_VERSION]->(v:DocumentLinksetVersion)
      RETURN count(v) as versionCount
    `,
    { linksetId: params.linksetId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (linkset:DocumentLinkset {id: $linksetId})
      CREATE (version:DocumentLinksetVersion {
        versionId: $versionId,
        linksetId: $linksetId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        sourceDocumentSlug: $sourceDocumentSlug,
        targetDocumentSlug: $targetDocumentSlug,
        defaultLinkType: $defaultLinkType,
        contentHash: $contentHash
      })
      CREATE (linkset)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, linkset
      OPTIONAL MATCH (linkset)-[:HAS_VERSION]->(prevVersion:DocumentLinksetVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      linksetId: params.linksetId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      sourceDocumentSlug: params.sourceDocumentSlug,
      targetDocumentSlug: params.targetDocumentSlug,
      defaultLinkType: params.defaultLinkType || null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for a DocumentLinkset node
 */
export async function getDocumentLinksetHistory(
  tenant: string,
  projectKey: string,
  linksetId: string
): Promise<DocumentLinksetVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (linkset:DocumentLinkset {id: $linksetId})
        MATCH (linkset)-[:HAS_VERSION]->(version:DocumentLinksetVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { linksetId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        linksetId: String(v.linksetId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        sourceDocumentSlug: String(v.sourceDocumentSlug),
        targetDocumentSlug: String(v.targetDocumentSlug),
        defaultLinkType: v.defaultLinkType ? String(v.defaultLinkType) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of a DocumentLinkset node
 */
export type DocumentLinksetDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getDocumentLinksetDiff(
  tenant: string,
  projectKey: string,
  linksetId: string,
  fromVersion: number,
  toVersion: number
): Promise<DocumentLinksetDiff[]> {
  const history = await getDocumentLinksetHistory(tenant, projectKey, linksetId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof DocumentLinksetVersionRecord)[] = [
    "sourceDocumentSlug", "targetDocumentSlug", "defaultLinkType"
  ];

  const diff: DocumentLinksetDiff[] = [];

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
