import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable, truncate } from "../format.js";
// Note: Markdown export is available via export_requirements(format: "markdown")

export function registerDocumentsTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_documents",
    "List all documents in a project (structured requirement documents and surrogate references)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          documents: Array<{
            slug: string;
            name: string;
            description?: string;
            type?: string;
            kind?: string;
            shortCode?: string;
          }>;
        }>(`/documents/${tenant}/${project}`);
        const docs = data.documents ?? [];
        if (docs.length === 0) return ok("No documents found.");
        const rows = docs.map(d => {
          const type = d.kind ?? d.type ?? "structured";
          const subtype = inferSubtype(d.slug, type, d.description);
          return [
            d.slug,
            d.name,
            type,
            subtype,
            d.shortCode ?? "",
            truncate(d.description ?? "", 60),
          ];
        });
        return ok(formatTable(["Slug", "Name", "Type", "Subtype", "Code", "Description"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "get_document_sections",
    "Get a document's complete content: all sections with their requirements, info blocks, and references. This is the best tool for understanding a document's structure.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z.string().describe("Document slug"),
    },
    async ({ tenant, project, documentSlug }) => {
      try {
        const data = await client.get<{
          sections: Array<{
            id: string;
            title?: string;
            name?: string;
            description?: string;
            order?: number;
            shortCode?: string;
            requirements?: Array<{ ref: string; text: string; qaScore?: number }>;
            infos?: Array<{ id: string; text: string; title?: string }>;
            surrogates?: Array<{ id: string; slug: string; caption?: string }>;
          }>;
        }>(`/sections/${tenant}/${project}/${documentSlug}/full`);

        const sections = data.sections ?? [];
        if (sections.length === 0) return ok("Document has no sections.");

        const lines: string[] = [`## Document: ${documentSlug}\n`];

        for (const section of sections) {
          const sectionTitle = section.title ?? section.name ?? "Untitled";
          const code = section.shortCode ? ` (${section.shortCode})` : "";
          lines.push(`### ${sectionTitle}${code}\n`);

          if (section.requirements?.length) {
            for (const r of section.requirements) {
              const score = r.qaScore != null ? ` (QA: ${r.qaScore}/100)` : "";
              lines.push(`- **${r.ref}**${score}: ${r.text}`);
            }
            lines.push("");
          }

          if (section.infos?.length) {
            for (const info of section.infos) {
              const title = info.title ? `**${info.title}**: ` : "";
              lines.push(`- [INFO] ${title}${truncate(info.text, 200)}`);
            }
            lines.push("");
          }

          if (section.surrogates?.length) {
            for (const s of section.surrogates) {
              lines.push(`- [REF] ${s.slug}${s.caption ? `: ${s.caption}` : ""}`);
            }
            lines.push("");
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

}

function inferSubtype(slug: string, kind: string, description?: string): string {
  if (kind === "surrogate") {
    if (slug.startsWith("imagine-")) return "imagine";
    if (description && /ai-generated visualization/i.test(description)) return "imagine";
    return "surrogate";
  }
  return "requirements";
}
