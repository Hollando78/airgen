import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable, truncate } from "../format.js";

export function registerBaselinesTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_baselines",
    "List all baseline snapshots for a project. Baselines capture the state of all requirements at a point in time.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          items?: Array<{
            id: string;
            ref: string;
            label?: string | null;
            author?: string | null;
            createdAt?: string;
            requirementRefs?: string[];
            requirementVersionCount?: number;
          }>;
          baselines?: Array<{
            id: string;
            ref: string;
            label?: string | null;
            author?: string | null;
            createdAt?: string;
            requirementRefs?: string[];
            requirementVersionCount?: number;
          }>;
        }>(`/baselines/${tenant}/${project}`);

        const baselines = data.items ?? data.baselines ?? [];
        if (baselines.length === 0) return ok("No baselines found.");

        const rows = baselines.map(b => [
          b.ref,
          b.label ?? "",
          b.author ?? "",
          b.createdAt ?? "",
          String(b.requirementVersionCount ?? b.requirementRefs?.length ?? "?"),
        ]);
        return ok(formatTable(["Ref", "Label", "Author", "Created", "Requirements"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "create_baseline",
    "Create a new baseline snapshot of the current project state. Captures all requirements, documents, trace links, and architecture at this point in time.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      label: z.string().optional().describe("Human-readable label for this baseline (e.g. 'Sprint 5 Release')"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          baseline: {
            id?: string;
            ref: string;
            label?: string | null;
            author?: string | null;
            createdAt?: string;
            requirementVersionCount?: number;
          };
        }>("/baseline", args);
        const b = data.baseline;
        const reqCount = b.requirementVersionCount != null ? `, ${b.requirementVersionCount} requirements captured` : "";
        return ok(`Baseline created: **${b.ref}**${b.label ? ` — ${b.label}` : ""} at ${b.createdAt ?? "now"}${reqCount}`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "compare_baselines",
    "Compare two baselines to see what changed between them (added, modified, and removed requirements)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      fromRef: z.string().describe("Earlier baseline reference (e.g. BL-PROJ-001)"),
      toRef: z.string().describe("Later baseline reference (e.g. BL-PROJ-002)"),
    },
    async ({ tenant, project, fromRef, toRef }) => {
      try {
        const data = await client.get<{
          fromBaseline?: { ref: string; label?: string };
          toBaseline?: { ref: string; label?: string };
          requirements?: {
            added?: Array<{ requirementId?: string; text?: string }>;
            modified?: Array<{ requirementId?: string; text?: string }>;
            removed?: Array<{ requirementId?: string; text?: string }>;
            unchanged?: Array<{ requirementId?: string }>;
          };
        }>(`/baselines/${tenant}/${project}/compare`, { from: fromRef, to: toRef });

        // Extract short ref from fully-qualified requirementId (e.g. "tenant:project:REQ-001" → "REQ-001")
        const shortRef = (id?: string) => id?.split(":").pop() ?? "?";

        const from = data.fromBaseline?.ref ?? fromRef;
        const to = data.toBaseline?.ref ?? toRef;
        const reqs = data.requirements ?? {};
        const added = reqs.added ?? [];
        const modified = reqs.modified ?? [];
        const removed = reqs.removed ?? [];
        const unchanged = reqs.unchanged ?? [];

        const lines: string[] = [`## Baseline Comparison: ${from} → ${to}\n`];
        lines.push(`**Summary:** ${added.length} added, ${modified.length} modified, ${removed.length} removed, ${unchanged.length} unchanged\n`);

        if (added.length > 0) {
          lines.push(`### Added`);
          for (const r of added) lines.push(`- **${shortRef(r.requirementId)}**: ${truncate(r.text ?? "", 150)}`);
          lines.push("");
        }

        if (modified.length > 0) {
          lines.push(`### Modified`);
          for (const r of modified) lines.push(`- **${shortRef(r.requirementId)}**: ${truncate(r.text ?? "", 150)}`);
          lines.push("");
        }

        if (removed.length > 0) {
          lines.push(`### Removed`);
          for (const r of removed) lines.push(`- **${shortRef(r.requirementId)}**: ${truncate(r.text ?? "", 150)}`);
          lines.push("");
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
