import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  RequirementPattern,
  VerificationMethod,
  readRequirementMarkdown,
  writeRequirementMarkdown
} from "../services/workspace.js";
import {
  createRequirement,
  listRequirements,
  getRequirement,
  updateRequirement,
  softDeleteRequirement,
  findDuplicateRequirementRefs,
  fixDuplicateRequirementRefs,
  createBaseline,
  listBaselines,
  suggestLinks
} from "../services/graph.js";

const requirementSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  text: z.string().min(10),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  qaScore: z.number().int().min(0).max(100).optional(),
  qaVerdict: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

const baselineSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  label: z.string().min(1).optional(),
  author: z.string().min(1).optional()
});

export default async function registerRequirementRoutes(app: FastifyInstance): Promise<void> {
  app.post("/requirements", async (req) => {
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

    await writeRequirementMarkdown(record);

    return { requirement: record };
  });

  app.get("/requirements/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const items = await listRequirements(params.tenant, params.project);
    return { items };
  });

  app.get("/requirements/:tenant/:project/:ref", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      ref: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const record = await getRequirement(params.tenant, params.project, params.ref);
    if (!record) return reply.status(404).send({ error: "Requirement not found" });
    let markdown: string;
    try {
      markdown = await readRequirementMarkdown({
        tenant: record.tenant,
        projectKey: record.projectKey,
        ref: record.ref
      });
    } catch (error) {
      markdown = record.text;
      (app.log as any).info?.({ err: error, ref: record.ref }, "Markdown file missing; returning raw text");
    }

    return { record, markdown };
  });

  app.patch("/requirements/:tenant/:project/:requirementId", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      requirementId: z.string().min(1)
    });
    const bodySchema = z.object({
      text: z.string().min(10).optional(),
      pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const requirement = await updateRequirement(params.tenant, params.project, params.requirementId, body);
    if (!requirement) return reply.status(404).send({ error: "Requirement not found" });
    return { requirement };
  });

  app.delete("/requirements/:tenant/:project/:requirementId", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      requirementId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const requirement = await softDeleteRequirement(params.tenant, params.project, params.requirementId);
    if (!requirement) return reply.status(404).send({ error: "Requirement not found" });
    return { requirement };
  });

  app.get("/requirements/:tenant/:project/duplicates", async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const duplicates = await findDuplicateRequirementRefs(params.tenant, params.project);
    return { duplicates };
  });

  app.post("/requirements/:tenant/:project/fix-duplicates", async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const result = await fixDuplicateRequirementRefs(params.tenant, params.project);
    return result;
  });

  app.post("/baseline", async (req) => {
    const payload = baselineSchema.parse(req.body);
    const record = await createBaseline({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      label: payload.label,
      author: payload.author
    });
    return { baseline: record };
  });

  app.get("/baselines/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const items = await listBaselines(params.tenant, params.project);
    return { items };
  });

  app.post("/link/suggest", async (req) => {
    const schema = z.object({ tenant: z.string(), project: z.string(), text: z.string().min(10) });
    const payload = schema.parse(req.body);
    const suggestions = await suggestLinks({
      tenant: payload.tenant,
      projectKey: payload.project,
      text: payload.text,
      limit: 3
    });
    return { suggestions };
  });
}
