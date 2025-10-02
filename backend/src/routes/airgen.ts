import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement } from "@airgen/req-qa";
import type {
  RequirementCandidateRecord
} from "../services/graph.js";
import {
  createRequirementCandidates,
  listRequirementCandidates,
  getRequirementCandidate,
  updateRequirementCandidate,
  createRequirement
} from "../services/graph.js";
import { draftCandidates } from "../services/drafting.js";
import { generateDiagram } from "../services/diagram-generation.js";
import { 
  createDiagramCandidate, 
  listDiagramCandidates,
  getDiagramCandidate,
  updateDiagramCandidate,
  mapDiagramCandidate
} from "../services/graph/diagram-candidates.js";
import {
  createArchitectureDiagram,
  createArchitectureBlock,
  createArchitectureConnector
} from "../services/graph.js";
import { writeRequirementMarkdown, slugify } from "../services/workspace.js";
import { extractDocumentContent } from "../services/document-content.js";
import { extractDiagramContent } from "../services/diagram-content.js";

const patternEnum = z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]);
const verificationEnum = z.enum(["Test", "Analysis", "Inspection", "Demonstration"]);

function mapCandidate(record: RequirementCandidateRecord) {
  const qa = {
    score: record.qaScore ?? null,
    verdict: record.qaVerdict ?? null,
    suggestions: record.suggestions ?? []
  };

  return {
    id: record.id,
    text: record.text,
    status: record.status,
    qa,
    qaScore: record.qaScore ?? undefined,
    qaVerdict: record.qaVerdict ?? undefined,
    suggestions: record.suggestions ?? [],
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
  const documentAttachmentSchema = z.object({
    type: z.enum(["native", "surrogate", "structured"]),
    documentSlug: z.string().min(1),
    sectionIds: z.array(z.string()).optional() // For native docs, specific sections
  });

  const diagramAttachmentSchema = z.object({
    type: z.literal("diagram"),
    diagramId: z.string().min(1),
    includeGeometry: z.boolean().optional(),
    includeConnections: z.boolean().optional()
  });

  const chatSchema = z.object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    user_input: z.string().min(1),
    glossary: z.string().optional(),
    constraints: z.string().optional(),
    n: z.number().int().min(1).max(10).optional(),
    mode: z.enum(["requirements", "diagram"]).optional(),
    attachedDocuments: z.array(documentAttachmentSchema).optional(),
    attachedDiagrams: z.array(diagramAttachmentSchema).optional()
  });

  app.post("/airgen/chat", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = chatSchema.parse(req.body);
    
    // Generate a unique session ID for this query
    const { randomUUID } = await import("crypto");
    const querySessionId = randomUUID();

    // Extract document and diagram context if attachments are provided
    let documentContext = "";
    
    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);

    // Process document attachments
    if (body.attachedDocuments && body.attachedDocuments.length > 0) {
      try {
        const contextPromises = body.attachedDocuments.map(attachment =>
          extractDocumentContent(tenantSlug, projectSlug, attachment)
        );
        const contexts = await Promise.all(contextPromises);
        documentContext += contexts.join("");
      } catch (error) {
        req.log.error({ err: error }, "Failed to extract document context");
        return reply.status(400).send({
          error: "Bad Request",
          message: "Failed to process attached documents.",
          detail: error instanceof Error ? error.message : undefined
        });
      }
    }

    // Process diagram attachments
    if (body.attachedDiagrams && body.attachedDiagrams.length > 0) {
      try {
        const diagramPromises = body.attachedDiagrams.map(attachment =>
          extractDiagramContent(tenantSlug, projectSlug, attachment)
        );
        const diagramContexts = await Promise.all(diagramPromises);
        documentContext += diagramContexts.join("");
      } catch (error) {
        req.log.error({ err: error }, "Failed to extract diagram context");
        return reply.status(400).send({
          error: "Bad Request",
          message: "Failed to process attached diagrams.",
          detail: error instanceof Error ? error.message : undefined
        });
      }
    }

    const mode = body.mode || "requirements";

    if (mode === "diagram") {
      // Generate diagram candidate
      try {
        const diagramAction = body.attachedDiagrams && body.attachedDiagrams.length > 0 ? "update" : "create";
        const diagramResponse = await generateDiagram({
          user_input: body.user_input,
          glossary: body.glossary,
          constraints: body.constraints,
          mode: diagramAction,
          existingDiagramContext: documentContext || undefined,
          documentContext: documentContext || undefined
        });

        // Create a diagram candidate record in the database
        const diagramCandidate = await createDiagramCandidate({
          tenant: tenantSlug,
          projectKey: projectSlug,
          status: "pending",
          action: diagramResponse.action,
          diagramId: body.attachedDiagrams?.[0]?.diagramId,
          diagramName: diagramResponse.diagramName,
          diagramDescription: diagramResponse.diagramDescription,
          diagramView: diagramResponse.diagramView || "block",
          blocks: diagramResponse.blocks,
          connectors: diagramResponse.connectors,
          reasoning: diagramResponse.reasoning,
          prompt: body.user_input,
          querySessionId
        });

        return {
          prompt: body.user_input,
          candidate: diagramCandidate
        };
      } catch (error) {
        req.log.error({ err: error }, "Failed to generate diagram candidate");
        return reply.status(502).send({
          error: "Bad Gateway",
          message: "Failed to generate diagram candidate.",
          detail: error instanceof Error ? error.message : undefined
        });
      }
    }

    // Default requirements mode
    let drafts: string[];
    try {
      drafts = await draftCandidates({
        user_input: body.user_input,
        glossary: body.glossary,
        constraints: body.constraints,
        n: body.n,
        documentContext: documentContext || undefined
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
        tenant: tenantSlug,
        projectKey: projectSlug,
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
    const responseItems = created.map((record, index) => mapCandidate(record));

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

  // Diagram candidate endpoints
  app.get("/airgen/diagram-candidates/:tenant/:project", { preHandler: [app.authenticate] }, async (req) => {
    const params = listParams.parse(req.params);
    const items = await listDiagramCandidates(params.tenant, params.project);
    return { items };
  });

  app.post("/airgen/diagram-candidates/:id/reject", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = rejectParams.parse(req.params);
    const body = rejectBody.parse(req.body);

    const candidate = await getDiagramCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Diagram candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Diagram candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "pending") {
      return reply.status(400).send({ error: "Only pending diagram candidates can be rejected" });
    }

    const updated = await updateDiagramCandidate(candidate.id, { status: "rejected" });
    return { candidate: updated ?? candidate };
  });

  app.post("/airgen/diagram-candidates/:id/return", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = returnParams.parse(req.params);
    const body = returnBody.parse(req.body);

    const candidate = await getDiagramCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Diagram candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Diagram candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "rejected") {
      return reply.status(400).send({ error: "Only rejected diagram candidates can be returned to pending" });
    }

    const updated = await updateDiagramCandidate(candidate.id, { status: "pending" });
    return { candidate: updated ?? candidate };
  });

  const acceptDiagramBody = z.object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    diagramName: z.string().optional(),
    diagramDescription: z.string().optional()
  });

  app.post("/airgen/diagram-candidates/:id/accept", { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = acceptParams.parse(req.params);
    const body = acceptDiagramBody.parse(req.body);

    const candidate = await getDiagramCandidate(params.id);
    if (!candidate) {
      return reply.status(404).send({ error: "Diagram candidate not found" });
    }

    const tenantSlug = slugify(body.tenant);
    const projectSlug = slugify(body.projectKey);
    if (candidate.tenant !== tenantSlug || candidate.projectKey !== projectSlug) {
      return reply.status(400).send({ error: "Diagram candidate does not belong to the provided tenant/project" });
    }
    if (candidate.status !== "pending") {
      return reply.status(400).send({ error: "Only pending diagram candidates can be accepted" });
    }

    try {
      let diagramId = candidate.diagramId;
      
      // Create new diagram if action is "create"
      if (candidate.action === "create") {
        const newDiagram = await createArchitectureDiagram({
          tenant: body.tenant,
          projectKey: body.projectKey,
          name: body.diagramName || candidate.diagramName || "Generated Diagram",
          description: body.diagramDescription || candidate.diagramDescription || undefined,
          view: candidate.diagramView as "block" | "internal" | "deployment" || "block"
        });
        diagramId = newDiagram.id;
      }
      
      // Create blocks and connectors if we have a diagram ID
      if (diagramId && candidate.blocks && candidate.connectors) {
        // Create blocks first and track their IDs
        const blockIdMap = new Map<string, string>(); // original name -> created ID
        
        for (const block of candidate.blocks) {
          if (!block.action || block.action === "create") {
            const createdBlock = await createArchitectureBlock({
              tenant: body.tenant,
              projectKey: body.projectKey,
              diagramId,
              name: block.name,
              kind: block.kind as any,
              stereotype: block.stereotype,
              description: block.description,
              positionX: block.positionX,
              positionY: block.positionY,
              sizeWidth: block.sizeWidth || 150,
              sizeHeight: block.sizeHeight || 100,
              ports: block.ports?.map(p => ({ ...p, direction: p.direction as "in" | "out" | "inout" })) || [],
              documentIds: []
            });
            blockIdMap.set(block.name, createdBlock.id);
          }
        }
        
        // Create connectors using the mapped block IDs
        for (const connector of candidate.connectors) {
          if (!connector.action || connector.action === "create") {
            const sourceBlockId = blockIdMap.get(connector.source);
            const targetBlockId = blockIdMap.get(connector.target);
            
            if (sourceBlockId && targetBlockId) {
              await createArchitectureConnector({
                tenant: body.tenant,
                projectKey: body.projectKey,
                diagramId,
                source: sourceBlockId,
                target: targetBlockId,
                kind: connector.kind as any,
                label: connector.label,
                sourcePortId: connector.sourcePortId,
                targetPortId: connector.targetPortId
              });
            }
          }
        }
      }
      
      // Mark candidate as accepted and store the diagram ID
      const updated = await updateDiagramCandidate(candidate.id, { 
        status: "accepted",
        diagramId,
        diagramName: body.diagramName || candidate.diagramName,
        diagramDescription: body.diagramDescription || candidate.diagramDescription
      });
      
      return { candidate: updated ?? candidate, diagramId };
    } catch (error) {
      req.log.error({ err: error, candidateId: candidate.id }, "Failed to accept diagram candidate");
      return reply.status(500).send({
        error: "Failed to accept diagram candidate.",
        detail: error instanceof Error ? error.message : undefined
      });
    }
  });
}
