import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { analyzeRequirement, AMBIGUOUS } from "@airgen/req-qa";
import { z } from "zod";
import { config } from "./config.js";
import {
  ensureWorkspace,
  RequirementPattern,
  VerificationMethod,
  readRequirementMarkdown,
  writeRequirementMarkdown
} from "./services/workspace.js";
import {
  initGraph,
  closeGraph,
  createRequirement,
  listRequirements,
  getRequirement,
  createBaseline,
  suggestLinks
} from "./services/graph.js";
import { generateDrafts } from "./services/drafts.js";
import { generateLlmDrafts, isLlmConfigured } from "./services/llm.js";

await ensureWorkspace();
await initGraph();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(jwt, { secret: config.jwtSecret });

app.addHook("onClose", async () => {
  await closeGraph();
});

type DraftBody = {
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

const requirementSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  title: z.string().min(3),
  text: z.string().min(10),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  qaScore: z.number().int().min(0).max(100).optional(),
  qaVerdict: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

const baselineSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  label: z.string().min(1).optional(),
  author: z.string().min(1).optional()
});

app.get("/health", async () => ({
  ok: true,
  env: config.environment,
  workspace: config.workspaceRoot,
  time: new Date().toISOString()
}));

app.post("/qa", async (req) => {
  const schema = z.object({ text: z.string().min(1) });
  const body = schema.parse(req.body);
  return analyzeRequirement(body.text);
});

app.post<{ Body: DraftBody }>("/draft", async (req) => {
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

app.post("/apply-fix", async (req) => {
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

app.post("/requirements", async (req) => {
  const payload = requirementSchema.parse(req.body);
  const record = await createRequirement({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    title: payload.title,
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

const port = config.port;
app.listen({ port, host: config.host }).catch((e) => {
  (app.log as any).error?.(e);
  process.exit(1);
});
