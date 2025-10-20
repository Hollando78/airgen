/**
 * Requirements Version History Routes
 *
 * Version history and time-travel operations:
 * - Get version history for a requirement
 * - Get diff between two versions
 * - Restore requirement to a previous version
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireTenantAccess, type AuthUser } from "../lib/authorization.js";
import { updateRequirement } from "../services/graph.js";
import { getRequirementHistory, getRequirementDiff } from "../services/graph/requirements/requirements-versions.js";

export async function registerVersionRoutes(app: FastifyInstance): Promise<void> {
  // Get requirement version history
  app.get("/requirements/:tenant/:project/:id/history", {
    schema: {
      tags: ["requirements"],
      summary: "Get requirement version history",
      description: "Retrieves the complete version history for a requirement",
      params: {
        type: "object",
        required: ["tenant", "project", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            history: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  versionId: { type: "string" },
                  requirementId: { type: "string" },
                  versionNumber: { type: "integer" },
                  timestamp: { type: "string" },
                  changedBy: { type: "string" },
                  changeType: { type: "string", enum: ["created", "updated", "archived", "restored", "deleted"] },
                  changeDescription: { type: "string" },
                  text: { type: "string" },
                  contentHash: { type: "string" }
                }
              }
            }
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
      id: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const history = await getRequirementHistory(params.tenant, params.project, params.id);
      return { history };
    } catch (error: any) {
      return reply.status(404).send({ error: error.message || "Requirement not found" });
    }
  });

  // Get diff between requirement versions
  app.get("/requirements/:tenant/:project/:id/diff", {
    schema: {
      tags: ["requirements"],
      summary: "Get diff between requirement versions",
      description: "Compares two versions of a requirement and returns field-level differences",
      params: {
        type: "object",
        required: ["tenant", "project", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" }
        }
      },
      querystring: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "integer", minimum: 1, description: "Source version number" },
          to: { type: "integer", minimum: 1, description: "Target version number" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            diff: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  oldValue: {},
                  newValue: {},
                  changed: { type: "boolean" }
                }
              }
            }
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
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      id: z.string().min(1)
    });
    const querySchema = z.object({
      from: z.coerce.number().int().min(1),
      to: z.coerce.number().int().min(1)
    });

    try {
      const params = paramsSchema.parse(req.params);
      const query = querySchema.parse(req.query);

      // Verify tenant access
      requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

      if (query.from === query.to) {
        return reply.status(400).send({ error: "Source and target versions must be different" });
      }

      const diff = await getRequirementDiff(params.tenant, params.project, params.id, query.from, query.to);
      return { diff };
    } catch (error: any) {
      if (error.message === "Version not found") {
        return reply.status(404).send({ error: "One or both versions not found" });
      }
      return reply.status(400).send({ error: error.message || "Invalid request" });
    }
  });

  // Restore requirement to previous version
  app.post("/requirements/:tenant/:project/:id/restore/:versionNumber", {
    schema: {
      tags: ["requirements"],
      summary: "Restore requirement to previous version",
      description: "Restores a requirement to a specific previous version, creating a new version in the history",
      params: {
        type: "object",
        required: ["tenant", "project", "id", "versionNumber"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" },
          versionNumber: { type: "integer", minimum: 1, description: "Version number to restore" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" },
            restoredFrom: { type: "integer" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
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
      id: z.string().min(1),
      versionNumber: z.coerce.number().int().min(1)
    });

    try {
      const params = paramsSchema.parse(req.params);

      // Verify tenant access
      requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

      // Get the version history to find the target version
      const history = await getRequirementHistory(params.tenant, params.project, params.id);
      const targetVersion = history.find(v => v.versionNumber === params.versionNumber);

      if (!targetVersion) {
        return reply.status(404).send({ error: `Version ${params.versionNumber} not found` });
      }

      // Extract user from request (assuming JWT auth middleware adds user to request)
      const userId = (req as any).user?.email || (req as any).user?.sub || "system";

      // Restore by updating with the old version's values
      const requirement = await updateRequirement(
        params.tenant,
        params.project,
        params.id,
        {
          text: targetVersion.text,
          pattern: targetVersion.pattern,
          verification: targetVersion.verification,
          rationale: targetVersion.rationale,
          complianceStatus: targetVersion.complianceStatus as "N/A" | "Compliant" | "Compliance Risk" | "Non-Compliant" | undefined,
          complianceRationale: targetVersion.complianceRationale,
          tags: targetVersion.tags,
          attributes: targetVersion.attributes,
          userId
        }
      );

      if (!requirement) {
        return reply.status(404).send({ error: "Requirement not found" });
      }

      return {
        requirement,
        restoredFrom: params.versionNumber
      };
    } catch (error: any) {
      // Catch-all for unexpected errors
      app.log.error(error);
      return reply.status(500).send({ error: error.message || "Failed to restore version" });
    }
  });
}
