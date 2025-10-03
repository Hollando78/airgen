import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { analyzeRequirement } from "@airgen/req-qa";
import { getDocument } from "../services/graph.js";
import {
  createRequirement,
  listDocumentRequirements,
  listSectionRequirements,
  softDeleteRequirement,
  updateRequirement
} from "../services/graph/requirements/index.js";
import {
  createDocumentSection,
  deleteDocumentSection,
  listDocumentSections,
  updateDocumentSection
} from "../services/graph/documents/index.js";
import { listDocumentInfos, createInfo, updateInfo, deleteInfo } from "../services/graph/infos.js";
import { config } from "../config.js";
import { parseMarkdownDocument, validateMarkdownStructure } from "../services/markdown-parser.js";
import type { RequirementPattern, VerificationMethod } from "../services/workspace.js";

const getContentParams = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  documentSlug: z.string().min(1)
});

const saveContentParams = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  documentSlug: z.string().min(1)
});

const saveContentBody = z.object({
  content: z.string(),
  validate: z.boolean().optional()
});

const validateContentBody = z.object({
  content: z.string()
});

/**
 * Generate markdown content from Neo4j data
 */
async function generateMarkdownFromNeo4j(
  tenant: string,
  project: string,
  documentSlug: string,
  documentName: string
): Promise<string> {
  try {
    // Get sections from Neo4j
    const sections = await listDocumentSections(tenant, project, documentSlug);

    let markdown = `# ${documentName}\n\n`;

    if (sections.length > 0) {
      // For each section, get its requirements
      for (const section of sections) {
        const sectionReqs = await listSectionRequirements(section.id);
        const prefix = section.shortCode ? `[${section.shortCode}] ` : "";
        markdown += `## ${prefix}${section.name}\n\n`;

        if (sectionReqs.length > 0) {
          for (const req of sectionReqs) {
            markdown += `:::requirement{#${req.ref} title="${req.ref}"}\n`;
            markdown += `${req.text}\n`;
            if (req.pattern) {
              markdown += `\n**Pattern:** ${req.pattern}\n`;
            }
            if (req.verification) {
              markdown += `**Verification:** ${req.verification}\n`;
            }
            markdown += `:::\n\n`;
          }
        }
      }

      // Get all document requirements to find unsectioned ones
      const allRequirements = await listDocumentRequirements(tenant, project, documentSlug);
      const sectionedReqIds = new Set<string>();

      for (const section of sections) {
        const sectionReqs = await listSectionRequirements(section.id);
        for (const req of sectionReqs) {
          sectionedReqIds.add(req.id);
        }
      }

      const unsectioned = allRequirements.filter(req => !sectionedReqIds.has(req.id));
      if (unsectioned.length > 0) {
        markdown += `## Unsectioned Requirements\n\n`;
        for (const req of unsectioned) {
          markdown += `:::requirement{#${req.ref} title="${req.ref}"}\n`;
          markdown += `${req.text}\n`;
          if (req.pattern) {
            markdown += `\n**Pattern:** ${req.pattern}\n`;
          }
          if (req.verification) {
            markdown += `**Verification:** ${req.verification}\n`;
          }
          markdown += `:::\n\n`;
        }
      }
    } else {
      // No sections, just list all requirements
      const requirements = await listDocumentRequirements(tenant, project, documentSlug);

      if (requirements.length > 0) {
        markdown += `## Requirements\n\n`;
        for (const req of requirements) {
          markdown += `:::requirement{#${req.ref} title="${req.ref}"}\n`;
          markdown += `${req.text}\n`;
          if (req.pattern) {
            markdown += `\n**Pattern:** ${req.pattern}\n`;
          }
          if (req.verification) {
            markdown += `**Verification:** ${req.verification}\n`;
          }
          markdown += `:::\n\n`;
        }
      } else {
        markdown += `*No requirements yet. Start writing!*\n`;
      }
    }

    return markdown;
  } catch (error) {
    console.error("Error generating markdown from Neo4j:", error);
    return `# ${documentName}\n\n*Error loading document content. Please try again.*\n`;
  }
}

/**
 * Markdown API routes for document content editing
 */
export default async function markdownRoutes(app: FastifyInstance) {
  /**
   * GET /markdown/:tenant/:project/:documentSlug/content
   * Fetch document markdown content
   */
  app.get(
    "/markdown/:tenant/:project/:documentSlug/content",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const params = getContentParams.parse(req.params);

      // Verify document exists
      const document = await getDocument(params.tenant, params.project, params.documentSlug);
      if (!document) {
        return reply.status(404).send({ error: "Document not found" });
      }

      // Only structured documents support markdown editing
      if (document.kind !== "structured") {
        return reply.status(400).send({ error: "Only structured documents support markdown editing" });
      }

      // Build path to markdown file
      const workspacePath = join(
        config.workspaceRoot,
        params.tenant,
        params.project,
        "documents",
        `${params.documentSlug}.md`
      );

      try {
        const content = await fs.readFile(workspacePath, "utf-8");
        const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return { content: normalizedContent, document };
      } catch (error) {
        // If file doesn't exist, generate markdown from Neo4j data
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          const generatedContent = await generateMarkdownFromNeo4j(
            params.tenant,
            params.project,
            params.documentSlug,
            document.name
          );
          return { content: generatedContent, document };
        }
        throw error;
      }
    }
  );

  /**
   * PUT /markdown/:tenant/:project/:documentSlug/content
   * Save document markdown content
   */
  app.put(
    "/markdown/:tenant/:project/:documentSlug/content",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const params = saveContentParams.parse(req.params);
      const body = saveContentBody.parse(req.body);

      // Verify document exists
      const document = await getDocument(params.tenant, params.project, params.documentSlug);
      if (!document) {
        return reply.status(404).send({ error: "Document not found" });
      }

      if (document.kind !== "structured") {
        return reply.status(400).send({ error: "Only structured documents support markdown editing" });
      }

      const normalizedContent = body.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      // Validate if requested
      let validationResult = null;
      if (body.validate) {
        validationResult = await validateMarkdownStructure(normalizedContent);
        if (validationResult.errors.length > 0 && validationResult.errors.some(e => e.severity === "error")) {
          return reply.status(400).send({
            error: "Validation failed",
            validation: validationResult
          });
        }
      }

      // Parse markdown to extract requirements and sections
      const parsed = await parseMarkdownDocument(normalizedContent, {
        tenant: params.tenant,
        projectKey: params.project,
        documentSlug: params.documentSlug
      });

      req.log.info({
        tenant: params.tenant,
        project: params.project,
        documentSlug: params.documentSlug,
        validate: Boolean(body.validate),
        parsedSections: parsed.sections.length,
        parsedRequirements: parsed.requirements.length,
        parsedInfos: parsed.infos.length
      }, "markdown.save.parseComplete");

      if (body.validate) {
        const existingSections = await listDocumentSections(params.tenant, params.project, params.documentSlug);
        const existingRequirements = await listDocumentRequirements(params.tenant, params.project, params.documentSlug);
        const existingInfos = await listDocumentInfos(params.tenant, params.project, params.documentSlug);

        req.log.info({
          tenant: params.tenant,
          project: params.project,
          documentSlug: params.documentSlug,
          existingSections: existingSections.length,
          existingRequirements: existingRequirements.length,
          existingInfos: existingInfos.length
        }, "markdown.save.currentGraphState");

        const sectionMap = new Map<string, string>();

        for (let idx = 0; idx < parsed.sections.length; idx++) {
          const section = parsed.sections[idx];
          const existing = existingSections.find(s => s.name === section.name || (section.shortCode && s.shortCode === section.shortCode));

          if (existing) {
            const updates: { name?: string; shortCode?: string; order?: number } = {};

            if (section.name !== existing.name) {
              updates.name = section.name;
            }

            const normalizedSectionShortCode = section.shortCode || null;
            const normalizedExistingShortCode = existing.shortCode || null;
            if (normalizedSectionShortCode !== normalizedExistingShortCode) {
              updates.shortCode = section.shortCode || undefined;
            }

            if (idx !== existing.order) {
              updates.order = idx;
            }

            if (Object.keys(updates).length > 0) {
              await updateDocumentSection(existing.id, updates);
            }
            sectionMap.set(section.name, existing.id);
          } else {
            const created = await createDocumentSection({
              tenant: params.tenant,
              projectKey: params.project,
              documentSlug: params.documentSlug,
              name: section.name,
              shortCode: section.shortCode || undefined,
              order: idx
            });
            sectionMap.set(section.name, created.id);
          }
        }

        for (const req of parsed.requirements) {
          const existing = existingRequirements.find(r => r.ref === req.ref);
          const sectionId = req.sectionName ? sectionMap.get(req.sectionName) : undefined;

          if (existing) {
            await updateRequirement(params.tenant, params.project, existing.id, {
              text: req.text,
              pattern: req.pattern as RequirementPattern | undefined,
              verification: req.verification as VerificationMethod | undefined,
              sectionId
            });
          } else {
            await createRequirement({
              tenant: params.tenant,
              projectKey: params.project,
              documentSlug: params.documentSlug,
              ref: req.ref,
              text: req.text,
              pattern: req.pattern as RequirementPattern | undefined,
              verification: req.verification as VerificationMethod | undefined,
              sectionId
            });
          }
        }

        const documentRecord = document;
        const docPrefix = documentRecord?.shortCode || params.documentSlug.toUpperCase().replace(/-/g, "");
        const parsedInfoRefs = new Set<string>();

        for (let infoIdx = 0; infoIdx < parsed.infos.length; infoIdx++) {
          const info = parsed.infos[infoIdx];
          const sectionId = info.sectionName ? sectionMap.get(info.sectionName) : undefined;

          let ref = info.ref || info.id;
          if (!ref) {
            const infoNumber = String(infoIdx + 1).padStart(3, "0");
            ref = `${docPrefix}-INFO-${infoNumber}`;
          }

          parsedInfoRefs.add(ref);
          const existing = existingInfos.find(i => i.ref === ref);

          if (existing) {
            await updateInfo(params.tenant, params.project, existing.ref, {
              text: info.text,
              title: info.title,
              sectionId,
              order: info.line
            });
          } else {
            await createInfo({
              tenant: params.tenant,
              projectKey: params.project,
              documentSlug: params.documentSlug,
              ref,
              text: info.text,
              title: info.title,
              sectionId,
              order: info.line
            });
          }
        }

        const parsedRequirementRefs = new Set(
          parsed.requirements.map(r => r.ref || r.id).filter((ref): ref is string => Boolean(ref))
        );

        for (const existing of existingRequirements) {
          if (!parsedRequirementRefs.has(existing.ref)) {
            await softDeleteRequirement(params.tenant, params.project, existing.ref);
          }
        }

        for (const existing of existingInfos) {
          if (!parsedInfoRefs.has(existing.ref)) {
            await deleteInfo(params.tenant, params.project, existing.ref);
          }
        }

        const parsedSectionNames = new Set(parsed.sections.map(s => s.name));
        for (const existing of existingSections) {
          if (!parsedSectionNames.has(existing.name)) {
            await deleteDocumentSection(existing.id);
          }
        }

        req.log.info({
          tenant: params.tenant,
          project: params.project,
          documentSlug: params.documentSlug,
          syncedSections: parsed.sections.length,
          syncedRequirements: parsed.requirements.length,
          syncedInfos: parsed.infos.length
        }, "markdown.save.syncComplete");
      }

      // Save markdown file
      const workspacePath = join(
        config.workspaceRoot,
        params.tenant,
        params.project,
        "documents"
      );
      await fs.mkdir(workspacePath, { recursive: true });

      const filePath = join(workspacePath, `${params.documentSlug}.md`);
      await fs.writeFile(filePath, normalizedContent, "utf-8");

      return {
        success: true,
        document,
        validation: validationResult,
        parsed: {
          requirementCount: parsed.requirements.length,
          sectionCount: parsed.sections.length
        }
      };
    }
  );

  /**
   * POST /markdown/:tenant/:project/:documentSlug/validate
   * Validate markdown structure without saving
   */
  app.post(
    "/markdown/:tenant/:project/:documentSlug/validate",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const params = getContentParams.parse(req.params);
      const body = validateContentBody.parse(req.body);

      const normalizedContent = body.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const validationResult = await validateMarkdownStructure(normalizedContent);
      const parsed = await parseMarkdownDocument(normalizedContent, {
        tenant: params.tenant,
        projectKey: params.project,
        documentSlug: params.documentSlug
      });

      req.log.debug({
        tenant: params.tenant,
        project: params.project,
        documentSlug: params.documentSlug,
        parsedSections: parsed.sections.length,
        parsedRequirements: parsed.requirements.length,
        parsedInfos: parsed.infos.length
      }, "markdown.validate.parseComplete");

      return {
        validation: validationResult,
        parsed: {
          requirements: parsed.requirements.map(r => ({
            id: r.id,
            text: r.text,
            line: r.line,
            qa: analyzeRequirement(r.text)
          })),
          sections: parsed.sections.map(s => ({
            name: s.name,
            shortCode: s.shortCode,
            line: s.line,
            level: s.level
          }))
        }
      };
    }
  );
}
