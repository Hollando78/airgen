import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

const EARS_PATTERNS = ["ubiquitous", "event", "state", "unwanted", "optional"] as const;
const VERIFICATION_METHODS = ["Test", "Analysis", "Inspection", "Demonstration"] as const;
const LINK_TYPES = [
  "satisfies",
  "derives",
  "verifies",
  "implements",
  "refines",
  "conflicts",
] as const;

interface ReqResult {
  id?: string;
  ref?: string;
  text?: string;
  qaScore?: number;
}

export function registerBulkOperationsTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── bulk_create_requirements ────────────────────────────────
  server.tool(
    "bulk_create_requirements",
    "Create multiple requirements in a single call. Essential for import workflows and AI generation at scale.",
    {
      projectKey: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      requirements: z
        .array(
          z.object({
            text: z.string().describe("Requirement text"),
            pattern: z.enum(EARS_PATTERNS).optional(),
            verification: z.enum(VERIFICATION_METHODS).optional(),
            tags: z.array(z.string()).optional(),
            documentSlug: z.string().optional().describe("Assign to this document"),
            sectionId: z.string().optional().describe("Assign to this section"),
          }),
        )
        .describe("Array of requirements to create"),
    },
    async ({ projectKey, tenant, requirements }) => {
      try {
        const created: ReqResult[] = [];
        const errors: Array<{ index: number; error: string }> = [];

        for (let i = 0; i < requirements.length; i++) {
          const r = requirements[i];
          try {
            const body: Record<string, unknown> = {
              tenant,
              projectKey,
              text: r.text,
            };
            if (r.pattern) body.pattern = r.pattern;
            if (r.verification) body.verification = r.verification;
            if (r.tags) body.tags = r.tags;
            if (r.documentSlug) body.documentSlug = r.documentSlug;
            if (r.sectionId) body.sectionId = r.sectionId;

            const data = await client.post<{ requirement: ReqResult }>(
              "/requirements",
              body,
            );
            created.push(data.requirement);
          } catch (err) {
            errors.push({
              index: i,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const lines: string[] = [
          `## Bulk Create Results\n`,
          `- **Created:** ${created.length}`,
          `- **Failed:** ${errors.length}`,
          `- **Total:** ${requirements.length}\n`,
        ];

        if (created.length > 0) {
          lines.push(`### Created Requirements\n`);
          for (const r of created) {
            const score = r.qaScore != null ? ` (QA: ${r.qaScore})` : "";
            lines.push(`- **${r.ref ?? "?"}**${score}: ${truncate(r.text ?? "", 100)}`);
          }
        }

        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors) {
            lines.push(`- Row ${e.index}: ${e.error}`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── bulk_update_requirements ────────────────────────────────
  server.tool(
    "bulk_update_requirements",
    "Batch-update multiple requirements. Useful for tagging, changing verification methods, or updating compliance status across a set.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      updates: z
        .array(
          z.object({
            requirementId: z.string().describe("Requirement node ID"),
            text: z.string().optional(),
            pattern: z.enum(EARS_PATTERNS).optional(),
            verification: z.enum(VERIFICATION_METHODS).optional(),
            tags: z.array(z.string()).optional(),
            complianceStatus: z
              .enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"])
              .optional(),
            complianceRationale: z.string().optional(),
            rationale: z.string().optional(),
            sectionId: z.string().optional(),
          }),
        )
        .describe("Array of updates"),
    },
    async ({ project, tenant, updates }) => {
      try {
        let updated = 0;
        const errors: Array<{ requirementId: string; error: string }> = [];

        for (const u of updates) {
          try {
            const body: Record<string, unknown> = {};
            if (u.text !== undefined) body.text = u.text;
            if (u.pattern !== undefined) body.pattern = u.pattern;
            if (u.verification !== undefined) body.verification = u.verification;
            if (u.tags !== undefined) body.tags = u.tags;
            if (u.complianceStatus !== undefined)
              body.complianceStatus = u.complianceStatus;
            if (u.complianceRationale !== undefined)
              body.complianceRationale = u.complianceRationale;
            if (u.rationale !== undefined) body.rationale = u.rationale;
            if (u.sectionId !== undefined) body.sectionId = u.sectionId;

            await client.patch(
              `/requirements/${tenant}/${project}/${u.requirementId}`,
              body,
            );
            updated++;
          } catch (err) {
            errors.push({
              requirementId: u.requirementId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const lines = [
          `## Bulk Update Results\n`,
          `- **Updated:** ${updated}`,
          `- **Failed:** ${errors.length}`,
        ];

        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors) {
            lines.push(`- ${e.requirementId}: ${e.error}`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── bulk_delete_requirements ────────────────────────────────
  server.tool(
    "bulk_delete_requirements",
    "Batch soft-delete multiple requirements.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      requirementIds: z
        .array(z.string())
        .describe("Array of requirement node IDs to delete"),
    },
    async ({ project, tenant, requirementIds }) => {
      try {
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
          `## Bulk Delete Results\n`,
          `- **Deleted:** ${deleted}`,
          `- **Failed:** ${errors.length}`,
        ];

        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors) {
            lines.push(`- ${e.requirementId}: ${e.error}`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── bulk_create_trace_links ─────────────────────────────────
  server.tool(
    "bulk_create_trace_links",
    "Create multiple trace links in one call. Essential for establishing traceability between document levels.",
    {
      projectKey: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      links: z
        .array(
          z.object({
            sourceRequirementId: z.string(),
            targetRequirementId: z.string(),
            linkType: z.enum(LINK_TYPES),
            description: z.string().optional(),
          }),
        )
        .describe("Array of trace links to create"),
    },
    async ({ projectKey, tenant, links }) => {
      try {
        let created = 0;
        const errors: Array<{ index: number; error: string }> = [];

        for (let i = 0; i < links.length; i++) {
          const link = links[i];
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
            errors.push({
              index: i,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const lines = [
          `## Bulk Trace Link Results\n`,
          `- **Created:** ${created}`,
          `- **Failed:** ${errors.length}`,
        ];

        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors) {
            const link = links[e.index];
            lines.push(
              `- Link ${e.index} (${link.sourceRequirementId} → ${link.targetRequirementId}): ${e.error}`,
            );
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
