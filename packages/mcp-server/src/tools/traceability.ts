import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable } from "../format.js";

export function registerTraceabilityTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_trace_links",
    "List all traceability links in a project, or for a specific requirement. Shows source → target with link type.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().optional().describe("Filter to links for this requirement ID"),
    },
    async ({ tenant, project, requirementId }) => {
      try {
        const path = requirementId
          ? `/trace-links/${tenant}/${project}/${requirementId}`
          : `/trace-links/${tenant}/${project}`;
        const data = await client.get<{
          traceLinks: Array<{
            id: string;
            sourceRef?: string;
            targetRef?: string;
            sourceRequirementId?: string;
            targetRequirementId?: string;
            linkType: string;
            description?: string;
          }>;
        }>(path);

        const links = data.traceLinks ?? [];
        if (links.length === 0) return ok("No trace links found.");

        const rows = links.map(l => [
          l.id,
          l.sourceRef ?? l.sourceRequirementId ?? "?",
          l.linkType,
          l.targetRef ?? l.targetRequirementId ?? "?",
          l.description ?? "",
        ]);
        return ok(formatTable(["Link ID", "Source", "Link Type", "Target", "Description"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "create_trace_link",
    "Create a traceability link between two requirements. Link types: satisfies, derives, verifies, implements, refines, conflicts.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      sourceRequirementId: z.string().describe("Source requirement ID"),
      targetRequirementId: z.string().describe("Target requirement ID"),
      linkType: z.enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"])
        .describe("Type of traceability relationship"),
      description: z.string().optional().describe("Optional description of the link"),
    },
    async (args) => {
      try {
        const data = await client.post<{ traceLink: Record<string, unknown> }>("/trace-links", args);
        const link = data.traceLink;
        return ok(
          `Trace link created: ${(link as any).sourceRef ?? args.sourceRequirementId} ` +
          `—[${args.linkType}]→ ${(link as any).targetRef ?? args.targetRequirementId}`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "delete_trace_link",
    "Delete a traceability link by its ID",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      linkId: z.string().describe("Trace link ID to delete"),
    },
    async ({ tenant, project, linkId }) => {
      try {
        await client.delete(`/trace-links/${tenant}/${project}/${linkId}`);
        return ok(`Trace link ${linkId} deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "list_linksets",
    "List document linksets — organized collections of trace links between pairs of documents",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          linksets: Array<{
            id: string;
            sourceDocumentSlug: string;
            targetDocumentSlug: string;
            defaultLinkType?: string;
            linkCount?: number;
          }>;
        }>(`/linksets/${tenant}/${project}`);

        const linksets = data.linksets ?? [];
        if (linksets.length === 0) return ok("No linksets found.");

        const rows = linksets.map(l => [
          l.sourceDocumentSlug,
          "↔",
          l.targetDocumentSlug,
          l.defaultLinkType ?? "",
          String(l.linkCount ?? "?"),
        ]);
        return ok(formatTable(["Source Doc", "", "Target Doc", "Default Type", "Links"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
