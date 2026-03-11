import { randomBytes } from "node:crypto";
import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { config } from "../../../config.js";
import { computeRequirementHash } from "../../../lib/requirement-hash.js";
import { logger } from "../../../lib/logger.js";
import { slugify } from "../../workspace.js";
import type { RequirementRecord } from "../../workspace.js";
import { getSession } from "../driver.js";
import { CacheInvalidation } from "../../../lib/cache.js";
import { createRequirementVersion } from "./requirements-versions.js";
import { embeddingService } from "../../embedding.js";
import { mapRequirement, type RequirementInput } from "./requirements-mapper.js";

/**
 * Creates a new requirement with automatic ref generation, embedding, and version tracking
 *
 * @param input - Requirement data
 * @returns Created requirement record
 * @throws Error if ref already exists
 */
export async function createRequirement(input: RequirementInput): Promise<RequirementRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const now = new Date().toISOString();

  const hashId = randomBytes(8).toString("hex");
  const contentHash = computeRequirementHash({
    text: input.text,
    pattern: input.pattern ?? null,
    verification: input.verification ?? null
  });

  // Generate embedding for the requirement text
  let embedding: number[] | null = null;
  try {
    embedding = await embeddingService.generateEmbedding(input.text);
    logger.info(`[Requirement] Generated embedding for new requirement (${embedding.length} dimensions)`);
  } catch (error) {
    logger.warn({ err: error }, `[Requirement] Failed to generate embedding`);
    // Continue without embedding - it can be backfilled later
  }

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // If ref is provided, check if it already exists
      if (input.ref) {
        const existingCheck = await tx.run(
          `
          MATCH (existing:Requirement {tenant: $tenantSlug, projectKey: $projectSlug, ref: $ref})
          RETURN existing.id AS id
          `,
          { tenantSlug, projectSlug, ref: input.ref }
        );

        if (existingCheck.records.length > 0) {
          throw new Error(`Requirement with ref '${input.ref}' already exists`);
        }
      }

      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now

        WITH tenant, project, $documentSlug AS documentSlugParam, $sectionId AS sectionIdParam, $providedRef AS providedRef

        // Determine finalRef based on whether one is provided
        CALL {
          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef

          OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
          OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})

          // Only generate ref if not provided
          FOREACH (ignoreMe IN CASE WHEN providedRef IS NULL AND document IS NOT NULL THEN [1] ELSE [] END |
            SET document.requirementCounter = coalesce(document.requirementCounter, 0) + 1
          )
          FOREACH (ignoreMe IN CASE WHEN providedRef IS NULL AND document IS NULL THEN [1] ELSE [] END |
            SET project.requirementCounter = coalesce(project.requirementCounter, 0) + 1
          )

          WITH tenant, project, document, section, documentSlugParam, sectionIdParam, providedRef,
               CASE
                 WHEN document IS NOT NULL THEN
                   CASE WHEN section IS NOT NULL THEN
                     coalesce(document.shortCode, toUpper(document.slug)) + '-' +
                     CASE
                       WHEN coalesce(section.shortCode, toUpper(replace(section.name, ' ', ''))) = coalesce(document.shortCode, toUpper(document.slug))
                       THEN 'REQ'
                       ELSE coalesce(section.shortCode, toUpper(replace(section.name, ' ', '')))
                     END
                   ELSE
                     coalesce(document.shortCode, toUpper(document.slug))
                   END
                 ELSE
                   'REQ-' + toUpper(replace($projectSlug, '-', ''))
               END AS prefix,
               CASE
                 WHEN document IS NOT NULL THEN document.requirementCounter
                 ELSE project.requirementCounter
               END AS counter

          OPTIONAL MATCH (existingReq:Requirement {tenant: $tenantSlug, projectKey: $projectSlug})
          WHERE providedRef IS NULL AND existingReq.ref STARTS WITH prefix + '-' AND existingReq.ref =~ (prefix + '-[0-9]{3}')
          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef, prefix, counter,
               max(toInteger(split(existingReq.ref, '-')[size(split(existingReq.ref, '-'))-1])) AS maxExisting

          WITH tenant, project, documentSlugParam, sectionIdParam, providedRef, prefix,
               CASE WHEN maxExisting IS NOT NULL AND maxExisting >= counter
                 THEN maxExisting + 1
                 ELSE counter
               END AS safeCounter

          WITH CASE
                 WHEN providedRef IS NOT NULL THEN providedRef
                 ELSE prefix + '-' + right('000' + toString(safeCounter), 3)
               END AS finalRef

          RETURN finalRef
        }

        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(document:Document {slug: documentSlugParam})
        OPTIONAL MATCH (section:DocumentSection {id: sectionIdParam})

        CREATE (requirement:Requirement {
          id: $tenantSlug + ':' + $projectSlug + ':' + finalRef,
          hashId: $hashId,
          ref: finalRef,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          text: $text,
          pattern: $pattern,
          verification: $verification,
          rationale: $rationale,
          complianceStatus: $complianceStatus,
          complianceRationale: $complianceRationale,
          contentHash: $contentHash,
          qaScore: $qaScore,
          qaVerdict: $qaVerdict,
          suggestions: $suggestions,
          tags: $tags,
          attributes: $attributes,
          embedding: $embedding,
          embeddingModel: $embeddingModel,
          embeddingGeneratedAt: $embeddingGeneratedAt,
          path: $tenantSlug + '/' + $projectSlug + '/requirements/' + finalRef + '.md',
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (tenant)-[:OWNS]->(project)
        WITH tenant, project, requirement, document, section
        FOREACH (doc IN CASE WHEN document IS NOT NULL THEN [document] ELSE [] END |
          MERGE (doc)-[:CONTAINS]->(requirement)
        )
        FOREACH (proj IN CASE WHEN document IS NULL THEN [project] ELSE [] END |
          MERGE (proj)-[:CONTAINS]->(requirement)
        )
        FOREACH (sec IN CASE WHEN section IS NOT NULL THEN [section] ELSE [] END |
          MERGE (sec)-[:CONTAINS]->(requirement)
        )
        RETURN requirement
      `;

      const res = await tx.run(query, {
        tenantSlug,
        tenantName: input.tenant,
        projectSlug,
        projectKey: input.projectKey,
        hashId,
        text: input.text,
        pattern: input.pattern ?? null,
        verification: input.verification ?? null,
        rationale: input.rationale ?? null,
        complianceStatus: input.complianceStatus ?? null,
        complianceRationale: input.complianceRationale ?? null,
        contentHash,
        qaScore: input.qaScore ?? null,
        qaVerdict: input.qaVerdict ?? null,
        suggestions: input.suggestions ?? [],
        tags: input.tags ?? [],
        attributes: input.attributes ? JSON.stringify(input.attributes) : null,
        embedding: embedding,
        embeddingModel: embedding ? 'text-embedding-3-small' : null,
        embeddingGeneratedAt: embedding ? now : null,
        documentSlug: input.documentSlug ?? null,
        sectionId: input.sectionId ?? null,
        providedRef: input.ref ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create requirement node");
      }

      const node = res.records[0].get("requirement") as Neo4jNode;
      const requirement = mapRequirement(node);

      // Create initial version (v1)
      await createRequirementVersion(tx, {
        requirementId: requirement.id,
        tenantSlug,
        projectSlug,
        changedBy: input.userId || "system",
        changeType: "created",
        text: input.text,
        pattern: input.pattern ?? null,
        verification: input.verification ?? null,
        rationale: input.rationale ?? null,
        complianceStatus: input.complianceStatus ?? null,
        complianceRationale: input.complianceRationale ?? null,
        qaScore: input.qaScore ?? null,
        qaVerdict: input.qaVerdict ?? null,
        suggestions: input.suggestions ?? null,
        tags: input.tags ?? null,
        attributes: input.attributes ?? null,
        contentHash
      });

      return requirement;
    });

    // Invalidate requirement cache
    await CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug);

    // Invalidate documents cache since requirement count changed
    await CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug);

    return result;
  } finally {
    await session.close();
  }
}
