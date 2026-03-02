import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError } from "../format.js";

interface ProjectRecord {
  slug: string;
  name?: string;
  description?: string;
  code?: string;
  key?: string;
  tenantSlug?: string;
  createdAt?: string;
  requirementCount?: number;
}

function formatProject(p: ProjectRecord): string {
  return (
    `- **Slug:** ${p.slug}\n` +
    `- **Name:** ${p.name ?? p.slug}\n` +
    (p.code ? `- **Code:** ${p.code}\n` : "") +
    (p.key ? `- **Key:** ${p.key}\n` : "") +
    (p.description ? `- **Description:** ${p.description}\n` : "") +
    `- **Requirements:** ${p.requirementCount ?? 0}\n`
  );
}

export function registerProjectManagementTools(
  server: McpServer,
  client: AirgenClient,
) {
  server.tool(
    "manage_project",
    "Create, update, or delete a project. Action 'create' requires tenant and slug (or name to auto-derive slug). Action 'update' requires tenant and project slug. Action 'delete' requires tenant and project slug.",
    {
      action: z.enum(["create", "update", "delete"]).describe("Operation to perform"),
      tenant: z.string().describe("Tenant slug"),
      project: z
        .string()
        .optional()
        .describe("(update, delete) Project slug to modify"),
      slug: z
        .string()
        .optional()
        .describe("(create) Project slug. If omitted, auto-derived from name."),
      name: z
        .string()
        .optional()
        .describe("(create) Project name, or (update) new name"),
      key: z
        .string()
        .optional()
        .describe("(create, update) Project key (e.g. 'PROJ')"),
      code: z
        .string()
        .optional()
        .describe("(create, update) Short project code"),
      description: z
        .string()
        .optional()
        .describe("(create, update) Project description"),
    },
    async ({ action, tenant, project, slug, name, key, code, description }) => {
      try {
        switch (action) {
          case "create": {
            const projectSlug =
              slug ??
              (name
                ? name
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                : undefined);
            if (!projectSlug) return ok("create requires 'slug' or 'name'.");

            const body: Record<string, unknown> = { slug: projectSlug };
            if (name) body.name = name;
            if (key) body.key = key;
            if (code) body.code = code;
            if (description) body.description = description;

            const data = await client.post<{ project?: ProjectRecord } & ProjectRecord>(
              `/tenants/${tenant}/projects`,
              body,
            );
            const p = data.project ?? data;
            return ok(`Project created.\n\n${formatProject(p)}`);
          }

          case "update": {
            if (!project) return ok("update requires 'project' (slug).");

            const body: Record<string, unknown> = {};
            if (name !== undefined) body.name = name;
            if (key !== undefined) body.key = key;
            if (code !== undefined) body.code = code;
            if (description !== undefined) body.description = description;

            const data = await client.patch<{ project?: ProjectRecord } & ProjectRecord>(
              `/tenants/${tenant}/projects/${project}`,
              body,
            );
            const p = data.project ?? data;
            return ok(`Project updated.\n\n${formatProject(p)}`);
          }

          case "delete": {
            if (!project) return ok("delete requires 'project' (slug).");
            await client.delete(`/tenants/${tenant}/projects/${project}`);
            return ok(`Project '${project}' deleted.`);
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
