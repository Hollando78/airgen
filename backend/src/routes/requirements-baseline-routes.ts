/**
 * Requirements Baseline Routes
 *
 * Baseline snapshot management:
 * - Create baseline snapshots
 * - List project baselines
 * - Get baseline details with version snapshots
 * - Compare two baselines
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyTenantAccessHook, verifyTenantAccessFromBodyHook } from "../lib/authorization.js";
import { createBaseline, listBaselines } from "../services/graph.js";
import { getBaselineDetails, compareBaselines, deleteBaseline } from "../services/graph/requirement-baselines.js";
import { baselineSchema, tenantProjectParamsSchema, tenantProjectParamsOpenApiSchema } from "../schemas/requirements.js";

export async function registerBaselineRoutes(app: FastifyInstance): Promise<void> {
  // Create baseline
  app.post("/baseline", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["baselines"],
      summary: "Create a new baseline",
      description: "Creates a snapshot baseline of current requirements",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["tenant", "projectKey"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          label: { type: "string", minLength: 1, description: "Baseline label" },
          author: { type: "string", minLength: 1, description: "Baseline author" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            baseline: { type: "object", additionalProperties: true }
          }
        }
      }
    }
  }, async (req, reply) => {
    const payload = baselineSchema.parse(req.body);

    const record = await createBaseline({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      label: payload.label,
      author: payload.author
    });
    return { baseline: record };
  });

  // List baselines
  app.get("/baselines/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["baselines"],
      summary: "List baselines for a project",
      description: "Retrieves all baselines for a project",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema
      // Response schema removed - let Fastify infer from actual data
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);

    const items = await listBaselines(params.tenant, params.project);
    return { items };
  });

  // Get baseline details
  app.get("/baselines/:tenant/:project/:baselineRef", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["baselines"],
      summary: "Get baseline details with version snapshots",
      description: "Retrieves complete baseline snapshot including all version data",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project", "baselineRef"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          baselineRef: { type: "string", description: "Baseline reference" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            baseline: { type: "object", additionalProperties: true },
            requirementVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            documentVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            documentSectionVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            infoVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            surrogateReferenceVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            traceLinkVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            linksetVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            diagramVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            blockVersions: { type: "array", items: { type: "object", additionalProperties: true } },
            connectorVersions: { type: "array", items: { type: "object", additionalProperties: true } }
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
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      baselineRef: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      const snapshot = await getBaselineDetails(params.tenant, params.project, params.baselineRef);
      return snapshot;
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  // Delete baseline
  app.delete("/baselines/:tenant/:project/:baselineRef", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["baselines"],
      summary: "Delete a baseline",
      description: "Deletes a baseline and all its snapshot relationships",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project", "baselineRef"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          baselineRef: { type: "string", description: "Baseline reference" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            deleted: { type: "boolean" }
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
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      baselineRef: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      const result = await deleteBaseline(params.tenant, params.project, params.baselineRef);
      return result;
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  // Compare baselines
  app.get("/baselines/:tenant/:project/compare", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: {
      tags: ["baselines"],
      summary: "Compare two baselines",
      description: "Compares two baselines and returns differences across all entity types",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      querystring: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "string", description: "Source baseline reference" },
          to: { type: "string", description: "Target baseline reference" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            fromBaseline: { type: "object", additionalProperties: true },
            toBaseline: { type: "object", additionalProperties: true },
            requirements: { type: "object", additionalProperties: true },
            documents: { type: "object", additionalProperties: true },
            documentSections: { type: "object", additionalProperties: true },
            infos: { type: "object", additionalProperties: true },
            surrogateReferences: { type: "object", additionalProperties: true },
            traceLinks: { type: "object", additionalProperties: true },
            linksets: { type: "object", additionalProperties: true },
            diagrams: { type: "object", additionalProperties: true },
            blocks: { type: "object", additionalProperties: true },
            connectors: { type: "object", additionalProperties: true }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
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
    const querySchema = z.object({
      from: z.string().min(1),
      to: z.string().min(1)
    });

    try {
      const params = tenantProjectParamsSchema.parse(req.params);
      const query = querySchema.parse(req.query);

      if (query.from === query.to) {
        return reply.status(400).send({ error: "Source and target baselines must be different" });
      }

      const comparison = await compareBaselines(params.tenant, params.project, query.from, query.to);
      return comparison;
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });
}
