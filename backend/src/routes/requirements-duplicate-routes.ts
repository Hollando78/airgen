/**
 * Requirements Duplicate Management Routes
 *
 * Handles duplicate requirement reference detection and fixing:
 * - Find duplicate requirement refs
 * - Automatically fix duplicate refs by renumbering
 */

import type { FastifyInstance } from "fastify";
import { requireTenantAccess, type AuthUser } from "../lib/authorization.js";
import { findDuplicateRequirementRefs, fixDuplicateRequirementRefs } from "../services/graph.js";
import { tenantProjectParamsSchema, tenantProjectParamsOpenApiSchema } from "../schemas/requirements.js";

export async function registerDuplicateRoutes(app: FastifyInstance): Promise<void> {
  // Find duplicate requirement refs
  app.get("/requirements/:tenant/:project/duplicates", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["requirements"],
      summary: "Find duplicate requirement references",
      description: "Identifies requirements with duplicate reference identifiers",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      response: {
        200: {
          type: "object",
          properties: {
            duplicates: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const duplicates = await findDuplicateRequirementRefs(params.tenant, params.project);
    return { duplicates };
  });

  // Fix duplicate requirement refs
  app.post("/requirements/:tenant/:project/fix-duplicates", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["requirements"],
      summary: "Fix duplicate requirement references",
      description: "Automatically renumbers duplicate requirement references",
      security: [{ bearerAuth: [] }],
      params: tenantProjectParamsOpenApiSchema,
      response: {
        200: {
          type: "object",
          properties: {
            fixed: { type: "integer" },
            results: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req, reply) => {
    const params = tenantProjectParamsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const result = await fixDuplicateRequirementRefs(params.tenant, params.project);
    return result;
  });
}
