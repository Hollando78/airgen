import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import type { RequirementRecord } from "../../workspace.js";
import { getSession } from "../driver.js";
import { CacheInvalidation } from "../../../lib/cache.js";
import { createRequirementVersion } from "./requirements-versions.js";
import { mapRequirement } from "./requirements-mapper.js";

/**
 * Soft deletes a requirement (marks as deleted without removing from database)
 * Creates a version snapshot before deletion
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param requirementId - Requirement ID
 * @param deletedBy - User performing the deletion
 * @returns Deleted requirement record or null if not found
 */
export async function softDeleteRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  deletedBy?: string
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Fetch current state BEFORE deletion to create version snapshot
      const currentReq = await tx.run(
        `
          MATCH (requirement:Requirement {id: $requirementId})
          WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
          RETURN requirement
        `,
        { tenantSlug, projectSlug, requirementId }
      );

      if (currentReq.records.length === 0) {
        return null;
      }

      const currentNode = currentReq.records[0].get("requirement") as Neo4jNode;
      const current = mapRequirement(currentNode);

      // Create version snapshot BEFORE marking as deleted
      await createRequirementVersion(tx, {
        requirementId,
        tenantSlug,
        projectSlug,
        changedBy: deletedBy || "system",
        changeType: "deleted",
        changeDescription: "Requirement soft deleted",
        text: current.text,
        pattern: current.pattern ?? null,
        verification: current.verification ?? null,
        rationale: current.rationale ?? null,
        complianceStatus: current.complianceStatus ?? null,
        complianceRationale: current.complianceRationale ?? null,
        qaScore: current.qaScore ?? null,
        qaVerdict: current.qaVerdict ?? null,
        suggestions: current.suggestions ?? null,
        tags: current.tags ?? null,
        attributes: current.attributes ?? null,
        contentHash: current.contentHash || ""
      });

      // Now mark as deleted
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement {id: $requirementId})
        WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
        SET requirement.deleted = true,
            requirement.deletedAt = $now,
            requirement.deletedBy = $deletedBy,
            requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId,
        now,
        deletedBy: deletedBy || null
      });
    });

    if (!result || result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("requirement") as Neo4jNode;

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement count changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

/**
 * Restores a soft-deleted requirement
 * Creates a version snapshot before restoration
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param requirementId - Requirement ID
 * @param restoredBy - User performing the restoration
 * @returns Restored requirement record or null if not found
 */
export async function restoreRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  restoredBy?: string
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Fetch current state BEFORE restoration to create version snapshot
      const currentReq = await tx.run(
        `
          MATCH (requirement:Requirement {id: $requirementId})
          WHERE requirement.tenant = $tenantSlug
            AND requirement.projectKey = $projectSlug
            AND requirement.deleted = true
          RETURN requirement
        `,
        { tenantSlug, projectSlug, requirementId }
      );

      if (currentReq.records.length === 0) {
        return null;
      }

      const currentNode = currentReq.records[0].get("requirement") as Neo4jNode;
      const current = mapRequirement(currentNode);

      // Create version snapshot BEFORE restoring
      await createRequirementVersion(tx, {
        requirementId,
        tenantSlug,
        projectSlug,
        changedBy: restoredBy || "system",
        changeType: "restored",
        changeDescription: "Requirement restored from deletion",
        text: current.text,
        pattern: current.pattern ?? null,
        verification: current.verification ?? null,
        rationale: current.rationale ?? null,
        complianceStatus: current.complianceStatus ?? null,
        complianceRationale: current.complianceRationale ?? null,
        qaScore: current.qaScore ?? null,
        qaVerdict: current.qaVerdict ?? null,
        suggestions: current.suggestions ?? null,
        tags: current.tags ?? null,
        attributes: current.attributes ?? null,
        contentHash: current.contentHash || ""
      });

      // Now restore the requirement
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement {id: $requirementId})
        WHERE requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
          AND requirement.deleted = true
        SET requirement.deleted = false,
            requirement.restoredAt = $now,
            requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId,
        now
      });
    });

    if (!result || result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get("requirement") as Neo4jNode;
    const requirement = mapRequirement(node);

    // Invalidate caches
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return requirement;
  } finally {
    await session.close();
  }
}

/**
 * Archives multiple requirements (marks as archived)
 * Creates version snapshots for all requirements before archiving
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param requirementIds - List of requirement IDs to archive
 * @param archivedBy - User performing the archiving
 * @returns List of archived requirement records
 */
export async function archiveRequirements(
  tenant: string,
  projectKey: string,
  requirementIds: string[],
  archivedBy?: string
): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Fetch current state of each requirement BEFORE archiving
      const fetchQuery = `
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        RETURN requirement
      `;

      const currentReqs = await tx.run(fetchQuery, {
        tenantSlug,
        projectSlug,
        requirementIds
      });

      // Create version snapshots for each requirement BEFORE archiving
      for (const record of currentReqs.records) {
        const node = record.get("requirement") as Neo4jNode;
        const current = mapRequirement(node);

        await createRequirementVersion(tx, {
          requirementId: current.id,
          tenantSlug,
          projectSlug,
          changedBy: archivedBy || "system",
          changeType: "archived",
          changeDescription: "Requirement archived",
          text: current.text,
          pattern: current.pattern ?? null,
          verification: current.verification ?? null,
          rationale: current.rationale ?? null,
          complianceStatus: current.complianceStatus ?? null,
          complianceRationale: current.complianceRationale ?? null,
          qaScore: current.qaScore ?? null,
          qaVerdict: current.qaVerdict ?? null,
          suggestions: current.suggestions ?? null,
          tags: current.tags ?? null,
          attributes: current.attributes ?? null,
          contentHash: current.contentHash || ""
        });
      }

      // Now archive the requirements
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        SET requirement.archived = true, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementIds,
        now: new Date().toISOString()
      });
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement visibility changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result.records.map(record => {
      const node = record.get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });
  } finally {
    await session.close();
  }
}

/**
 * Unarchives multiple requirements (removes archived flag)
 * Creates version snapshots for all requirements before unarchiving
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param requirementIds - List of requirement IDs to unarchive
 * @param unarchivedBy - User performing the unarchiving
 * @returns List of unarchived requirement records
 */
export async function unarchiveRequirements(
  tenant: string,
  projectKey: string,
  requirementIds: string[],
  unarchivedBy?: string
): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Fetch current state of each requirement BEFORE unarchiving
      const fetchQuery = `
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        RETURN requirement
      `;

      const currentReqs = await tx.run(fetchQuery, {
        tenantSlug,
        projectSlug,
        requirementIds
      });

      // Create version snapshots for each requirement BEFORE unarchiving
      for (const record of currentReqs.records) {
        const node = record.get("requirement") as Neo4jNode;
        const current = mapRequirement(node);

        await createRequirementVersion(tx, {
          requirementId: current.id,
          tenantSlug,
          projectSlug,
          changedBy: unarchivedBy || "system",
          changeType: "restored",
          changeDescription: "Requirement unarchived",
          text: current.text,
          pattern: current.pattern ?? null,
          verification: current.verification ?? null,
          rationale: current.rationale ?? null,
          complianceStatus: current.complianceStatus ?? null,
          complianceRationale: current.complianceRationale ?? null,
          qaScore: current.qaScore ?? null,
          qaVerdict: current.qaVerdict ?? null,
          suggestions: current.suggestions ?? null,
          tags: current.tags ?? null,
          attributes: current.attributes ?? null,
          contentHash: current.contentHash || ""
        });
      }

      // Now unarchive the requirements
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (requirement:Requirement)
        WHERE requirement.id IN $requirementIds
          AND requirement.tenant = $tenantSlug
          AND requirement.projectKey = $projectSlug
        SET requirement.archived = false, requirement.updatedAt = $now
        RETURN requirement
      `;

      return await tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementIds,
        now: new Date().toISOString()
      });
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement visibility changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result.records.map(record => {
      const node = record.get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });
  } finally {
    await session.close();
  }
}
