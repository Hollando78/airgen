import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError } from "../format.js";

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
  // ── manage_document ───────────────────────────────────────────
  server.tool(
    "manage_document",
    "Create, update, or delete a document. Action 'create' requires name. Action 'update' requires documentSlug. Action 'delete' requires documentSlug.",
    {
      action: z.enum(["create", "update", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("(update, delete) Document slug to modify"),
      name: z
        .string()
        .optional()
        .describe("(create) Document name, or (update) new name"),
      code: z
        .string()
        .optional()
        .describe("(create, update) Short document code (e.g. 'SRD')"),
      description: z
        .string()
        .optional()
        .describe("(create, update) Document description"),
    },
    async ({ action, tenant, project, documentSlug, name, code, description }) => {
      try {
        switch (action) {
          case "create": {
            if (!name) return ok("create requires 'name'.");
            const body: Record<string, unknown> = {
              tenant,
              projectKey: project,
              name,
            };
            if (code) body.shortCode = code;
            if (description) body.description = description;

            const data = await client.post<{ document: DocRecord }>("/documents", body);
            const doc = data.document;
            return ok(
              `Document created.\n\n` +
                `- **Slug:** ${doc.slug}\n` +
                `- **Name:** ${doc.name}\n` +
                `- **Code:** ${doc.shortCode ?? "(none)"}\n` +
                `- **Type:** ${doc.kind ?? "structured"}\n` +
                (doc.description ? `- **Description:** ${doc.description}\n` : ""),
            );
          }

          case "update": {
            if (!documentSlug) return ok("update requires 'documentSlug'.");
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
          }

          case "delete": {
            if (!documentSlug) return ok("delete requires 'documentSlug'.");
            await client.delete(`/documents/${tenant}/${project}/${documentSlug}`);
            return ok(`Document '${documentSlug}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── manage_section ────────────────────────────────────────────
  server.tool(
    "manage_section",
    "Create, update, or delete a document section. Action 'create' requires documentSlug and title. Action 'update' requires sectionId. Action 'delete' requires sectionId.",
    {
      action: z.enum(["create", "update", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("(create) Parent document slug"),
      sectionId: z
        .string()
        .optional()
        .describe("(update, delete) Section ID"),
      title: z
        .string()
        .optional()
        .describe("(create) Section title, or (update) new title"),
      orderIndex: z
        .number()
        .optional()
        .describe("(create, update) Position within parent (0-based)"),
      description: z
        .string()
        .optional()
        .describe("(create, update) Section description"),
      shortCode: z
        .string()
        .optional()
        .describe("(create, update) Short code for requirement numbering"),
    },
    async ({
      action,
      tenant,
      project,
      documentSlug,
      sectionId,
      title,
      orderIndex,
      description,
      shortCode,
    }) => {
      try {
        switch (action) {
          case "create": {
            if (!documentSlug || !title)
              return ok("create requires 'documentSlug' and 'title'.");

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
          }

          case "update": {
            if (!sectionId) return ok("update requires 'sectionId'.");

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
          }

          case "delete": {
            if (!sectionId) return ok("delete requires 'sectionId'.");
            await client.delete(`/sections/${sectionId}`);
            return ok(`Section '${sectionId}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── move_requirement ──────────────────────────────────────────
  server.tool(
    "move_requirement",
    "Move a requirement to a different document and/or section.",
    {
      requirementId: z.string().describe("Requirement node ID"),
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      targetDocumentSlug: z.string().describe("Destination document slug"),
      targetSectionId: z
        .string()
        .optional()
        .describe("Destination section ID. If omitted, uses the first section of the target document."),
    },
    async ({ requirementId, project, tenant, targetDocumentSlug, targetSectionId }) => {
      try {
        let sectionId = targetSectionId;

        if (!sectionId) {
          const secData = await client.get<{
            sections: Array<{ id: string; name?: string; order?: number }>;
          }>(`/sections/${tenant}/${project}/${targetDocumentSlug}`);

          const sections = secData.sections ?? [];
          if (sections.length === 0) {
            return ok(
              `Document '${targetDocumentSlug}' has no sections. ` +
                `Create a section first with manage_section, then move the requirement into it.`,
            );
          }
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
