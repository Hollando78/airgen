import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { getSession } from "../driver.js";
import type { RequirementVersionRecord, RequirementPattern, VerificationMethod } from "../../workspace.js";

export async function createRequirementVersion(
  tx: ManagedTransaction,
  params: {
    requirementId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "archived" | "restored" | "deleted";
    changeDescription?: string;
    // Current requirement state
    text: string;
    pattern?: RequirementPattern | null;
    verification?: VerificationMethod | null;
    rationale?: string | null;
    complianceStatus?: string | null;
    complianceRationale?: string | null;
    qaScore?: number | null;
    qaVerdict?: string | null;
    suggestions?: string[] | null;
    tags?: string[] | null;
    attributes?: Record<string, any> | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (req:Requirement {id: $requirementId})
      OPTIONAL MATCH (req)-[:HAS_VERSION]->(v:RequirementVersion)
      RETURN count(v) as versionCount
    `,
    { requirementId: params.requirementId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (req:Requirement {id: $requirementId})
      CREATE (version:RequirementVersion {
        versionId: $versionId,
        requirementId: $requirementId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        text: $text,
        pattern: $pattern,
        verification: $verification,
        rationale: $rationale,
        complianceStatus: $complianceStatus,
        complianceRationale: $complianceRationale,
        qaScore: $qaScore,
        qaVerdict: $qaVerdict,
        suggestions: $suggestions,
        tags: $tags,
        attributes: $attributes,
        contentHash: $contentHash
      })
      CREATE (req)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, req
      OPTIONAL MATCH (req)-[:HAS_VERSION]->(prevVersion:RequirementVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      requirementId: params.requirementId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      text: params.text,
      pattern: params.pattern || null,
      verification: params.verification || null,
      rationale: params.rationale || null,
      complianceStatus: params.complianceStatus || null,
      complianceRationale: params.complianceRationale || null,
      qaScore: params.qaScore || null,
      qaVerdict: params.qaVerdict || null,
      suggestions: params.suggestions ? JSON.stringify(params.suggestions) : null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      attributes: params.attributes ? JSON.stringify(params.attributes) : null,
      contentHash: params.contentHash
    }
  );
}

export async function getRequirementHistory(
  tenant: string,
  projectKey: string,
  requirementId: string
): Promise<RequirementVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (req:Requirement {id: $requirementId})
        MATCH (req)-[:HAS_VERSION]->(version:RequirementVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { requirementId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        requirementId: String(v.requirementId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "archived" | "restored" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        text: String(v.text),
        pattern: v.pattern ? String(v.pattern) as RequirementPattern : undefined,
        verification: v.verification ? String(v.verification) as VerificationMethod : undefined,
        rationale: v.rationale ? String(v.rationale) : undefined,
        complianceStatus: v.complianceStatus ? String(v.complianceStatus) : undefined,
        complianceRationale: v.complianceRationale ? String(v.complianceRationale) : undefined,
        qaScore: v.qaScore ? (typeof v.qaScore === 'number' ? v.qaScore : v.qaScore.toNumber()) : undefined,
        qaVerdict: v.qaVerdict ? String(v.qaVerdict) : undefined,
        suggestions: v.suggestions ? JSON.parse(v.suggestions) : undefined,
        tags: v.tags ? JSON.parse(v.tags) : undefined,
        attributes: v.attributes ? JSON.parse(v.attributes) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

export type RequirementDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getRequirementDiff(
  tenant: string,
  projectKey: string,
  requirementId: string,
  fromVersion: number,
  toVersion: number
): Promise<RequirementDiff[]> {
  const history = await getRequirementHistory(tenant, projectKey, requirementId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof RequirementVersionRecord)[] = [
    "text", "pattern", "verification", "rationale",
    "complianceStatus", "complianceRationale",
    "qaScore", "qaVerdict", "suggestions", "tags", "attributes"
  ];

  const diff: RequirementDiff[] = [];

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
