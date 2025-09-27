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
import { getDocument } from "../services/graph/documents.js";
import { listRequirements } from "../services/graph/requirements.js";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "../config.js";

const patternEnum = z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]);
const verificationEnum = z.enum(["Test", "Analysis", "Inspection", "Demonstration"]);

async function extractDocumentContent(
  tenant: string, 
  projectKey: string, 
  attachment: { type: "native" | "surrogate"; documentSlug: string; sectionIds?: string[] }
): Promise<string> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  
  const document = await getDocument(tenantSlug, projectSlug, attachment.documentSlug);
  if (!document) {
    throw new Error(`Document not found: ${attachment.documentSlug}`);
  }

  if (attachment.type === "surrogate") {
    // For surrogate documents, read the actual file content
    if (!document.storagePath) {
      throw new Error(`Surrogate document has no storage path: ${attachment.documentSlug}`);
    }
    
    const baseDirectory = resolve(config.workspaceRoot, tenantSlug, projectSlug);
    const absolutePath = resolve(baseDirectory, document.storagePath);
    
    try {
      let content: string;
      
      if (document.mimeType === 'application/pdf') {
        // Extract text from PDF using pdftotext (part of poppler-utils)
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);
        
        try {
          // Try pdftotext first (if available)
          const { stdout } = await execAsync(`pdftotext "${absolutePath}" -`);
          content = stdout;
        } catch (pdfError) {
          // Fallback to LibreOffice for PDF conversion
          try {
            const tempDir = '/tmp';
            const { stdout: convertOutput } = await execAsync(
              `libreoffice --headless --convert-to txt --outdir "${tempDir}" "${absolutePath}"`
            );
            const txtFileName = document.storedFileName?.replace(/\.[^.]+$/, '.txt') || 'output.txt';
            const txtPath = `${tempDir}/${txtFileName}`;
            content = await fs.readFile(txtPath, 'utf-8');
            // Clean up temporary file
            await fs.unlink(txtPath).catch(() => {});
          } catch (libreError) {
            throw new Error(`Failed to extract text from PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`);
          }
        }
      } else {
        // For other file types, read as text (works for .txt, .md, etc.)
        content = await fs.readFile(absolutePath, 'utf-8');
      }
      
      return `=== DOCUMENT: ${document.name} ===\n${content.trim()}\n\n`;
    } catch (error) {
      throw new Error(`Failed to read surrogate document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // For native documents, extract requirements
    const requirements = await listRequirements(tenantSlug, projectSlug);
    
    // Filter by document slug and section IDs if specified
    const filteredRequirements = requirements.filter(req => {
      // Check if requirement belongs to the specified document
      if (req.path && !req.path.includes(attachment.documentSlug)) {
        return false;
      }
      // If section IDs are specified, we would need to add section filtering logic here
      // For now, we'll include all requirements from the document
      return true;
    });
    
    if (filteredRequirements.length === 0) {
      return `=== DOCUMENT: ${document.name} ===\n(No requirements found)\n\n`;
    }
    
    const requirementTexts = filteredRequirements.map(req => 
      `[${req.ref}] ${req.text}`
    ).join('\n');
    
    return `=== DOCUMENT: ${document.name} ===\n${requirementTexts}\n\n`;
  }
}

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
  const documentAttachmentSchema = z.object({
    type: z.enum(["native", "surrogate"]),
    documentSlug: z.string().min(1),
    sectionIds: z.array(z.string()).optional() // For native docs, specific sections
  });

  const chatSchema = z.object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    user_input: z.string().min(1),
    glossary: z.string().optional(),
    constraints: z.string().optional(),
    n: z.number().int().min(1).max(10).optional(),
    attachedDocuments: z.array(documentAttachmentSchema).optional()
  });

  app.post("/airgen/chat", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = chatSchema.parse(req.body);
    
    // Generate a unique session ID for this query
    const { randomUUID } = await import("crypto");
    const querySessionId = randomUUID();

    // Extract document context if attachments are provided
    let documentContext = "";
    if (body.attachedDocuments && body.attachedDocuments.length > 0) {
      try {
        const contextPromises = body.attachedDocuments.map(attachment =>
          extractDocumentContent(body.tenant, body.projectKey, attachment)
        );
        const contexts = await Promise.all(contextPromises);
        documentContext = contexts.join("");
      } catch (error) {
        req.log.error({ err: error }, "Failed to extract document context");
        return reply.status(400).send({
          error: "Bad Request",
          message: "Failed to process attached documents.",
          detail: error instanceof Error ? error.message : undefined
        });
      }
    }

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
