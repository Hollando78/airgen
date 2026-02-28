import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

export function registerActivityTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_activity",
    "Get the activity timeline for a project: recent changes, who made them, and what was modified. Useful for understanding recent changes.",
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

  server.tool(
    "get_graph_data",
    "Get the full knowledge graph for a project — all nodes (requirements, documents, blocks, etc.) and their relationships. Useful for understanding the complete project structure and traceability.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          nodes: Array<{ id: string; label: string; type: string; properties?: Record<string, unknown> }>;
          relationships: Array<{ id: string; source: string; target: string; type: string }>;
        }>("/graph/data", { tenant, project });

        const nodes = data.nodes ?? [];
        const rels = data.relationships ?? [];

        // Group nodes by type
        const byType = new Map<string, number>();
        for (const n of nodes) {
          byType.set(n.type, (byType.get(n.type) ?? 0) + 1);
        }

        const lines: string[] = [
          `## Project Graph\n`,
          `**${nodes.length} nodes, ${rels.length} relationships**\n`,
          `### Node Types`,
        ];
        for (const [type, count] of byType) {
          lines.push(`- ${type}: ${count}`);
        }

        // Group relationships by type
        const relByType = new Map<string, number>();
        for (const r of rels) {
          relByType.set(r.type, (relByType.get(r.type) ?? 0) + 1);
        }

        lines.push(`\n### Relationship Types`);
        for (const [type, count] of relByType) {
          lines.push(`- ${type}: ${count}`);
        }

        // List some nodes
        if (nodes.length <= 50) {
          lines.push(`\n### All Nodes`);
          for (const n of nodes) {
            lines.push(`- [${n.type}] ${n.label} (${n.id})`);
          }
        } else {
          lines.push(`\n_${nodes.length} nodes total. Graph is large — use other tools to explore specific areas._`);
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
