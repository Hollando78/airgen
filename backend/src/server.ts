import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
  suggestLinks,
  listTenants,
  listProjects,
  listBaselines,
  createDocument,
  updateDocument,
  listDocuments,
  getDocument,
  updateDocumentFolder,
  softDeleteDocument,
  softDeleteFolder,
  createFolder,
  listFolders,
  createDocumentSection,
  listDocumentSections,
  updateDocumentSection,
  deleteDocumentSection,
  listSectionRequirements,
  updateFolder,
  updateRequirement,
  softDeleteRequirement,
  findDuplicateRequirementRefs,
  fixDuplicateRequirementRefs,
  createArchitectureBlock,
  getArchitectureBlocks,
  updateArchitectureBlock,
  deleteArchitectureBlock,
  createArchitectureConnector,
  getArchitectureConnectors,
  deleteArchitectureConnector,
  createTraceLink,
  listTraceLinks,
  listTraceLinksByRequirement,
  deleteTraceLink
} from "./services/graph.js";
import { generateDrafts } from "./services/drafts.js";
import { generateLlmDrafts, isLlmConfigured } from "./services/llm.js";
import { registerAuth } from "./plugins/auth.js";
import draftRoutes from "./routes/draft.js";
import airgenRoutes from "./routes/airgen.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

await ensureWorkspace();
await initGraph();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(fastifyStatic, {
  root: join(__dirname, "../public"),
  prefix: "/"
});
await registerAuth(app);

app.addHook("onRequest", app.optionalAuthenticate);

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
  documentSlug: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
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

const documentSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  parentFolder: z.string().optional()
});

const folderSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

const documentSectionSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  order: z.number().int().min(0)
});

const architectureBlockSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"]),
  stereotype: z.string().optional(),
  description: z.string().optional(),
  positionX: z.number(),
  positionY: z.number(),
  sizeWidth: z.number().optional(),
  sizeHeight: z.number().optional(),
  ports: z.array(z.object({
    id: z.string(),
    name: z.string(),
    direction: z.enum(["in", "out", "inout"])
  })).optional(),
  documentIds: z.array(z.string()).optional()
});

const architectureConnectorSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(["association", "flow", "dependency", "composition"]),
  label: z.string().optional(),
  sourcePortId: z.string().optional(),
  targetPortId: z.string().optional()
});

const traceLinkSchema = z.object({
  tenant: z.string().min(1).default(config.defaultTenant),
  projectKey: z.string().min(1),
  sourceRequirementId: z.string().min(1),
  targetRequirementId: z.string().min(1),
  linkType: z.enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"]),
  description: z.string().optional()
});

// Register main API routes
const apiRoutes = async (app: FastifyInstance) => {
  app.get("/health", async () => ({
  ok: true,
  env: config.environment,
  workspace: config.workspaceRoot,
  time: new Date().toISOString()
}));

app.get("/tenants", async () => {
  const tenants = await listTenants();
  return { tenants };
});

app.get("/tenants/:tenant/projects", async (req) => {
  const paramsSchema = z.object({ tenant: z.string().min(1) });
  const params = paramsSchema.parse(req.params);
  const projects = await listProjects(params.tenant);
  return { projects };
});

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
    documentSlug: payload.documentSlug,
    sectionId: payload.sectionId,
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

app.patch("/requirements/:tenant/:project/:requirementId", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    requirementId: z.string().min(1)
  });
  const bodySchema = z.object({
    title: z.string().min(3).optional(),
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

app.post("/documents", async (req) => {
  const payload = documentSchema.parse(req.body);
  const document = await createDocument({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    name: payload.name,
    description: payload.description,
    shortCode: payload.shortCode,
    parentFolder: payload.parentFolder
  });
  return { document };
});

app.get("/documents/:tenant/:project", async (req) => {
  const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
  const params = paramsSchema.parse(req.params);
  const documents = await listDocuments(params.tenant, params.project);
  return { documents };
});

app.get("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    documentSlug: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  const document = await getDocument(params.tenant, params.project, params.documentSlug);
  if (!document) return reply.status(404).send({ error: "Document not found" });
  return { document };
});

app.patch("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    documentSlug: z.string().min(1)
  });
  const bodySchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    shortCode: z.string().optional(),
    parentFolder: z.string().optional().nullable()
  });
  const params = paramsSchema.parse(req.params);
  const body = bodySchema.parse(req.body);
  
  let document;
  if (body.parentFolder !== undefined) {
    // Handle folder update separately
    document = await updateDocumentFolder(params.tenant, params.project, params.documentSlug, body.parentFolder);
  } else {
    // Handle general document updates
    const { name, description, shortCode } = body;
    document = await updateDocument(params.tenant, params.project, params.documentSlug, {
      name,
      description,
      shortCode
    });
  }
  
  if (!document) return reply.status(404).send({ error: "Document not found" });
  return { document };
});

app.post("/folders", async (req) => {
  const payload = folderSchema.parse(req.body);
  const folder = await createFolder({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    name: payload.name,
    description: payload.description,
    parentFolder: payload.parentFolder
  });
  return { folder };
});

app.get("/folders/:tenant/:project", async (req) => {
  const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
  const params = paramsSchema.parse(req.params);
  const folders = await listFolders(params.tenant, params.project);
  return { folders };
});

app.patch("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    folderSlug: z.string().min(1)
  });
  const bodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional()
  });
  const params = paramsSchema.parse(req.params);
  const body = bodySchema.parse(req.body);
  
  const folder = await updateFolder(params.tenant, params.project, params.folderSlug, body);
  if (!folder) return reply.status(404).send({ error: "Folder not found" });
  return { folder };
});

app.delete("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    documentSlug: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  const document = await softDeleteDocument(params.tenant, params.project, params.documentSlug);
  if (!document) return reply.status(404).send({ error: "Document not found" });
  return { document };
});

app.delete("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    folderSlug: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  const folder = await softDeleteFolder(params.tenant, params.project, params.folderSlug);
  if (!folder) return reply.status(404).send({ error: "Folder not found" });
  return { folder };
});

// Document sections endpoints
app.post("/sections", async (req) => {
  const payload = documentSectionSchema.parse(req.body);
  const section = await createDocumentSection({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    documentSlug: payload.documentSlug,
    name: payload.name,
    description: payload.description,
    shortCode: payload.shortCode,
    order: payload.order
  });
  return { section };
});

app.get("/sections/:tenant/:project/:documentSlug", async (req) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    documentSlug: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  const sections = await listDocumentSections(params.tenant, params.project, params.documentSlug);
  return { sections };
});

app.patch("/sections/:sectionId", async (req, reply) => {
  const paramsSchema = z.object({
    sectionId: z.string().min(1)
  });
  const bodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    order: z.number().int().min(0).optional(),
    shortCode: z.string().optional()
  });
  const params = paramsSchema.parse(req.params);
  const body = bodySchema.parse(req.body);
  
  try {
    const section = await updateDocumentSection(params.sectionId, body);
    return { section };
  } catch (error) {
    if ((error as Error).message === 'Section not found') {
      return reply.status(404).send({ error: "Section not found" });
    }
    throw error;
  }
});

app.delete("/sections/:sectionId", async (req, reply) => {
  const paramsSchema = z.object({
    sectionId: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  
  try {
    await deleteDocumentSection(params.sectionId);
    return { success: true };
  } catch (error) {
    return reply.status(404).send({ error: "Section not found" });
  }
});

app.get("/sections/:sectionId/requirements", async (req) => {
  const paramsSchema = z.object({
    sectionId: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  const requirements = await listSectionRequirements(params.sectionId);
  return { requirements };
});

// Architecture endpoints
app.post("/architecture/blocks", async (req) => {
  const payload = architectureBlockSchema.parse(req.body);
  const block = await createArchitectureBlock({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    name: payload.name,
    kind: payload.kind,
    stereotype: payload.stereotype,
    description: payload.description,
    positionX: payload.positionX,
    positionY: payload.positionY,
    sizeWidth: payload.sizeWidth,
    sizeHeight: payload.sizeHeight,
    ports: payload.ports
  });
  return { block };
});

app.get("/architecture/blocks/:tenant/:project", async (req) => {
  const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
  const params = paramsSchema.parse(req.params);
  const blocks = await getArchitectureBlocks({ tenant: params.tenant, projectKey: params.project });
  return { blocks };
});

app.patch("/architecture/blocks/:tenant/:project/:blockId", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    blockId: z.string().min(1)
  });
  const bodySchema = z.object({
    name: z.string().min(1).optional(),
    kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"]).optional(),
    stereotype: z.string().optional(),
    description: z.string().optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    sizeWidth: z.number().optional(),
    sizeHeight: z.number().optional(),
    ports: z.array(z.object({
      id: z.string(),
      name: z.string(),
      direction: z.enum(["in", "out", "inout"])
    })).optional(),
    documentIds: z.array(z.string()).optional()
  });
  const params = paramsSchema.parse(req.params);
  const body = bodySchema.parse(req.body);
  
  try {
    const block = await updateArchitectureBlock({
      tenant: params.tenant,
      projectKey: params.project,
      blockId: params.blockId,
      ...body
    });
    return { block };
  } catch (error) {
    if ((error as Error).message === 'Architecture block not found') {
      return reply.status(404).send({ error: "Architecture block not found" });
    }
    throw error;
  }
});

app.delete("/architecture/blocks/:tenant/:project/:blockId", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    blockId: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  
  try {
    await deleteArchitectureBlock({
      tenant: params.tenant,
      projectKey: params.project,
      blockId: params.blockId
    });
    return { success: true };
  } catch (error) {
    return reply.status(404).send({ error: "Architecture block not found" });
  }
});

app.post("/architecture/connectors", async (req) => {
  const payload = architectureConnectorSchema.parse(req.body);
  const connector = await createArchitectureConnector({
    tenant: payload.tenant,
    projectKey: payload.projectKey,
    source: payload.source,
    target: payload.target,
    kind: payload.kind,
    label: payload.label,
    sourcePortId: payload.sourcePortId,
    targetPortId: payload.targetPortId
  });
  return { connector };
});

app.get("/architecture/connectors/:tenant/:project", async (req) => {
  const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
  const params = paramsSchema.parse(req.params);
  const connectors = await getArchitectureConnectors({ tenant: params.tenant, projectKey: params.project });
  return { connectors };
});

app.delete("/architecture/connectors/:tenant/:project/:connectorId", async (req, reply) => {
  const paramsSchema = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1),
    connectorId: z.string().min(1)
  });
  const params = paramsSchema.parse(req.params);
  
  try {
    await deleteArchitectureConnector({
      tenant: params.tenant,
      projectKey: params.project,
      connectorId: params.connectorId
    });
    return { success: true };
  } catch (error) {
    return reply.status(404).send({ error: "Architecture connector not found" });
  }
});

// Trace links endpoints
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
    if ((error as Error).message === 'Trace link not found') {
      return reply.status(404).send({ error: "Trace link not found" });
    }
    throw error;
  }
});
};

await app.register(apiRoutes, { prefix: "/api" });
await app.register(draftRoutes, { prefix: "/api" });
await app.register(airgenRoutes, { prefix: "/api" });

const port = config.port;
app.listen({ port, host: config.host }).catch((e) => {
  (app.log as any).error?.(e);
  process.exit(1);
});
