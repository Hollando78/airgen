/**
 * Requirements CRUD Routes
 *
 * Core requirement operations:
 * - Create new requirement
 * - List requirements (paginated)
 * - Get requirement by ref
 * - Update requirement
 * - Soft delete requirement
 * - Archive requirements
 * - Unarchive requirements
 */

import type { FastifyInstance } from "fastify";
import { verifyTenantAccessHook, verifyTenantAccessFromBodyHook } from "../lib/authorization.js";
import {
  createRequirement,
  listRequirements,
  countRequirements,
  getRequirement,
  updateRequirement,
  softDeleteRequirement,
  archiveRequirements,
  unarchiveRequirements
} from "../services/graph.js";
import { parsePaginationParams, createPaginatedResponse, getSkipLimit } from "../lib/pagination.js";
import {
  requirementSchema,
  tenantProjectParamsSchema,
  requirementRefParamsSchema,
  requirementIdParamsSchema,
  requirementUpdateSchema,
  requirementIdsSchema,
  requirementBodySchema,
  requirementUpdateBodySchema,
  tenantProjectParamsOpenApiSchema,
  paginationQuerySchema
} from "../schemas/requirements.js";

export async function registerCrudRoutes(app: FastifyInstance): Promise<void> {
  // Create requirement
  app.post("/requirements", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["requirements"],
      summary: "Create a new requirement",
      description: "Creates a new requirement and writes it to markdown file",
      security: [{ bearerAuth: [] }],
      body: requirementBodySchema
    }
  }, async (req, reply) => {
    const payload = requirementSchema.parse(req.body);

    const record = await createRequirement({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      sectionId: payload.sectionId,
      text: payload.text,
      pattern: payload.pattern,
      verification: payload.verification,
      qaScore: payload.qaScore,
      qaVerdict: payload.qaVerdict,
      suggestions: payload.suggestions,
      tags: payload.tags
    });

    return { requirement: record };
  });

  // List requirements
  app.get("/requirements/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "List requirements for a project",
      description: "Retrieves paginated list of requirements with optional sorting",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      querystring: paginationQuerySchema
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);

    const pagination = parsePaginationParams(req.query);

    const { skip, limit } = getSkipLimit(pagination.page, pagination.limit);
    const orderBy = (pagination.sortBy as "createdAt" | "ref" | "qaScore" | undefined) ?? "ref";
    const orderDirection = pagination.sortBy
      ? (pagination.sortOrder === "asc" ? "ASC" : "DESC")
      : "ASC";

    const [items, total] = await Promise.all([
      listRequirements(params.tenant, params.project, {
        limit,
        offset: skip,
        orderBy,
        orderDirection
      }),
      countRequirements(params.tenant, params.project)
    ]);

    return createPaginatedResponse(items, total, pagination);
  });

  // Get requirement by ref
  app.get("/requirements/:tenant/:project/:ref", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "Get a specific requirement",
      description: "Retrieves a requirement by reference with markdown content",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project", "ref"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          ref: { type: "string", description: "Requirement reference" }
        }
      }
    }
  }, async (req, reply) => {
    const params = requirementRefParamsSchema.parse(req.params);

    const record = await getRequirement(params.tenant, params.project, params.ref);
    if (!record) {
      return reply.status(404).send({ error: "Requirement not found" });
    }

    // Markdown read removed - Neo4j single-source migration (Phase 2)
    // Clients should use record.text directly
    return { record, markdown: record.text };
  });

  // Update requirement
  app.patch("/requirements/:tenant/:project/:requirementId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "Update a requirement",
      description: "Updates requirement text, pattern, or verification method",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project", "requirementId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          requirementId: { type: "string", description: "Requirement ID" }
        }
      },
      body: requirementUpdateBodySchema,
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object", additionalProperties: true }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = requirementIdParamsSchema.parse(req.params);
    const body = requirementUpdateSchema.parse(req.body);

    const requirement = await updateRequirement(params.tenant, params.project, params.requirementId, body);
    if (!requirement) {
      return reply.status(404).send({ error: "Requirement not found" });
    }
    return { requirement };
  });

  // Soft delete requirement
  app.delete("/requirements/:tenant/:project/:requirementId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "Delete a requirement",
      description: "Soft deletes a requirement (marks as deleted)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project", "requirementId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          requirementId: { type: "string", description: "Requirement ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = requirementIdParamsSchema.parse(req.params);

    // Extract user context for version history
    const deletedBy = (req as any).user?.email || (req as any).user?.sub || undefined;

    const requirement = await softDeleteRequirement(params.tenant, params.project, params.requirementId, deletedBy);
    if (!requirement) {
      return reply.status(404).send({ error: "Requirement not found" });
    }
    return { requirement };
  });

  // Archive requirements
  app.post("/requirements/:tenant/:project/archive", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "Archive requirements",
      description: "Archives one or more requirements (hides from default view)",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      body: {
        type: "object",
        required: ["requirementIds"],
        properties: {
          requirementIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Array of requirement IDs to archive"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirements: { type: "array", items: { type: "object" } },
            count: { type: "integer" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);
    const body = requirementIdsSchema.parse(req.body);

    // Extract user context for version history
    const archivedBy = (req as any).user?.email || (req as any).user?.sub || undefined;

    const requirements = await archiveRequirements(params.tenant, params.project, body.requirementIds, archivedBy);
    return { requirements, count: requirements.length };
  });

  // Unarchive requirements
  app.post("/requirements/:tenant/:project/unarchive", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["requirements"],
      summary: "Unarchive requirements",
      description: "Unarchives one or more requirements (shows in default view)",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      body: {
        type: "object",
        required: ["requirementIds"],
        properties: {
          requirementIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Array of requirement IDs to unarchive"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirements: { type: "array", items: { type: "object" } },
            count: { type: "integer" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);
    const body = requirementIdsSchema.parse(req.body);

    // Extract user context for version history
    const unarchivedBy = (req as any).user?.email || (req as any).user?.sub || undefined;

    const requirements = await unarchiveRequirements(params.tenant, params.project, body.requirementIds, unarchivedBy);
    return { requirements, count: requirements.length };
  });
}
