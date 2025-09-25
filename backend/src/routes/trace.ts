import { FastifyInstance } from "fastify";
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
  app.post("/trace-links", async (req) => {
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

  app.get("/trace-links/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    const traceLinks = await listTraceLinks({
      tenant: params.tenant,
      projectKey: params.project
    });

    return { traceLinks };
  });

  app.get("/trace-links/:tenant/:project/:requirementId", async (req) => {
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

  app.delete("/trace-links/:tenant/:project/:linkId", async (req, reply) => {
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
