import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { analyzeRequirement } from "@airgen/req-qa";
import { getDocument } from "../services/graph.js";
import { listDocumentRequirements, listSectionRequirements } from "../services/graph/requirements/index.js";
import { listDocumentSections } from "../services/graph/documents/index.js";
import { config } from "../config.js";
import { parseMarkdownDocument, validateMarkdownStructure } from "../services/markdown-parser.js";

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
        return { content, document };
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

      // Validate if requested
      let validationResult = null;
      if (body.validate) {
        validationResult = await validateMarkdownStructure(body.content);
        if (validationResult.errors.length > 0 && validationResult.errors.some(e => e.severity === "error")) {
          return reply.status(400).send({
            error: "Validation failed",
            validation: validationResult
          });
        }
      }

      // Parse markdown to extract requirements and sections
      const parsed = await parseMarkdownDocument(body.content, {
        tenant: params.tenant,
        projectKey: params.project,
        documentSlug: params.documentSlug
      });

      // Save markdown file
      const workspacePath = join(
        config.workspaceRoot,
        params.tenant,
        params.project,
        "documents"
      );
      await fs.mkdir(workspacePath, { recursive: true });

      const filePath = join(workspacePath, `${params.documentSlug}.md`);
      await fs.writeFile(filePath, body.content, "utf-8");

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

      const validationResult = await validateMarkdownStructure(body.content);
      const parsed = await parseMarkdownDocument(body.content, {
        tenant: params.tenant,
        projectKey: params.project,
        documentSlug: params.documentSlug
      });

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
