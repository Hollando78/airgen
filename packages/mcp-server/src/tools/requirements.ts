import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatRequirement, formatRequirementList, truncate } from "../format.js";

const EARS_PATTERNS = ["ubiquitous", "event", "state", "unwanted", "optional"] as const;
const VERIFICATION_METHODS = ["Test", "Analysis", "Inspection", "Demonstration"] as const;

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
    "Create one or more requirements. For single: provide text directly. For batch: provide the batch array instead.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      text: z.string().optional().describe("Requirement text for single creation"),
      pattern: z.enum(EARS_PATTERNS).optional().describe("EARS requirement pattern"),
      verification: z.enum(VERIFICATION_METHODS).optional().describe("Verification method"),
      documentSlug: z.string().optional().describe("Assign to this document"),
      sectionId: z.string().optional().describe("Assign to this section"),
      tags: z.array(z.string()).optional().describe("Tags to attach"),
      batch: z
        .array(
          z.object({
            text: z.string(),
            pattern: z.enum(EARS_PATTERNS).optional(),
            verification: z.enum(VERIFICATION_METHODS).optional(),
            documentSlug: z.string().optional(),
            sectionId: z.string().optional(),
            tags: z.array(z.string()).optional(),
          }),
        )
        .optional()
        .describe("Batch mode: array of requirements to create. Overrides single-item params."),
    },
    async ({ tenant, projectKey, text, pattern, verification, documentSlug, sectionId, tags, batch }) => {
      try {
        // Batch mode
        if (batch && batch.length > 0) {
          const created: Array<{ ref?: string; text?: string; qaScore?: number }> = [];
          const errors: Array<{ index: number; error: string }> = [];

          for (let i = 0; i < batch.length; i++) {
            const r = batch[i];
            try {
              const body: Record<string, unknown> = { tenant, projectKey, text: r.text };
              if (r.pattern) body.pattern = r.pattern;
              if (r.verification) body.verification = r.verification;
              if (r.tags) body.tags = r.tags;
              if (r.documentSlug) body.documentSlug = r.documentSlug;
              if (r.sectionId) body.sectionId = r.sectionId;

              const data = await client.post<{ requirement: Record<string, unknown> }>("/requirements", body);
              created.push(data.requirement as any);
            } catch (err) {
              errors.push({ index: i, error: err instanceof Error ? err.message : String(err) });
            }
          }

          const lines = [
            `## Batch Create Results\n`,
            `- **Created:** ${created.length}`,
            `- **Failed:** ${errors.length}`,
            `- **Total:** ${batch.length}\n`,
          ];
          if (created.length > 0) {
            lines.push(`### Created\n`);
            for (const r of created) {
              const score = r.qaScore != null ? ` (QA: ${r.qaScore})` : "";
              lines.push(`- **${r.ref ?? "?"}**${score}: ${truncate(r.text ?? "", 100)}`);
            }
          }
          if (errors.length > 0) {
            lines.push(`\n### Errors\n`);
            for (const e of errors) lines.push(`- Row ${e.index}: ${e.error}`);
          }
          return ok(lines.join("\n"));
        }

        // Single mode
        if (!text) return ok("Provide 'text' for single creation or 'batch' for multiple.");
        const args: Record<string, unknown> = { tenant, projectKey, text };
        if (pattern) args.pattern = pattern;
        if (verification) args.verification = verification;
        if (documentSlug) args.documentSlug = documentSlug;
        if (sectionId) args.sectionId = sectionId;
        if (tags) args.tags = tags;

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
    "Update one or more requirements. For single: provide requirementId + fields. For batch: provide the batch array.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().optional().describe("Requirement node ID (single mode)"),
      text: z.string().optional().describe("New requirement text"),
      pattern: z.enum(EARS_PATTERNS).optional().describe("New EARS pattern"),
      verification: z.enum(VERIFICATION_METHODS).optional().describe("New verification method"),
      rationale: z.string().optional().describe("Rationale"),
      complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
      complianceRationale: z.string().optional(),
      sectionId: z.string().optional().describe("Move to a different section"),
      tags: z.array(z.string()).optional(),
      batch: z
        .array(
          z.object({
            requirementId: z.string(),
            text: z.string().optional(),
            pattern: z.enum(EARS_PATTERNS).optional(),
            verification: z.enum(VERIFICATION_METHODS).optional(),
            tags: z.array(z.string()).optional(),
            complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
            complianceRationale: z.string().optional(),
            rationale: z.string().optional(),
            sectionId: z.string().optional(),
          }),
        )
        .optional()
        .describe("Batch mode: array of updates. Each must include requirementId."),
    },
    async ({ tenant, project, requirementId, batch, ...updates }) => {
      try {
        // Batch mode
        if (batch && batch.length > 0) {
          let updated = 0;
          const errors: Array<{ requirementId: string; error: string }> = [];

          for (const u of batch) {
            try {
              const body: Record<string, unknown> = {};
              if (u.text !== undefined) body.text = u.text;
              if (u.pattern !== undefined) body.pattern = u.pattern;
              if (u.verification !== undefined) body.verification = u.verification;
              if (u.tags !== undefined) body.tags = u.tags;
              if (u.complianceStatus !== undefined) body.complianceStatus = u.complianceStatus;
              if (u.complianceRationale !== undefined) body.complianceRationale = u.complianceRationale;
              if (u.rationale !== undefined) body.rationale = u.rationale;
              if (u.sectionId !== undefined) body.sectionId = u.sectionId;

              await client.patch(`/requirements/${tenant}/${project}/${u.requirementId}`, body);
              updated++;
            } catch (err) {
              errors.push({
                requirementId: u.requirementId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          const lines = [
            `## Batch Update Results\n`,
            `- **Updated:** ${updated}`,
            `- **Failed:** ${errors.length}`,
          ];
          if (errors.length > 0) {
            lines.push(`\n### Errors\n`);
            for (const e of errors) lines.push(`- ${e.requirementId}: ${e.error}`);
          }
          return ok(lines.join("\n"));
        }

        // Single mode
        if (!requirementId) return ok("Provide 'requirementId' for single update or 'batch' for multiple.");
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
    "Soft-delete one or more requirements. For single: provide requirementId. For batch: provide requirementIds array.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().optional().describe("Single requirement node ID"),
      requirementIds: z
        .array(z.string())
        .optional()
        .describe("Batch mode: array of requirement node IDs to delete"),
    },
    async ({ tenant, project, requirementId, requirementIds }) => {
      try {
        // Batch mode
        if (requirementIds && requirementIds.length > 0) {
          let deleted = 0;
          const errors: Array<{ requirementId: string; error: string }> = [];

          for (const id of requirementIds) {
            try {
              await client.delete(`/requirements/${tenant}/${project}/${id}`);
              deleted++;
            } catch (err) {
              errors.push({
                requirementId: id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          const lines = [
            `## Batch Delete Results\n`,
            `- **Deleted:** ${deleted}`,
            `- **Failed:** ${errors.length}`,
          ];
          if (errors.length > 0) {
            lines.push(`\n### Errors\n`);
            for (const e of errors) lines.push(`- ${e.requirementId}: ${e.error}`);
          }
          return ok(lines.join("\n"));
        }

        // Single mode
        if (!requirementId) return ok("Provide 'requirementId' or 'requirementIds'.");
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
