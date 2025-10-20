import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { computeRequirementHash } from "../../../lib/requirement-hash.js";
import { slugify } from "../../workspace.js";
import type { RequirementRecord, RequirementPattern, VerificationMethod } from "../../workspace.js";
import { getSession } from "../driver.js";
import { CacheInvalidation } from "../../../lib/cache.js";
import { createRequirementVersion } from "./requirements-versions.js";
import { embeddingService } from "../../embedding.js";
import { mapRequirement, type ComplianceStatus } from "./requirements-mapper.js";

/**
 * Updates only the timestamp of a requirement
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param ref - Requirement reference
 */
export async function updateRequirementTimestamp(
  tenant: string,
  projectKey: string,
  ref: string
): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement {ref: $ref})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement {ref: $ref})
        WITH coalesce(direct, docReq) AS requirement
        WHERE requirement IS NOT NULL
        SET requirement.updatedAt = $now
      `,
      { tenantSlug, projectSlug, ref, now }
    );
  } finally {
    await session.close();
  }
}

/**
 * Updates a requirement with version tracking, embedding updates, and cache invalidation
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param requirementId - Requirement ID
 * @param updates - Fields to update
 * @returns Updated requirement record or null if not found
 */
export async function updateRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    rationale?: string;
    complianceStatus?: ComplianceStatus;
    complianceRationale?: string;
    sectionId?: string | null;
    attributes?: Record<string, string | number | boolean | null>;
    qaScore?: number;
    qaVerdict?: string;
    suggestions?: string[];
    tags?: string[];
    userId?: string; // User making the change
  }
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const { sectionId, userId, ...rest } = updates;
      const propertyUpdates: Record<string, unknown> = { ...rest };
      const hasSectionUpdate = Object.prototype.hasOwnProperty.call(updates, "sectionId");

      // Check if this is a meaningful change (not just metadata)
      const needsVersion = updates.text !== undefined ||
                           updates.pattern !== undefined ||
                           updates.verification !== undefined ||
                           updates.complianceStatus !== undefined ||
                           updates.rationale !== undefined;

      // If content fields are being updated, we need to fetch current values to compute hash
      const needsHashUpdate = updates.text !== undefined ||
                               updates.pattern !== undefined ||
                               updates.verification !== undefined;

      let contentHash: string | undefined;
      let currentRequirement: RequirementRecord | null = null;

      // Fetch current state if we need hash update
      if (needsHashUpdate) {
        const currentReq = await tx.run(
          `
            MATCH (requirement:Requirement {id: $requirementId})
            WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
            RETURN requirement
          `,
          { tenantSlug, projectSlug, requirementId }
        );

        if (currentReq.records.length > 0) {
          const node = currentReq.records[0].get("requirement") as Neo4jNode;
          currentRequirement = mapRequirement(node);

          // Compute new content hash
          const finalText = updates.text ?? currentRequirement.text;
          const finalPattern = updates.pattern !== undefined
            ? updates.pattern
            : currentRequirement.pattern ?? null;
          const finalVerification = updates.verification !== undefined
            ? updates.verification
            : currentRequirement.verification ?? null;

          contentHash = computeRequirementHash({
            text: finalText,
            pattern: finalPattern,
            verification: finalVerification
          });

          // Generate new embedding if text changed
          if (updates.text && updates.text !== currentRequirement.text) {
            try {
              const newEmbedding = await embeddingService.generateEmbedding(updates.text);
              console.log(`[Requirement] Generated new embedding for updated requirement (${newEmbedding.length} dimensions)`);
              propertyUpdates.embedding = newEmbedding;
              propertyUpdates.embeddingModel = 'text-embedding-3-small';
              propertyUpdates.embeddingGeneratedAt = new Date().toISOString();
            } catch (error) {
              console.warn(`[Requirement] Failed to generate embedding:`, error);
              // Continue without embedding update
            }
          }
        }
      }

      const allUpdates = contentHash ? { ...propertyUpdates, contentHash } : propertyUpdates;

      const now = new Date().toISOString();
      const baseParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        requirementId
      };

      // JSON-stringify attributes, suggestions, and tags BEFORE building setClause
      const serializedUpdates: Record<string, unknown> = { ...allUpdates };
      if (serializedUpdates.attributes !== undefined) {
        serializedUpdates.attributes = (serializedUpdates.attributes as Record<string, string | number | boolean | null> | undefined)
          ? JSON.stringify(serializedUpdates.attributes)
          : null;
      }
      if (serializedUpdates.suggestions !== undefined) {
        serializedUpdates.suggestions = (serializedUpdates.suggestions as string[] | undefined)
          ? JSON.stringify(serializedUpdates.suggestions)
          : null;
      }
      if (serializedUpdates.tags !== undefined) {
        serializedUpdates.tags = (serializedUpdates.tags as string[] | undefined)
          ? JSON.stringify(serializedUpdates.tags)
          : null;
      }

      // Build setClause from serialized updates
      const setClause = Object.entries(serializedUpdates)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `requirement.${key} = $${key}`)
        .join(', ');

      if (!setClause && !hasSectionUpdate) {
        throw new Error("No valid updates provided");
      }

      const writeParams: Record<string, unknown> = {
        ...baseParams,
        now,
        ...serializedUpdates
      };

      if (setClause) {
        await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (requirement:Requirement {id: $requirementId})
            SET ${setClause}, requirement.updatedAt = $now
          `,
          writeParams
        );
      } else {
        await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (requirement:Requirement {id: $requirementId})
            SET requirement.updatedAt = $now
          `,
          writeParams
        );
      }

      let documentSlug: string | null = null;

      if (hasSectionUpdate) {
        const sectionParams: Record<string, unknown> = {
          ...baseParams,
          sectionId: sectionId ?? null
        };

        const docResult = await tx.run(
          `
            MATCH (requirement:Requirement {id: $requirementId})
            OPTIONAL MATCH (document:Document)-[:CONTAINS]->(requirement)
            RETURN document.slug AS documentSlug
          `,
          baseParams
        );

        const docRecord = docResult.records[0];
        if (docRecord) {
          const slug = docRecord.get("documentSlug");
          documentSlug = slug ? String(slug) : null;
        }

        await tx.run(
          `
            MATCH (requirement:Requirement {id: $requirementId})
            OPTIONAL MATCH (requirement)<-[existingRel:CONTAINS]-(:DocumentSection)
            WITH requirement, collect(existingRel) AS rels
            FOREACH (rel IN rels | DELETE rel)
          `,
          baseParams
        );

        if (sectionId) {
          await tx.run(
            `
              MATCH (requirement:Requirement {id: $requirementId})
              WHERE requirement.tenant = $tenantSlug AND requirement.projectKey = $projectSlug
              MATCH (newSection:DocumentSection {id: $sectionId})
              MERGE (newSection)-[:CONTAINS]->(requirement)
            `,
            sectionParams
          );

          // Import these functions from requirements-refs.ts when we create it
          const { updateRequirementRefsForSection } = await import("./requirements-refs.js");
          await updateRequirementRefsForSection(tx, sectionId);
        } else if (documentSlug) {
          // Import these functions from requirements-refs.ts when we create it
          const { updateRequirementRefsForDocument } = await import("./requirements-refs.js");
          await updateRequirementRefsForDocument(tx, tenantSlug, projectSlug, documentSlug);
        }
      }

      const finalResult = await tx.run(
        `
          MATCH (requirement:Requirement {id: $requirementId})
          RETURN requirement
        `,
        baseParams
      );

      // Create version snapshot AFTER applying update (if meaningful change)
      if (needsVersion && finalResult.records.length > 0) {
        const updatedNode = finalResult.records[0].get("requirement") as Neo4jNode;
        const updatedReq = mapRequirement(updatedNode);

        await createRequirementVersion(tx, {
          requirementId,
          tenantSlug,
          projectSlug,
          changedBy: userId || "system",
          changeType: "updated",
          text: updatedReq.text,
          pattern: updatedReq.pattern ?? null,
          verification: updatedReq.verification ?? null,
          rationale: updatedReq.rationale ?? null,
          complianceStatus: updatedReq.complianceStatus ?? null,
          complianceRationale: updatedReq.complianceRationale ?? null,
          qaScore: updatedReq.qaScore ?? null,
          qaVerdict: updatedReq.qaVerdict ?? null,
          suggestions: updatedReq.suggestions ?? null,
          tags: updatedReq.tags ?? null,
          attributes: updatedReq.attributes ?? null,
          contentHash: updatedReq.contentHash || ""
        });
      }

      return finalResult.records[0]?.get("requirement") as Neo4jNode | undefined;
    });

    if (!result) {
      return null;
    }

    const requirement = mapRequirement(result);

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    return requirement;
  } finally {
    await session.close();
  }
}
