import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createTraceLink,
  listTraceLinks,
  listTraceLinksByRequirement,
  deleteTraceLink
} from "../services/graph.js";

const traceLinkSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  sourceRequirementId: z.string().min(1),
  targetRequirementId: z.string().min(1),
  linkType: z.enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"]),
  description: z.string().optional()
});

export default async function registerTraceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/trace-links", {
    schema: {
      tags: ["traceability"],
      summary: "Create a trace link",
      description: "Creates a traceability link between two requirements",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "sourceRequirementId", "targetRequirementId", "linkType"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          sourceRequirementId: { type: "string", minLength: 1, description: "Source requirement ID" },
          targetRequirementId: { type: "string", minLength: 1, description: "Target requirement ID" },
          linkType: {
            type: "string",
            enum: ["satisfies", "derives", "verifies", "implements", "refines", "conflicts"],
            description: "Type of trace link"
          },
          description: { type: "string", description: "Optional description of the link" }
        }
      }
    }
  }, async (req) => {
    const payload = traceLinkSchema.parse(req.body);

    const traceLink = await createTraceLink({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      sourceRequirementId: payload.sourceRequirementId,
      targetRequirementId: payload.targetRequirementId,
      linkType: payload.linkType,
      description: payload.description
    });

    return { traceLink };
  });

  app.get("/trace-links/:tenant/:project", {
    schema: {
      tags: ["traceability"],
      summary: "List all trace links for a project",
      description: "Retrieves all traceability links for a project",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    const traceLinks = await listTraceLinks({
      tenant: params.tenant,
      projectKey: params.project
    });

    return { traceLinks };
  });

  app.get("/trace-links/:tenant/:project/:requirementId", {
    schema: {
      tags: ["traceability"],
      summary: "List trace links for a requirement",
      description: "Retrieves all traceability links connected to a specific requirement",
      params: {
        type: "object",
        required: ["tenant", "project", "requirementId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          requirementId: { type: "string", description: "Requirement ID" }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      requirementId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const traceLinks = await listTraceLinksByRequirement({
      tenant: params.tenant,
      projectKey: params.project,
      requirementId: params.requirementId
    });

    return { traceLinks };
  });

  app.delete("/trace-links/:tenant/:project/:linkId", {
    schema: {
      tags: ["traceability"],
      summary: "Delete a trace link",
      description: "Deletes a traceability link",
      params: {
        type: "object",
        required: ["tenant", "project", "linkId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          linkId: { type: "string", description: "Trace link ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
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
      linkId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      await deleteTraceLink({
        tenant: params.tenant,
        projectKey: params.project,
        linkId: params.linkId
      });

      return { success: true };
    } catch (error) {
      if ((error as Error).message === "Trace link not found") {
        return reply.status(404).send({ error: "Trace link not found" });
      }
      throw error;
    }
  });
}
