import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "./driver.js";

export type SurrogateReferenceVersionRecord = {
  versionId: string;
  surrogateId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of surrogate reference state
  slug: string; // References the surrogate document by slug
  caption?: string;
  sectionId?: string;
  order?: number;
  contentHash: string;
};

/**
 * Generate content hash for SurrogateReference node to detect changes
 */
export function generateSurrogateContentHash(params: {
  slug: string;
  caption?: string | null;
}): string {
  const content = JSON.stringify({
    slug: params.slug,
    caption: params.caption || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for a SurrogateReference node
 */
export async function createSurrogateReferenceVersion(
  tx: ManagedTransaction,
  params: {
    surrogateId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current surrogate reference state
    slug: string;
    caption?: string | null;
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
      MATCH (sur:SurrogateReference {id: $surrogateId})
      OPTIONAL MATCH (sur)-[:HAS_VERSION]->(v:SurrogateReferenceVersion)
      RETURN count(v) as versionCount
    `,
    { surrogateId: params.surrogateId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (sur:SurrogateReference {id: $surrogateId})
      CREATE (version:SurrogateReferenceVersion {
        versionId: $versionId,
        surrogateId: $surrogateId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        slug: $slug,
        caption: $caption,
        sectionId: $sectionId,
        order: $order,
        contentHash: $contentHash
      })
      CREATE (sur)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, sur
      OPTIONAL MATCH (sur)-[:HAS_VERSION]->(prevVersion:SurrogateReferenceVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      surrogateId: params.surrogateId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      slug: params.slug,
      caption: params.caption || null,
      sectionId: params.sectionId || null,
      order: params.order !== null && params.order !== undefined ? params.order : null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for a SurrogateReference node
 */
export async function getSurrogateReferenceHistory(
  tenant: string,
  projectKey: string,
  surrogateId: string
): Promise<SurrogateReferenceVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (sur:SurrogateReference {id: $surrogateId})
        MATCH (sur)-[:HAS_VERSION]->(version:SurrogateReferenceVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { surrogateId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        surrogateId: String(v.surrogateId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        slug: String(v.slug),
        caption: v.caption ? String(v.caption) : undefined,
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
 * Compare two versions of a SurrogateReference node
 */
export type SurrogateReferenceDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getSurrogateReferenceDiff(
  tenant: string,
  projectKey: string,
  surrogateId: string,
  fromVersion: number,
  toVersion: number
): Promise<SurrogateReferenceDiff[]> {
  const history = await getSurrogateReferenceHistory(tenant, projectKey, surrogateId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof SurrogateReferenceVersionRecord)[] = [
    "slug", "caption", "sectionId", "order"
  ];

  const diff: SurrogateReferenceDiff[] = [];

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
