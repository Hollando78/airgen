import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

export function registerActivityTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_activity",
    "Get the activity timeline for a project: recent changes, who made them, and what was modified.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      limit: z.number().optional().describe("Max events to return (default 20)"),
      activityType: z.string().optional().describe("Filter by type: requirement, document, diagram, trace_link, baseline"),
      actionType: z.string().optional().describe("Filter by action: created, updated, deleted, archived"),
    },
    async ({ tenant, project, limit, activityType, actionType }) => {
      try {
        const data = await client.get<{
          events: Array<{
            id: string;
            activityType: string;
            actionType: string;
            entityRef?: string;
            entityName?: string;
            userName?: string;
            timestamp?: string;
            description?: string;
          }>;
          total?: number;
          hasMore?: boolean;
        }>("/activity", {
          tenantSlug: tenant,
          projectSlug: project,
          limit: limit ?? 20,
          activityTypes: activityType,
          actionTypes: actionType,
        });

        const events = data.events ?? [];
        if (events.length === 0) return ok("No activity found.");

        const total = data.total ?? events.length;
        const lines: string[] = [`## Recent Activity (${events.length} of ${total} events)\n`];
        for (const e of events) {
          const who = e.userName ?? "unknown";
          const what = e.entityRef ?? e.entityName ?? "";
          const desc = e.description ? ` — ${truncate(e.description, 100)}` : "";
          lines.push(`- **${e.actionType}** ${e.activityType} ${what} by ${who} (${e.timestamp ?? "?"})${desc}`);
        }
        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
