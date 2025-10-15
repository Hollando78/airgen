import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { analyzeRequirement } from "@airgen/req-qa";
import { getDocument } from "../services/graph.js";
import { config } from "../config.js";
import { CacheInvalidation } from "../lib/cache.js";
import { parseMarkdownDocument, validateMarkdownStructure } from "../services/markdown-parser.js";
import { syncParsedDocument } from "../services/markdown-sync.js";
import { getSession } from "../services/graph/driver.js";
import { slugify } from "../services/workspace.js";
import { validateFilePath } from "../services/secure-file.js";
import { listDocumentSections, listDocumentSectionsWithRelations } from "../services/graph/documents/documents-sections.js";
import { listSectionRequirements, listDocumentRequirements } from "../services/graph/requirements/requirements-search.js";

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

const DOCUMENTS_DIR = "documents";
const DRAFTS_DIR = ".drafts";

function getDraftPath(tenant: string, project: string, documentSlug: string): string {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);
  const docSlug = slugify(documentSlug);

  return join(
    config.workspaceRoot,
    tenantSlug,
    projectSlug,
    DOCUMENTS_DIR,
    DRAFTS_DIR,
    `${docSlug}.md`
  );
}

async function readDraftIfExists(tenant: string, project: string, documentSlug: string): Promise<string | null> {
  const draftPath = getDraftPath(tenant, project, documentSlug);
  try {
    const draft = await fs.readFile(draftPath, "utf-8");
    return draft.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const legacyRelativePath = join(
        tenant,
        project,
        DOCUMENTS_DIR,
        DRAFTS_DIR,
        `${documentSlug}.md`
      );
      const validation = validateFilePath(config.workspaceRoot, legacyRelativePath);
      if (!validation.isValid || !validation.safePath) {
        return null;
      }
      try {
        const draft = await fs.readFile(validation.safePath, "utf-8");
        return draft.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw legacyError;
      }
    }
    throw error;
  }
}

async function writeDraft(tenant: string, project: string, documentSlug: string, content: string): Promise<void> {
  const draftPath = getDraftPath(tenant, project, documentSlug);
  await fs.mkdir(dirname(draftPath), { recursive: true });
  await fs.writeFile(draftPath, content, "utf-8");
}

async function deleteDraftIfExists(tenant: string, project: string, documentSlug: string): Promise<void> {
  const draftPath = getDraftPath(tenant, project, documentSlug);
  try {
    await fs.rm(draftPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const legacyRelativePath = join(
        tenant,
        project,
        DOCUMENTS_DIR,
        DRAFTS_DIR,
        `${documentSlug}.md`
      );
      const validation = validateFilePath(config.workspaceRoot, legacyRelativePath);
      if (!validation.isValid || !validation.safePath) {
        return;
      }
      try {
        await fs.rm(validation.safePath);
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw legacyError;
      }
      return;
    }
    throw error;
  }
}

const validateContentBody = z.object({
  content: z.string()
});

/**
 * Generate markdown content from Neo4j data
 *
 * The source of truth is always the live Neo4j data (sections, requirements, infos, surrogates).
 * Inline edits modify Neo4j directly and are considered published changes.
 * ContentBlocks are only used as a fallback for legacy documents or when live data is unavailable.
 */
export async function generateMarkdownFromNeo4j(
  tenant: string,
  project: string,
  documentSlug: string,
  documentName: string
): Promise<string> {
  const session = getSession();
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  try {
    // Always generate from live Neo4j data (source of truth)
    // Use optimized query that fetches all data in one call
    const sections = await listDocumentSectionsWithRelations(tenant, project, documentSlug);

    let markdown = `# ${documentName}\n\n`;

    if (sections.length > 0) {
      // Track all requirements that are in sections
      const sectionedReqIds = new Set<string>();

      for (const section of sections) {
        const prefix = section.shortCode ? `[${section.shortCode}] ` : "";
        markdown += `## ${prefix}${section.name}\n\n`;

        // Merge requirements, infos, and surrogates into a single array and sort by order
        type SectionItem =
          | { type: 'requirement'; data: typeof section.requirements[number]; order: number }
          | { type: 'info'; data: typeof section.infos[number]; order: number }
          | { type: 'surrogate'; data: typeof section.surrogates[number]; order: number };

        const items: SectionItem[] = [
          ...(section.requirements || []).map(req => ({
            type: 'requirement' as const,
            data: req,
            order: req.order ?? 999999
          })),
          ...(section.infos || []).map(info => ({
            type: 'info' as const,
            data: info,
            order: info.order ?? 999999
          })),
          ...(section.surrogates || []).map(surrogate => ({
            type: 'surrogate' as const,
            data: surrogate,
            order: surrogate.order ?? 999999
          }))
        ];

        // Sort by order property to maintain interleaved ordering
        items.sort((a, b) => a.order - b.order);

        // Output items in the correct interleaved order
        for (const item of items) {
          if (item.type === 'requirement') {
            const req = item.data;
            sectionedReqIds.add(req.id);
            markdown += `:::requirement{#${req.ref} title="${req.ref}"}\n`;
            markdown += `${req.text}\n`;
            if (req.pattern) {
              markdown += `\n**Pattern:** ${req.pattern}\n`;
            }
            if (req.verification) {
              markdown += `**Verification:** ${req.verification}\n`;
            }
            markdown += `:::\n\n`;
          } else if (item.type === 'info') {
            const info = item.data;
            markdown += `:::info\n`;
            markdown += `${info.text}\n`;
            markdown += `:::\n\n`;
          } else if (item.type === 'surrogate') {
            const surrogate = item.data;
            markdown += `:::surrogate{slug="${surrogate.slug}"}\n`;
            markdown += `:::\n\n`;
          }
        }
      }

      // Handle unsectioned requirements
      const allRequirements = await listDocumentRequirements(tenant, project, documentSlug);
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
  } finally {
    await session.close();
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

      // Prefer draft content if present
      const draft = await readDraftIfExists(params.tenant, params.project, params.documentSlug);
      if (draft !== null) {
        return { content: draft, document, draft: true };
      }

      const generatedContent = await generateMarkdownFromNeo4j(
        params.tenant,
        params.project,
        params.documentSlug,
        document.name
      );
      return { content: generatedContent, document, draft: false };
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

      const isPublish = Boolean(body.validate);

      if (!isPublish) {
        await writeDraft(params.tenant, params.project, params.documentSlug, normalizedContent);
        req.log.debug({
          tenant: params.tenant,
          project: params.project,
          documentSlug: params.documentSlug
        }, "markdown.draft.saved");

        return {
          success: true,
          draft: {
            updatedAt: new Date().toISOString()
          }
        };
      }

      const validationResult = await validateMarkdownStructure(normalizedContent);
      if (validationResult.errors.length > 0 && validationResult.errors.some(e => e.severity === "error")) {
        return reply.status(400).send({
          error: "Validation failed",
          validation: validationResult
        });
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
        validate: true,
        parsedSections: parsed.sections.length,
        parsedRequirements: parsed.requirements.length,
        parsedInfos: parsed.infos.length
      }, "markdown.save.parseComplete");

      const session = getSession();
      try {
        await session.executeWrite(async (tx) => {
          await syncParsedDocument(tx, {
            tenant: params.tenant,
            projectKey: params.project,
            document,
            documentSlug: params.documentSlug,
            parsed
          });
        });
      } finally {
        await session.close();
      }

      req.log.info({
        tenant: params.tenant,
        project: params.project,
        documentSlug: params.documentSlug,
        syncedSections: parsed.sections.length,
        syncedRequirements: parsed.requirements.length,
        syncedInfos: parsed.infos.length
      }, "markdown.save.syncComplete");
      await deleteDraftIfExists(params.tenant, params.project, params.documentSlug);

      const tenantSlug = slugify(params.tenant);
      const projectSlug = slugify(params.project);
      await Promise.all([
        CacheInvalidation.invalidateRequirements(tenantSlug, projectSlug),
        CacheInvalidation.invalidateDocuments(tenantSlug, projectSlug)
      ]);

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
