import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "./driver.js";

export type InfoVersionRecord = {
  versionId: string;
  infoId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of info state
  ref: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
  contentHash: string;
};

/**
 * Generate content hash for Info node to detect changes
 */
export function generateInfoContentHash(params: {
  text: string;
  title?: string | null;
}): string {
  const content = JSON.stringify({
    text: params.text,
    title: params.title || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for an Info node
 */
export async function createInfoVersion(
  tx: ManagedTransaction,
  params: {
    infoId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current info state
    ref: string;
    text: string;
    title?: string | null;
    sectionId?: string | null;
    order?: number | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (info:Info {id: $infoId})
      OPTIONAL MATCH (info)-[:HAS_VERSION]->(v:InfoVersion)
      RETURN count(v) as versionCount
    `,
    { infoId: params.infoId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (info:Info {id: $infoId})
      CREATE (version:InfoVersion {
        versionId: $versionId,
        infoId: $infoId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        ref: $ref,
        text: $text,
        title: $title,
        sectionId: $sectionId,
        order: $order,
        contentHash: $contentHash
      })
      CREATE (info)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, info
      OPTIONAL MATCH (info)-[:HAS_VERSION]->(prevVersion:InfoVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      infoId: params.infoId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      ref: params.ref,
      text: params.text,
      title: params.title || null,
      sectionId: params.sectionId || null,
      order: params.order !== null && params.order !== undefined ? params.order : null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for an Info node
 */
export async function getInfoHistory(
  tenant: string,
  projectKey: string,
  infoId: string
): Promise<InfoVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (info:Info {id: $infoId})
        MATCH (info)-[:HAS_VERSION]->(version:InfoVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { infoId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        infoId: String(v.infoId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        ref: String(v.ref),
        text: String(v.text),
        title: v.title ? String(v.title) : undefined,
        sectionId: v.sectionId ? String(v.sectionId) : undefined,
        order: v.order !== null && v.order !== undefined
          ? (typeof v.order === 'number' ? v.order : v.order.toNumber())
          : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of an Info node
 */
export type InfoDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getInfoDiff(
  tenant: string,
  projectKey: string,
  infoId: string,
  fromVersion: number,
  toVersion: number
): Promise<InfoDiff[]> {
  const history = await getInfoHistory(tenant, projectKey, infoId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof InfoVersionRecord)[] = [
    "ref", "text", "title", "sectionId", "order"
  ];

  const diff: InfoDiff[] = [];

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
