import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement } from "@airgen/req-qa";
import {
  createRequirementCandidates,
  listRequirementCandidates,
  getRequirementCandidate,
  updateRequirementCandidate,
  createRequirement,
  RequirementCandidateRecord
} from "../services/graph.js";
import { draftCandidates } from "../services/drafting.js";
import { writeRequirementMarkdown, slugify } from "../services/workspace.js";

const patternEnum = z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]);
const verificationEnum = z.enum(["Test", "Analysis", "Inspection", "Demonstration"]);

function mapCandidate(record: RequirementCandidateRecord) {
  return {
    id: record.id,
    text: record.text,
    status: record.status,
    qa: {
      score: record.qaScore ?? null,
      verdict: record.qaVerdict ?? null,
      suggestions: record.suggestions ?? []
    },
    prompt: record.prompt ?? null,
    querySessionId: record.querySessionId ?? null,
    requirementRef: record.requirementRef ?? null,
    requirementId: record.requirementId ?? null,
    documentSlug: record.documentSlug ?? null,
    sectionId: record.sectionId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export default async function airgenRoutes(app: FastifyInstance) {
  const chatSchema = z.object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    user_input: z.string().min(1),
    glossary: z.string().optional(),
    constraints: z.string().optional(),
    n: z.number().int().min(1).max(10).optional()
  });

  app.post("/airgen/chat", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = chatSchema.parse(req.body);
    
    // Generate a unique session ID for this query
    const { randomUUID } = await import("crypto");
    const querySessionId = randomUUID();

    let drafts: string[];
    try {
      drafts = await draftCandidates({
        user_input: body.user_input,
        glossary: body.glossary,
        constraints: body.constraints,
        n: body.n
      });
    } catch (error) {
      req.log.error({ err: error }, "Failed to draft candidates");
      return reply.status(502).send({
        error: "Bad Gateway",
        message: "Failed to generate candidate requirements.",
        detail: error instanceof Error ? error.message : undefined
      });
    }

    const analyzed = drafts.map(text => ({
      text,
      qa: analyzeRequirement(text)
    }));

    const created = await createRequirementCandidates(
      analyzed.map(item => ({
        tenant: slugify(body.tenant),
        projectKey: slugify(body.projectKey),
        text: item.text,
        qaScore: item.qa.score,
        qaVerdict: item.qa.verdict,
        suggestions: item.qa.suggestions,
        prompt: body.user_input,
        source: "chat",
        querySessionId
      }))
    );

    // Align QA info with stored records in order
    const responseItems = created.map((record, index) => {
      const qa = analyzed[index]?.qa;
      return mapCandidate({
        ...record,
        qaScore: qa?.score ?? record.qaScore,
        qaVerdict: qa?.verdict ?? record.qaVerdict,
        suggestions: qa?.suggestions ?? record.suggestions
      });
    });

    return {
      prompt: body.user_input,
      items: responseItems
    };
  });

  const listParams = z.object({
    tenant: z.string().min(1),
    project: z.string().min(1)
  });

  app.get("/airgen/candidates/:tenant/:project", { preHandler: [app.authenticate] }, async (req) => {
    const params = listParams.parse(req.params);
    const items = await listRequirementCandidates(params.tenant, params.project);
    return { items: items.map(mapCandidate) };
  });

  app.get("/airgen/candidates/:tenant/:project/grouped", { preHandler: [app.authenticate] }, async (req) => {
    const params = listParams.parse(req.params);
    const items = await listRequirementCandidates(params.tenant, params.project);
    const mapped = items.map(mapCandidate);
    
    // Group by querySessionId
    const groups = mapped.reduce((acc, candidate) => {
      const sessionId = candidate.querySessionId || 'ungrouped';
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(candidate);
      return acc;
    }, {} as Record<string, typeof mapped>);
    
    // Convert to array format with session metadata
    const groupedItems = Object.entries(groups).map(([sessionId, candidates]) => ({
      sessionId,
      prompt: candidates[0]?.prompt || null,
      count: candidates.length,
      candidates: candidates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    }));
    
    return { 
      groups: groupedItems.sort((a, b) => 
        new Date(a.candidates[0]?.createdAt || 0).getTime() - new Date(b.candidates[0]?.createdAt || 0).getTime()
      )
    };
  });

  const rejectParams = z.object({ id: z.string().min(1) });
  const rejectBody = z.object({ tenant: z.string().min(1), projectKey: z.string().min(1) });

  app.post("/airgen/candidates/:id/reject", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = rejectParams.parse(req.params);
    const body = rejectBody.parse(req.body);

    const candidate = await getRequirementCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "pending") {
      return reply.status(400).send({ error: "Only pending candidates can be rejected" });
    }

    const updated = await updateRequirementCandidate(candidate.id, { status: "rejected" });
    return { candidate: mapCandidate(updated ?? candidate) };
  });

  const returnParams = z.object({ id: z.string().min(1) });
  const returnBody = z.object({ tenant: z.string().min(1), projectKey: z.string().min(1) });

  app.post("/airgen/candidates/:id/return", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = returnParams.parse(req.params);
    const body = returnBody.parse(req.body);

    const candidate = await getRequirementCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "rejected") {
      return reply.status(400).send({ error: "Only rejected candidates can be returned to pending" });
    }

    const updated = await updateRequirementCandidate(candidate.id, { status: "pending" });
    return { candidate: mapCandidate(updated ?? candidate) };
  });

  const acceptParams = z.object({ id: z.string().min(1) });
  const acceptBody = z.object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    pattern: patternEnum.optional(),
    verification: verificationEnum.optional(),
    documentSlug: z.string().optional(),
    sectionId: z.string().optional(),
    tags: z.array(z.string()).optional()
  });

  app.post("/airgen/candidates/:id/accept", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = acceptParams.parse(req.params);
    const body = acceptBody.parse(req.body);

    const candidate = await getRequirementCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "pending") {
      return reply.status(400).send({ error: "Candidate already processed" });
    }
    try {
      const requirement = await createRequirement({
        tenant: candidate.tenant,
        projectKey: candidate.projectKey,
        documentSlug: body.documentSlug,
        sectionId: body.sectionId,
        text: candidate.text,
        pattern: body.pattern,
        verification: body.verification,
        qaScore: candidate.qaScore,
        qaVerdict: candidate.qaVerdict,
        suggestions: candidate.suggestions,
        tags: body.tags
      });

      try {
        await writeRequirementMarkdown(requirement);
      } catch (error) {
        req.log.error({ err: error, requirementId: requirement.id }, "Failed to write requirement markdown");
      }

      const updated = await updateRequirementCandidate(candidate.id, {
        status: "accepted",
        requirementId: requirement.id,
        requirementRef: requirement.ref,
        documentSlug: body.documentSlug ?? null,
        sectionId: body.sectionId ?? null
      });

      return {
        candidate: mapCandidate(updated ?? candidate),
        requirement
      };
    } catch (error) {
      req.log.error({ err: error, candidateId: candidate.id }, "Failed to accept candidate");
      return reply.status(500).send({
        error: "Failed to accept candidate requirement.",
        detail: error instanceof Error ? error.message : undefined
      });
    }
  });
}
