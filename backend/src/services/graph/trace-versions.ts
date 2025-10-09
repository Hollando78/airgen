import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "./driver.js";

export type TraceLinkVersionRecord = {
  versionId: string;
  traceLinkId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of trace link state
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";
  description?: string;
  contentHash: string;
};

/**
 * Generate content hash for TraceLink node to detect changes
 */
export function generateTraceLinkContentHash(params: {
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: string;
  description?: string | null;
}): string {
  const content = JSON.stringify({
    sourceRequirementId: params.sourceRequirementId,
    targetRequirementId: params.targetRequirementId,
    linkType: params.linkType,
    description: params.description || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for a TraceLink node
 */
export async function createTraceLinkVersion(
  tx: ManagedTransaction,
  params: {
    traceLinkId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current trace link state
    sourceRequirementId: string;
    targetRequirementId: string;
    linkType: "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";
    description?: string | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (link:TraceLink {id: $traceLinkId})
      OPTIONAL MATCH (link)-[:HAS_VERSION]->(v:TraceLinkVersion)
      RETURN count(v) as versionCount
    `,
    { traceLinkId: params.traceLinkId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (link:TraceLink {id: $traceLinkId})
      CREATE (version:TraceLinkVersion {
        versionId: $versionId,
        traceLinkId: $traceLinkId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        sourceRequirementId: $sourceRequirementId,
        targetRequirementId: $targetRequirementId,
        linkType: $linkType,
        description: $description,
        contentHash: $contentHash
      })
      CREATE (link)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, link
      OPTIONAL MATCH (link)-[:HAS_VERSION]->(prevVersion:TraceLinkVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      traceLinkId: params.traceLinkId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      sourceRequirementId: params.sourceRequirementId,
      targetRequirementId: params.targetRequirementId,
      linkType: params.linkType,
      description: params.description || null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for a TraceLink node
 */
export async function getTraceLinkHistory(
  tenant: string,
  projectKey: string,
  traceLinkId: string
): Promise<TraceLinkVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (link:TraceLink {id: $traceLinkId})
        MATCH (link)-[:HAS_VERSION]->(version:TraceLinkVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { traceLinkId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        traceLinkId: String(v.traceLinkId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        sourceRequirementId: String(v.sourceRequirementId),
        targetRequirementId: String(v.targetRequirementId),
        linkType: String(v.linkType) as TraceLinkVersionRecord["linkType"],
        description: v.description ? String(v.description) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of a TraceLink node
 */
export type TraceLinkDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getTraceLinkDiff(
  tenant: string,
  projectKey: string,
  traceLinkId: string,
  fromVersion: number,
  toVersion: number
): Promise<TraceLinkDiff[]> {
  const history = await getTraceLinkHistory(tenant, projectKey, traceLinkId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof TraceLinkVersionRecord)[] = [
    "sourceRequirementId", "targetRequirementId", "linkType", "description"
  ];

  const diff: TraceLinkDiff[] = [];

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
