import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatRequirement, formatRequirementList } from "../format.js";

export function registerRequirementsTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "list_requirements",
    "List requirements for a project. Returns ref, text snippet, pattern, QA score. Supports pagination.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 25)"),
      sortBy: z.enum(["ref", "createdAt", "qaScore"]).optional().describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    },
    async ({ tenant, project, page, limit, sortBy, sortOrder }) => {
      try {
        const data = await client.get<{
          data: Array<Record<string, unknown>>;
          meta: { totalItems: number; currentPage: number; pageSize: number; totalPages: number };
        }>(`/requirements/${tenant}/${project}`, {
          page: page ?? 1,
          limit: limit ?? 25,
          sortBy,
          sortOrder,
        });
        return ok(formatRequirementList(data.data as any[], data.meta));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "get_requirement",
    "Get full details of a specific requirement by its reference ID (e.g. REQ-001)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      ref: z.string().describe("Requirement reference (e.g. REQ-001)"),
    },
    async ({ tenant, project, ref }) => {
      try {
        const data = await client.get<{ record: Record<string, unknown> }>(`/requirements/${tenant}/${project}/${ref}`);
        const req = data.record ?? data;
        return ok(formatRequirement(req as any));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "create_requirement",
    "Create a new requirement in a project. Returns the created requirement with its generated reference ID.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      text: z.string().describe("Requirement text (e.g. 'The system shall...')"),
      pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional()
        .describe("EARS requirement pattern"),
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional()
        .describe("Verification method"),
      documentSlug: z.string().optional().describe("Assign to this document"),
      sectionId: z.string().optional().describe("Assign to this section within the document"),
      tags: z.array(z.string()).optional().describe("Tags to attach"),
    },
    async (args) => {
      try {
        const data = await client.post<{ requirement?: Record<string, unknown>; record?: Record<string, unknown> }>("/requirements", args);
        const req = data.requirement ?? data.record ?? data;
        return ok("Requirement created:\n\n" + formatRequirement(req as any));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "update_requirement",
    "Update an existing requirement's text, pattern, verification method, or other fields",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().describe("Requirement node ID"),
      text: z.string().optional().describe("New requirement text"),
      pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional()
        .describe("New EARS pattern"),
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional()
        .describe("New verification method"),
      rationale: z.string().optional().describe("Rationale for the requirement"),
      complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional()
        .describe("Compliance status"),
      complianceRationale: z.string().optional().describe("Compliance rationale"),
      sectionId: z.string().optional().describe("Move to a different section"),
      tags: z.array(z.string()).optional().describe("Tags to attach to the requirement"),
    },
    async ({ tenant, project, requirementId, ...updates }) => {
      try {
        const data = await client.patch<{ requirement?: Record<string, unknown>; record?: Record<string, unknown> }>(
          `/requirements/${tenant}/${project}/${requirementId}`,
          updates,
        );
        const req = data.requirement ?? data.record ?? data;
        return ok("Requirement updated:\n\n" + formatRequirement(req as any));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "delete_requirement",
    "Soft-delete a requirement (can be restored later by an admin)",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().describe("Requirement node ID"),
    },
    async ({ tenant, project, requirementId }) => {
      try {
        await client.delete(`/requirements/${tenant}/${project}/${requirementId}`);
        return ok(`Requirement ${requirementId} deleted.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "get_requirement_history",
    "Get the version history of a requirement, showing all changes over time",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().describe("Requirement node ID"),
    },
    async ({ tenant, project, requirementId }) => {
      try {
        const data = await client.get<{
          history: Array<{
            versionNumber: number;
            text: string;
            changedBy?: string;
            timestamp?: string;
            changeType?: string;
            changeDescription?: string;
          }>;
        }>(`/requirements/${tenant}/${project}/${requirementId}/history`);
        const versions = data.history ?? [];
        if (versions.length === 0) return ok("No version history found.");

        const lines = versions.map(v =>
          `**v${v.versionNumber}** (${v.changeType ?? "edit"}) by ${v.changedBy ?? "unknown"} at ${v.timestamp ?? "?"}\n${v.text}${v.changeDescription ? `\n_${v.changeDescription}_` : ""}`,
        );
        return ok(`## Version History (${versions.length} versions)\n\n${lines.join("\n\n---\n\n")}`);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
