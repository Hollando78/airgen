import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable } from "../format.js";

export function registerNavigationTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_tenants",
    "List all tenants (organizations) you have access to in AIRGen",
    {},
    async () => {
      try {
        const data = await client.get<{ tenants: Array<{ slug: string; name?: string; createdAt?: string }> }>("/tenants");
        const tenants = data.tenants ?? [];
        if (tenants.length === 0) return ok("No tenants found.");
        const rows = tenants.map(t => [t.slug, t.name ?? t.slug, t.createdAt ?? ""]);
        return ok(formatTable(["Slug", "Name", "Created"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "list_projects",
    "List all projects within a tenant, with requirement counts",
    { tenant: z.string().describe("Tenant slug") },
    async ({ tenant }) => {
      try {
        const data = await client.get<{
          projects: Array<{
            slug: string;
            name?: string;
            key?: string;
            requirementCount?: number;
            documentCount?: number;
          }>;
        }>(`/tenants/${tenant}/projects`);
        const projects = data.projects ?? [];
        if (projects.length === 0) return ok(`No projects found in tenant "${tenant}".`);
        const rows = projects.map(p => [
          p.slug,
          p.name ?? p.slug,
          String(p.requirementCount ?? 0),
          String(p.documentCount ?? 0),
        ]);
        return ok(formatTable(["Slug", "Name", "Requirements", "Documents"], rows));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
