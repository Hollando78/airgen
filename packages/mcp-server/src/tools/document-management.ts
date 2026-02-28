import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable } from "../format.js";

interface DocRecord {
  slug: string;
  name: string;
  description?: string;
  shortCode?: string;
  kind?: string;
}

interface SectionRecord {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  shortCode?: string;
  order?: number;
}

export function registerDocumentManagementTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── create_document ─────────────────────────────────────────
  server.tool(
    "create_document",
    "Create a new document in a project. Use type 'structured' for native AIRGen documents with sections and requirements.",
    {
      projectKey: z.string().describe("Project slug/key"),
      tenant: z.string().describe("Tenant slug"),
      name: z.string().describe("Document name (e.g. 'System Requirements Document')"),
      code: z
        .string()
        .optional()
        .describe("Short document code (e.g. 'SRD', 'URD', 'ICD')"),
      description: z.string().optional().describe("Document description"),
    },
    async ({ projectKey, tenant, name, code, description }) => {
      try {
        const body: Record<string, unknown> = {
          tenant,
          projectKey,
          name,
        };
        if (code) body.shortCode = code;
        if (description) body.description = description;

        const data = await client.post<{ document: DocRecord }>("/documents", body);
        const doc = data.document;
        return ok(
          `Document created successfully.\n\n` +
            `- **Slug:** ${doc.slug}\n` +
            `- **Name:** ${doc.name}\n` +
            `- **Code:** ${doc.shortCode ?? "(none)"}\n` +
            `- **Type:** ${doc.kind ?? "structured"}\n` +
            (doc.description ? `- **Description:** ${doc.description}\n` : ""),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── update_document ─────────────────────────────────────────
  server.tool(
    "update_document",
    "Update a document's name, code, or description.",
    {
      documentSlug: z.string().describe("Document slug"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      name: z.string().optional().describe("New name"),
      code: z.string().optional().describe("New short code"),
      description: z.string().optional().describe("New description"),
    },
    async ({ documentSlug, project, tenant, name, code, description }) => {
      try {
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (code !== undefined) body.shortCode = code;
        if (description !== undefined) body.description = description;

        const data = await client.patch<{ document: DocRecord }>(
          `/documents/${tenant}/${project}/${documentSlug}`,
          body,
        );
        const doc = data.document;
        return ok(
          `Document updated.\n\n` +
            `- **Slug:** ${doc.slug}\n` +
            `- **Name:** ${doc.name}\n` +
            `- **Code:** ${doc.shortCode ?? "(none)"}\n` +
            (doc.description ? `- **Description:** ${doc.description}\n` : ""),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── delete_document ─────────────────────────────────────────
  server.tool(
    "delete_document",
    "Delete a document (soft delete). Requirements in the document are NOT deleted — they become unassigned.",
    {
      documentSlug: z.string().describe("Document slug"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
    },
    async ({ documentSlug, project, tenant }) => {
      try {
        await client.delete(`/documents/${tenant}/${project}/${documentSlug}`);
        return ok(`Document '${documentSlug}' deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── create_section ──────────────────────────────────────────
  server.tool(
    "create_section",
    "Add a section to a document. Sections provide hierarchical structure (e.g. '3.1 Functional Requirements').",
    {
      documentSlug: z.string().describe("Parent document slug"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      title: z.string().describe("Section title (e.g. 'Functional Requirements')"),
      orderIndex: z
        .number()
        .optional()
        .describe("Position within parent (0-based). Default: 0"),
      description: z
        .string()
        .optional()
        .describe("Optional section description"),
      shortCode: z
        .string()
        .optional()
        .describe("Short code for requirement numbering (e.g. 'FUNC')"),
    },
    async ({ documentSlug, project, tenant, title, orderIndex, description, shortCode }) => {
      try {
        const body: Record<string, unknown> = {
          tenant,
          projectKey: project,
          documentSlug,
          name: title,
          order: orderIndex ?? 0,
        };
        if (description) body.description = description;
        if (shortCode) body.shortCode = shortCode;

        const data = await client.post<{ section: SectionRecord }>("/sections", body);
        const sec = data.section;
        return ok(
          `Section created.\n\n` +
            `- **ID:** ${sec.id}\n` +
            `- **Title:** ${sec.name ?? sec.title}\n` +
            `- **Order:** ${sec.order ?? 0}\n` +
            `- **Document:** ${documentSlug}\n` +
            (sec.shortCode ? `- **Code:** ${sec.shortCode}\n` : ""),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── update_section ──────────────────────────────────────────
  server.tool(
    "update_section",
    "Rename, reorder, or update a section.",
    {
      sectionId: z.string().describe("Section ID"),
      documentSlug: z.string().describe("Parent document slug (for context)"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      title: z.string().optional().describe("New title"),
      orderIndex: z.number().optional().describe("New position within parent"),
      description: z.string().optional().describe("New description"),
      shortCode: z.string().optional().describe("New short code"),
    },
    async ({ sectionId, tenant, title, orderIndex, description, shortCode }) => {
      try {
        const body: Record<string, unknown> = { tenant };
        if (title !== undefined) body.name = title;
        if (orderIndex !== undefined) body.order = orderIndex;
        if (description !== undefined) body.description = description;
        if (shortCode !== undefined) body.shortCode = shortCode;

        const data = await client.patch<{ section: SectionRecord }>(
          `/sections/${sectionId}`,
          body,
        );
        const sec = data.section;
        return ok(
          `Section updated.\n\n` +
            `- **ID:** ${sec.id}\n` +
            `- **Title:** ${sec.name ?? sec.title}\n` +
            `- **Order:** ${sec.order ?? 0}\n` +
            (sec.shortCode ? `- **Code:** ${sec.shortCode}\n` : ""),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── delete_section ──────────────────────────────────────────
  server.tool(
    "delete_section",
    "Delete a section from a document. Requirements in the section become unassigned (not deleted).",
    {
      sectionId: z.string().describe("Section ID"),
      documentSlug: z.string().describe("Parent document slug (for context)"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
    },
    async ({ sectionId, tenant }) => {
      try {
        await client.delete(`/sections/${sectionId}`);
        return ok(`Section '${sectionId}' deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── move_requirement ────────────────────────────────────────
  server.tool(
    "move_requirement",
    "Move a requirement to a different document and/or section. Provide the target section ID — the requirement will be reassigned to that section (and its parent document).",
    {
      requirementId: z.string().describe("Requirement node ID"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      targetDocumentSlug: z
        .string()
        .describe("Destination document slug"),
      targetSectionId: z
        .string()
        .optional()
        .describe(
          "Destination section ID. If omitted, the first section of the target document is used.",
        ),
    },
    async ({ requirementId, project, tenant, targetDocumentSlug, targetSectionId }) => {
      try {
        let sectionId = targetSectionId;

        // If no section specified, find the first section of the target document
        if (!sectionId) {
          const secData = await client.get<{
            sections: Array<{ id: string; name?: string; order?: number }>;
          }>(`/sections/${tenant}/${project}/${targetDocumentSlug}`);

          const sections = secData.sections ?? [];
          if (sections.length === 0) {
            return ok(
              `Document '${targetDocumentSlug}' has no sections. ` +
                `Create a section first with create_section, then move the requirement into it.`,
            );
          }
          // Pick the section with lowest order
          sections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          sectionId = sections[0].id;
        }

        const data = await client.patch<{
          requirement: { id: string; ref?: string; text?: string };
        }>(`/requirements/${tenant}/${project}/${requirementId}`, {
          sectionId,
        });

        const req = data.requirement;
        return ok(
          `Requirement moved.\n\n` +
            `- **Ref:** ${req.ref ?? requirementId}\n` +
            `- **Target document:** ${targetDocumentSlug}\n` +
            `- **Target section:** ${sectionId}\n`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
