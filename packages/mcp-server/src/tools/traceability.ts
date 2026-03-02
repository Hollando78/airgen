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
    "Create one or more traceability links. For single: provide source/target/linkType directly. For batch: provide the batch array.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      sourceRequirementId: z.string().optional().describe("Source requirement ID (single mode)"),
      targetRequirementId: z.string().optional().describe("Target requirement ID (single mode)"),
      linkType: z.enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"])
        .optional()
        .describe("Type of traceability relationship (single mode)"),
      description: z.string().optional().describe("Optional description (single mode)"),
      batch: z
        .array(
          z.object({
            sourceRequirementId: z.string(),
            targetRequirementId: z.string(),
            linkType: z.enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"]),
            description: z.string().optional(),
          }),
        )
        .optional()
        .describe("Batch mode: array of trace links to create"),
    },
    async ({ tenant, projectKey, sourceRequirementId, targetRequirementId, linkType, description, batch }) => {
      try {
        // Batch mode
        if (batch && batch.length > 0) {
          let created = 0;
          const errors: Array<{ index: number; error: string }> = [];

          for (let i = 0; i < batch.length; i++) {
            const link = batch[i];
            try {
              await client.post("/trace-links", {
                tenant,
                projectKey,
                sourceRequirementId: link.sourceRequirementId,
                targetRequirementId: link.targetRequirementId,
                linkType: link.linkType,
                description: link.description,
              });
              created++;
            } catch (err) {
              errors.push({ index: i, error: err instanceof Error ? err.message : String(err) });
            }
          }

          const lines = [
            `## Batch Trace Link Results\n`,
            `- **Created:** ${created}`,
            `- **Failed:** ${errors.length}`,
          ];
          if (errors.length > 0) {
            lines.push(`\n### Errors\n`);
            for (const e of errors) {
              const link = batch[e.index];
              lines.push(`- Link ${e.index} (${link.sourceRequirementId} → ${link.targetRequirementId}): ${e.error}`);
            }
          }
          return ok(lines.join("\n"));
        }

        // Single mode
        if (!sourceRequirementId || !targetRequirementId || !linkType) {
          return ok("Provide sourceRequirementId, targetRequirementId, and linkType for single creation, or batch for multiple.");
        }
        const args = { tenant, projectKey, sourceRequirementId, targetRequirementId, linkType, description };
        const data = await client.post<{ traceLink: Record<string, unknown> }>("/trace-links", args);
        const link = data.traceLink;
        return ok(
          `Trace link created: ${(link as any).sourceRef ?? sourceRequirementId} ` +
          `—[${linkType}]→ ${(link as any).targetRef ?? targetRequirementId}`,
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
          l.id,
          l.sourceDocumentSlug,
          "↔",
          l.targetDocumentSlug,
          l.defaultLinkType ?? "",
          String(l.linkCount ?? "?"),
        ]);
        return ok(formatTable(["ID", "Source Doc", "", "Target Doc", "Default Type", "Links"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "manage_linkset",
    "Create or delete a document linkset. A linkset must exist between two documents before cross-document trace links can be created. Action 'create' requires sourceDocumentSlug and targetDocumentSlug. Action 'delete' requires linksetId.",
    {
      action: z.enum(["create", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      sourceDocumentSlug: z
        .string()
        .optional()
        .describe("(create) Source document slug"),
      targetDocumentSlug: z
        .string()
        .optional()
        .describe("(create) Target document slug"),
      defaultLinkType: z
        .enum(["satisfies", "derives", "verifies", "implements", "refines", "conflicts"])
        .optional()
        .describe("(create) Default link type for new links in this linkset"),
      linksetId: z
        .string()
        .optional()
        .describe("(delete) Linkset ID to delete"),
    },
    async ({ action, tenant, project, sourceDocumentSlug, targetDocumentSlug, defaultLinkType, linksetId }) => {
      try {
        switch (action) {
          case "create": {
            if (!sourceDocumentSlug || !targetDocumentSlug) {
              return ok("create requires 'sourceDocumentSlug' and 'targetDocumentSlug'.");
            }
            const body: Record<string, unknown> = {
              sourceDocumentSlug,
              targetDocumentSlug,
            };
            if (defaultLinkType) body.defaultLinkType = defaultLinkType;

            const data = await client.post<{
              linkset: {
                id: string;
                sourceDocumentSlug: string;
                targetDocumentSlug: string;
                defaultLinkType?: string;
                linkCount?: number;
              };
            }>(`/linksets/${tenant}/${project}`, body);

            const ls = data.linkset;
            return ok(
              `Linkset created.\n\n` +
                `- **ID:** ${ls.id}\n` +
                `- **Source:** ${ls.sourceDocumentSlug}\n` +
                `- **Target:** ${ls.targetDocumentSlug}\n` +
                (ls.defaultLinkType ? `- **Default type:** ${ls.defaultLinkType}\n` : ""),
            );
          }

          case "delete": {
            if (!linksetId) return ok("delete requires 'linksetId'.");
            await client.delete(`/linksets/${tenant}/${project}/${linksetId}`);
            return ok(`Linkset '${linksetId}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
