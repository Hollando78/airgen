import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { hasDrift } from "../lib/requirement-hash.js";
import {
  listRequirements,
  restoreRequirement,
  softDeleteRequirement,
  getRequirement
} from "../services/graph/requirements/index.js";
import { writeRequirementMarkdown, readRequirementMarkdown } from "../services/workspace.js";
import { logger } from "../lib/logger.js";

/**
 * Admin routes for requirements management
 * - List deleted/archived requirements
 * - Restore deleted requirements
 * - Detect drift between Neo4j and markdown
 * - Force sync requirements
 */
export async function adminRequirementsRoutes(app: FastifyInstance) {
  /**
   * List deleted requirements
   */
  app.get(
    "/admin/requirements/deleted",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant: string;
          project: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, limit, offset } = req.query;

      if (!tenant || !project) {
        return reply.code(400).send({
          error: "tenant and project are required"
        });
      }

      // listRequirements only returns non-deleted, non-archived requirements
      // We need to query Neo4j directly for deleted requirements
      const tenantSlug = tenant.toLowerCase().replace(/\s+/g, "-");
      const projectSlug = project.toLowerCase().replace(/\s+/g, "-");

      const session = (await import("../services/graph/driver.js")).getSession();
      try {
        const result = await session.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(newReq:Requirement)
            WHERE newReq.deleted = true
            OPTIONAL MATCH (project)-[:CONTAINS]->(oldReq:Requirement)
            WHERE oldReq.deleted = true
            WITH collect(DISTINCT newReq) + collect(DISTINCT oldReq) AS reqs
            UNWIND reqs AS requirement
            WITH DISTINCT requirement
            WHERE requirement IS NOT NULL
            RETURN requirement
            ORDER BY requirement.ref ASC
            SKIP $offset
            LIMIT $limit
          `,
          {
            tenantSlug,
            projectSlug,
            offset: (await import("neo4j-driver")).int(offset ? parseInt(offset, 10) : 0),
            limit: (await import("neo4j-driver")).int(limit ? parseInt(limit, 10) : 100)
          }
        );

        const { mapRequirement } = await import("../services/graph/requirements/requirements-crud.js");
        const requirements = result.records.map(record => {
          const node = record.get("requirement");
          return mapRequirement(node);
        });

        return reply.send({
          requirements,
          count: requirements.length
        });
      } finally {
        await session.close();
      }
    }
  );

  /**
   * List archived requirements
   */
  app.get(
    "/admin/requirements/archived",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant: string;
          project: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, limit, offset } = req.query;

      if (!tenant || !project) {
        return reply.code(400).send({
          error: "tenant and project are required"
        });
      }

      // listRequirements only returns non-deleted, non-archived requirements
      // We need to query Neo4j directly for archived requirements
      const tenantSlug = tenant.toLowerCase().replace(/\s+/g, "-");
      const projectSlug = project.toLowerCase().replace(/\s+/g, "-");

      const session = (await import("../services/graph/driver.js")).getSession();
      try {
        const result = await session.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(newReq:Requirement)
            WHERE (newReq.deleted IS NULL OR newReq.deleted = false)
              AND newReq.archived = true
            OPTIONAL MATCH (project)-[:CONTAINS]->(oldReq:Requirement)
            WHERE (oldReq.deleted IS NULL OR oldReq.deleted = false)
              AND oldReq.archived = true
            WITH collect(DISTINCT newReq) + collect(DISTINCT oldReq) AS reqs
            UNWIND reqs AS requirement
            WITH DISTINCT requirement
            WHERE requirement IS NOT NULL
            RETURN requirement
            ORDER BY requirement.ref ASC
            SKIP $offset
            LIMIT $limit
          `,
          {
            tenantSlug,
            projectSlug,
            offset: (await import("neo4j-driver")).int(offset ? parseInt(offset, 10) : 0),
            limit: (await import("neo4j-driver")).int(limit ? parseInt(limit, 10) : 100)
          }
        );

        const { mapRequirement } = await import("../services/graph/requirements/requirements-crud.js");
        const requirements = result.records.map(record => {
          const node = record.get("requirement");
          return mapRequirement(node);
        });

        return reply.send({
          requirements,
          count: requirements.length
        });
      } finally {
        await session.close();
      }
    }
  );

  /**
   * Restore a deleted requirement
   */
  app.post(
    "/admin/requirements/:tenant/:project/:requirementId/restore",
    async (
      req: FastifyRequest<{
        Params: {
          tenant: string;
          project: string;
          requirementId: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, requirementId } = req.params;

      try {
        const requirement = await restoreRequirement(tenant, project, requirementId);

        if (!requirement) {
          return reply.code(404).send({
            error: "Requirement not found or not deleted"
          });
        }

        return reply.send({
          message: "Requirement restored successfully",
          requirement
        });
      } catch (error) {
        logger.error({ error, tenant, project, requirementId }, "Failed to restore requirement");
        return reply.code(500).send({
          error: "Failed to restore requirement"
        });
      }
    }
  );

  /**
   * Permanently delete a soft-deleted requirement
   */
  app.delete(
    "/admin/requirements/:tenant/:project/:requirementId/purge",
    async (
      req: FastifyRequest<{
        Params: {
          tenant: string;
          project: string;
          requirementId: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, requirementId } = req.params;

      try {
        const requirement = await getRequirement(tenant, project, requirementId);

        if (!requirement) {
          return reply.code(404).send({
            error: "Requirement not found"
          });
        }

        if (!requirement.deleted) {
          return reply.code(400).send({
            error: "Requirement must be soft-deleted before purging"
          });
        }

        // TODO: Implement hard delete function
        return reply.code(501).send({
          error: "Permanent deletion not yet implemented"
        });
      } catch (error) {
        logger.error({ error, tenant, project, requirementId }, "Failed to purge requirement");
        return reply.code(500).send({
          error: "Failed to purge requirement"
        });
      }
    }
  );

  /**
   * Detect drift between Neo4j and markdown files
   */
  app.get(
    "/admin/requirements/drift",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant: string;
          project: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project } = req.query;

      if (!tenant || !project) {
        return reply.code(400).send({
          error: "tenant and project are required"
        });
      }

      try {
        const requirements = await listRequirements(tenant, project, { limit: 10000 });

        const driftedRequirements = requirements.filter(req => hasDrift(req));

        return reply.send({
          drifted: driftedRequirements,
          count: driftedRequirements.length,
          total: requirements.length
        });
      } catch (error) {
        logger.error({ error, tenant, project }, "Failed to detect drift");
        return reply.code(500).send({
          error: "Failed to detect drift"
        });
      }
    }
  );

  /**
   * List requirements with broken trace links
   */
  app.get(
    "/admin/requirements/bad-links",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant: string;
          project: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, limit, offset } = req.query;

      if (!tenant || !project) {
        return reply.code(400).send({
          error: "tenant and project are required"
        });
      }

      const tenantSlug = tenant.toLowerCase().replace(/\s+/g, "-");
      const projectSlug = project.toLowerCase().replace(/\s+/g, "-");

      const session = (await import("../services/graph/driver.js")).getSession();
      try {
        // Find all requirements that have trace links pointing to deleted/archived requirements
        // or that have trace links where the target requirement doesn't exist or duplicates
        const result = await session.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})

            // Get all requirements from new structure (with sections) and old structure (direct)
            OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(newReq:Requirement)
            WHERE (newReq.deleted IS NULL OR newReq.deleted = false)
              AND (newReq.archived IS NULL OR newReq.archived = false)

            OPTIONAL MATCH (project)-[:CONTAINS]->(oldReq:Requirement)
            WHERE (oldReq.deleted IS NULL OR oldReq.deleted = false)
              AND (oldReq.archived IS NULL OR oldReq.archived = false)

            WITH collect(DISTINCT newReq) + collect(DISTINCT oldReq) AS reqs
            UNWIND reqs AS requirement
            WITH DISTINCT requirement
            WHERE requirement IS NOT NULL

            // Find trace links from or to this requirement
            OPTIONAL MATCH (project)-[:HAS_TRACE_LINK]->(traceLink:TraceLink)
            WHERE traceLink.sourceRequirementId = requirement.id OR traceLink.targetRequirementId = requirement.id

            // Get the target requirement for this trace link
            OPTIONAL MATCH (traceLink)-[:TO_REQUIREMENT]->(toReq:Requirement)
            WHERE traceLink.sourceRequirementId = requirement.id

            // Get the source requirement for this trace link (when requirement is the target)
            OPTIONAL MATCH (traceLink)-[:FROM_REQUIREMENT]->(fromReq:Requirement)
            WHERE traceLink.targetRequirementId = requirement.id

            // Check if links are broken or duplicate
            WITH requirement,
                 [link IN collect({
                   link: traceLink,
                   linkId: traceLink.id,
                   linkType: traceLink.linkType,
                   targetId: CASE
                     WHEN traceLink.sourceRequirementId = requirement.id THEN traceLink.targetRequirementId
                     ELSE traceLink.sourceRequirementId
                   END,
                   linkedReq: CASE
                     WHEN traceLink.sourceRequirementId = requirement.id THEN toReq
                     ELSE fromReq
                   END,
                   isBroken: traceLink IS NOT NULL AND (
                     (traceLink.sourceRequirementId = requirement.id AND (toReq IS NULL OR toReq.deleted = true OR toReq.archived = true)) OR
                     (traceLink.targetRequirementId = requirement.id AND (fromReq IS NULL OR fromReq.deleted = true OR fromReq.archived = true))
                   )
                 }) WHERE link.linkId IS NOT NULL] AS links

            // Find duplicate links (multiple links to the same target with same link type)
            WITH requirement, links,
                 [l IN links WHERE l.isBroken] AS brokenLinks

            // Get all unique target+linkType combinations
            UNWIND links AS link
            WITH requirement, links, brokenLinks, link.targetId + '::' + link.linkType AS combo
            WITH requirement, links, brokenLinks, combo, count(*) AS comboCount
            WHERE comboCount > 1
            WITH requirement, links, brokenLinks, collect(combo) AS duplicateCombos

            // Get the IDs of duplicate links (keep first, mark rest as bad)
            WITH requirement, links, brokenLinks, duplicateCombos,
                 [l IN links WHERE l.targetId + '::' + l.linkType IN duplicateCombos] AS duplicateLinkGroups

            // Build list of all bad links with metadata
            WITH requirement, brokenLinks, duplicateLinkGroups, duplicateCombos,
                 // Mark broken links
                 [l IN brokenLinks | {linkId: l.linkId, type: 'broken'}] +
                 // Mark duplicate links (keep first of each group, remove rest)
                 reduce(duplicates = [], combo IN duplicateCombos |
                   duplicates + [dl IN tail([l IN duplicateLinkGroups WHERE l.targetId + '::' + l.linkType = combo]) | {linkId: dl.linkId, type: 'duplicate'}]
                 ) AS allBadLinksWithType

            // Only return requirements that have at least one bad link (broken or duplicate)
            WHERE size(allBadLinksWithType) > 0

            RETURN requirement,
                   size(allBadLinksWithType) AS brokenLinkCount,
                   [l IN allBadLinksWithType | l.linkId] AS brokenLinkIds,
                   allBadLinksWithType AS brokenLinksMetadata
            ORDER BY requirement.ref ASC
            SKIP $offset
            LIMIT $limit
          `,
          {
            tenantSlug,
            projectSlug,
            offset: (await import("neo4j-driver")).int(offset ? parseInt(offset, 10) : 0),
            limit: (await import("neo4j-driver")).int(limit ? parseInt(limit, 10) : 100)
          }
        );

        const { mapRequirement } = await import("../services/graph/requirements/requirements-crud.js");
        const requirements = result.records.map(record => {
          const node = record.get("requirement");
          const brokenLinkCount = record.get("brokenLinkCount");
          const brokenLinkIds = record.get("brokenLinkIds");
          const brokenLinksMetadata = record.get("brokenLinksMetadata");
          const req = mapRequirement(node);
          return {
            ...req,
            brokenLinkCount: brokenLinkCount ? Number(brokenLinkCount.toInt()) : 0,
            brokenLinkIds: brokenLinkIds || [],
            brokenLinksMetadata: brokenLinksMetadata || []
          };
        });

        return reply.send({
          requirements,
          count: requirements.length
        });
      } finally {
        await session.close();
      }
    }
  );

  /**
   * Force sync requirement from Neo4j to markdown
   */
  app.post(
    "/admin/requirements/:tenant/:project/:requirementId/sync-to-markdown",
    async (
      req: FastifyRequest<{
        Params: {
          tenant: string;
          project: string;
          requirementId: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, requirementId } = req.params;

      try {
        const requirement = await getRequirement(tenant, project, requirementId);

        if (!requirement) {
          return reply.code(404).send({
            error: "Requirement not found"
          });
        }

        await writeRequirementMarkdown(requirement);

        return reply.send({
          message: "Requirement synced to markdown successfully",
          requirement
        });
      } catch (error) {
        logger.error({ error, tenant, project, requirementId }, "Failed to sync to markdown");
        return reply.code(500).send({
          error: "Failed to sync to markdown"
        });
      }
    }
  );

  /**
   * Bulk restore deleted requirements
   */
  app.post(
    "/admin/requirements/bulk-restore",
    async (
      req: FastifyRequest<{
        Body: {
          tenant: string;
          project: string;
          requirementIds: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, requirementIds } = req.body;

      if (!tenant || !project || !requirementIds || !Array.isArray(requirementIds)) {
        return reply.code(400).send({
          error: "tenant, project, and requirementIds array are required"
        });
      }

      const results = {
        restored: [] as string[],
        failed: [] as { id: string; error: string }[]
      };

      for (const requirementId of requirementIds) {
        try {
          const requirement = await restoreRequirement(tenant, project, requirementId);
          if (requirement) {
            results.restored.push(requirementId);
          } else {
            results.failed.push({
              id: requirementId,
              error: "Requirement not found or not deleted"
            });
          }
        } catch (error) {
          results.failed.push({
            id: requirementId,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      return reply.send({
        message: `Restored ${results.restored.length} of ${requirementIds.length} requirements`,
        results
      });
    }
  );

  /**
   * List all requirement candidates (admin view)
   */
  app.get(
    "/admin/requirements/candidates",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant: string;
          project: string;
          status?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { tenant, project, status, limit, offset } = req.query;

      if (!tenant || !project) {
        return reply.code(400).send({
          error: "tenant and project are required"
        });
      }

      const tenantSlug = tenant.toLowerCase().replace(/\s+/g, "-");
      const projectSlug = project.toLowerCase().replace(/\s+/g, "-");

      const session = (await import("../services/graph/driver.js")).getSession();
      try {
        const statusFilter = status ? `AND candidate.status = $status` : "";

        const result = await session.run(
          `
            MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_CANDIDATE]->(candidate:RequirementCandidate)
            WHERE 1=1 ${statusFilter}
            OPTIONAL MATCH (candidate)-[:LINKED_TO]->(req:Requirement)
            RETURN candidate, req
            ORDER BY candidate.createdAt DESC
            SKIP $offset
            LIMIT $limit
          `,
          {
            tenantSlug,
            projectSlug,
            status: status || null,
            offset: (await import("neo4j-driver")).int(offset ? parseInt(offset, 10) : 0),
            limit: (await import("neo4j-driver")).int(limit ? parseInt(limit, 10) : 100)
          }
        );

        const { mapRequirementCandidate } = await import("../services/graph/requirement-candidates.js");
        const candidates = result.records.map(record => {
          const node = record.get("candidate");
          return mapRequirementCandidate(node);
        });

        return reply.send({
          candidates,
          count: candidates.length
        });
      } finally {
        await session.close();
      }
    }
  );

  /**
   * Bulk delete requirement candidates
   */
  app.post(
    "/admin/requirements/candidates/bulk-delete",
    async (
      req: FastifyRequest<{
        Body: {
          candidateIds: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { candidateIds } = req.body;

      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        return reply.code(400).send({
          error: "candidateIds array is required and must not be empty"
        });
      }

      try {
        const { bulkDeleteCandidates } = await import("../services/graph/requirement-candidates.js");
        const result = await bulkDeleteCandidates(candidateIds);

        return reply.send({
          message: `Deleted ${result.deleted} of ${candidateIds.length} candidates`,
          deleted: result.deleted
        });
      } catch (error) {
        logger.error({ error, candidateIds }, "Failed to bulk delete candidates");
        return reply.code(500).send({
          error: "Failed to delete candidates"
        });
      }
    }
  );

  /**
   * Bulk reset requirement candidates to pending status
   */
  app.post(
    "/admin/requirements/candidates/bulk-reset",
    async (
      req: FastifyRequest<{
        Body: {
          candidateIds: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const { candidateIds } = req.body;

      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        return reply.code(400).send({
          error: "candidateIds array is required and must not be empty"
        });
      }

      try {
        const { bulkResetCandidates } = await import("../services/graph/requirement-candidates.js");
        const result = await bulkResetCandidates(candidateIds);

        return reply.send({
          message: `Reset ${result.reset} of ${candidateIds.length} candidates to pending status`,
          reset: result.reset
        });
      } catch (error) {
        logger.error({ error, candidateIds }, "Failed to bulk reset candidates");
        return reply.code(500).send({
          error: "Failed to reset candidates"
        });
      }
    }
  );
}
