import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement, AMBIGUOUS } from "@airgen/req-qa";
import { config } from "../config.js";
import {
  RequirementPattern,
  VerificationMethod
} from "../services/workspace.js";
import {
  listTenants,
  listProjects,
  createTenant,
  createProject,
  deleteTenant,
  deleteProject
} from "../services/graph.js";
import { generateDrafts } from "../services/drafts.js";
import { generateLlmDrafts, isLlmConfigured } from "../services/llm.js";

export type DraftBody = {
  need: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  count?: number;
  actor?: string;
  system?: string;
  trigger?: string;
  response?: string;
  constraint?: string;
  useLlm?: boolean;
};

const draftSchema = z.object({
  need: z.string().min(12, "Provide need context (≥12 characters)."),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  count: z.number().int().min(1).max(config.draftsPerRequestLimit).optional(),
  actor: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  response: z.string().min(1).optional(),
  constraint: z.string().min(1).optional(),
  useLlm: z.boolean().optional()
});

export default async function registerCoreRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    env: config.environment,
    workspace: config.workspaceRoot,
    time: new Date().toISOString()
  }));

  app.get("/tenants", { preHandler: [app.authenticate] }, async () => {
    const tenants = await listTenants();
    return { tenants };
  });

  app.get("/tenants/:tenant/projects", { preHandler: [app.authenticate] }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const projects = await listProjects(params.tenant);
    return { projects };
  });

  // Admin-only tenant management endpoints
  app.post("/tenants", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }
    
    const schema = z.object({
      slug: z.string().min(1),
      name: z.string().optional()
    });
    const body = schema.parse(req.body);
    
    try {
      const tenant = await createTenant(body);
      return { tenant };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.delete("/tenants/:tenant", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }
    
    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    
    const success = await deleteTenant(params.tenant);
    if (!success) {
      return reply.status(404).send({ error: "Tenant not found" });
    }
    
    return { success: true };
  });

  // Admin-only project management endpoints
  app.post("/tenants/:tenant/projects", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }
    
    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    
    const schema = z.object({
      slug: z.string().min(1),
      key: z.string().optional()
    });
    const body = schema.parse(req.body);
    
    try {
      const project = await createProject({
        tenantSlug: params.tenant,
        slug: body.slug,
        key: body.key
      });
      return { project };
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }
  });

  app.delete("/tenants/:tenant/projects/:project", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }
    
    const paramsSchema = z.object({ 
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    
    const success = await deleteProject(params.tenant, params.project);
    if (!success) {
      return reply.status(404).send({ error: "Project not found" });
    }
    
    return { success: true };
  });

  app.post("/qa", { preHandler: [app.authenticate] }, async (req) => {
    const schema = z.object({ text: z.string().min(1) });
    const body = schema.parse(req.body);
    return analyzeRequirement(body.text);
  });

  app.post<{ Body: DraftBody }>("/draft", { preHandler: [app.authenticate] }, async (req) => {
    const body = draftSchema.parse(req.body);
    const heuristicDrafts = generateDrafts(body);
    let llmDrafts: typeof heuristicDrafts = [];
    let llmError: string | undefined;

    if (body.useLlm) {
      if (!isLlmConfigured()) {
        llmError = "LLM provider not configured";
      } else {
        try {
          llmDrafts = await generateLlmDrafts(body);
        } catch (error) {
          llmError = (error as Error).message;
          (app.log as any).error?.({ err: error }, "LLM draft generation failed");
        }
      }
    }

    return {
      items: [...llmDrafts, ...heuristicDrafts],
      meta: {
        heuristics: heuristicDrafts.length,
        llm: {
          requested: Boolean(body.useLlm),
          provided: llmDrafts.length,
          error: llmError
        }
      }
    };
  });

  app.post("/apply-fix", { preHandler: [app.authenticate] }, async (req) => {
    const schema = z.object({ text: z.string().min(1) });
    const { text } = schema.parse(req.body);
    const lower = text.toLowerCase();
    const hits = AMBIGUOUS.filter(word => lower.includes(word));
    let replacement = text;
    const notes: string[] = [];

    if (hits.length) {
      for (const word of hits) {
        const pattern = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
        replacement = replacement.replace(pattern, `${word.toUpperCase()} [DEFINE]`);
        notes.push(`Flagged ambiguous phrase '${word}'.`);
      }
    }

    if (!/\bshall\b/i.test(replacement)) {
      replacement = replacement.replace(/\b(will|should|may|can)\b/i, "shall");
      notes.push("Replaced weak modal with 'shall'.");
    }

    if (!/\b(ms|s|kg|m|bar|v|a|hz|%)\b/i.test(replacement)) {
      notes.push("Consider adding measurable units (e.g. ms, bar, %).");
    }

    return { before: text, after: replacement, notes };
  });
}
