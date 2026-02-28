import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, formatTable, truncate } from "../format.js";

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  pattern?: string;
  verification?: string;
  tags?: string[];
  qaScore?: number | null;
  complianceStatus?: string;
  complianceRationale?: string;
  rationale?: string;
  documentSlug?: string;
  sectionId?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  archived?: boolean;
}

interface TraceLink {
  id?: string;
  sourceRequirementId?: string;
  targetRequirementId?: string;
  linkType?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // 5000 requirements max

/** Fetch all requirements for a project (paginated). */
async function fetchAllRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
): Promise<Requirement[]> {
  const all: Requirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      items: Requirement[];
      total: number;
      pages: number;
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    all.push(...(data.items ?? []));
    if (page >= (data.pages ?? 1)) break;
  }
  return all;
}

export function registerFilteringTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── filter_requirements ─────────────────────────────────────
  server.tool(
    "filter_requirements",
    "Advanced filtering with multiple criteria. Returns paginated results. Filters are ANDed together.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter to requirements with ANY of these tags"),
      pattern: z
        .enum(["ubiquitous", "event", "state", "unwanted", "optional"])
        .optional()
        .describe("Filter by EARS pattern"),
      verification: z
        .enum(["Test", "Analysis", "Inspection", "Demonstration"])
        .optional()
        .describe("Filter by verification method"),
      complianceStatus: z
        .enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"])
        .optional()
        .describe("Filter by compliance status"),
      qaScoreMin: z.number().optional().describe("Minimum QA score (0-100)"),
      qaScoreMax: z.number().optional().describe("Maximum QA score (0-100)"),
      documentSlug: z
        .string()
        .optional()
        .describe("Filter to requirements in this document"),
      sectionId: z
        .string()
        .optional()
        .describe("Filter to requirements in this section"),
      hasTraceLinks: z
        .boolean()
        .optional()
        .describe(
          "If true, only requirements with trace links. If false, only orphans.",
        ),
      textContains: z
        .string()
        .optional()
        .describe("Text substring search (case-insensitive)"),
      sortBy: z
        .enum(["ref", "createdAt", "qaScore"])
        .optional()
        .describe("Sort field"),
      sortOrder: z.enum(["asc", "desc"]).optional(),
      page: z.number().optional().describe("Page number (default 1)"),
      limit: z.number().optional().describe("Items per page (default 25)"),
    },
    async ({
      project,
      tenant,
      tags,
      pattern,
      verification,
      complianceStatus,
      qaScoreMin,
      qaScoreMax,
      documentSlug,
      sectionId,
      hasTraceLinks,
      textContains,
      sortBy,
      sortOrder,
      page,
      limit,
    }) => {
      try {
        const resultPage = page ?? 1;
        const resultLimit = limit ?? 25;

        // If filtering by document, fetch from sections/full for efficiency
        let requirements: Requirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{
              id: string;
              requirements?: Array<Requirement>;
            }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);

          requirements = [];
          for (const sec of secData.sections ?? []) {
            for (const r of sec.requirements ?? []) {
              requirements.push({ ...r, documentSlug, sectionId: sec.id });
            }
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

        // Fetch trace links if needed
        let linkedIds: Set<string> | undefined;
        if (hasTraceLinks !== undefined) {
          const linkData = await client.get<{ traceLinks: TraceLink[] }>(
            `/trace-links/${tenant}/${project}`,
          );
          linkedIds = new Set<string>();
          for (const link of linkData.traceLinks ?? []) {
            if (link.sourceRequirementId) linkedIds.add(link.sourceRequirementId);
            if (link.targetRequirementId) linkedIds.add(link.targetRequirementId);
          }
        }

        // Apply filters
        let filtered = requirements.filter((r) => {
          if (r.deleted || r.deletedAt) return false;

          if (tags && tags.length > 0) {
            const rTags = r.tags ?? [];
            if (!tags.some((t) => rTags.includes(t))) return false;
          }
          if (pattern && r.pattern !== pattern) return false;
          if (verification && r.verification !== verification) return false;
          if (complianceStatus && r.complianceStatus !== complianceStatus)
            return false;
          if (qaScoreMin != null && (r.qaScore ?? 0) < qaScoreMin) return false;
          if (qaScoreMax != null && (r.qaScore ?? 100) > qaScoreMax) return false;
          if (sectionId && r.sectionId !== sectionId) return false;
          if (
            textContains &&
            !(r.text ?? "").toLowerCase().includes(textContains.toLowerCase())
          )
            return false;
          if (hasTraceLinks !== undefined && linkedIds) {
            const isLinked = linkedIds.has(r.id ?? "");
            if (hasTraceLinks && !isLinked) return false;
            if (!hasTraceLinks && isLinked) return false;
          }
          return true;
        });

        // Sort
        if (sortBy) {
          filtered.sort((a, b) => {
            let cmp = 0;
            if (sortBy === "ref") cmp = (a.ref ?? "").localeCompare(b.ref ?? "");
            else if (sortBy === "createdAt")
              cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
            else if (sortBy === "qaScore") cmp = (a.qaScore ?? 0) - (b.qaScore ?? 0);
            return sortOrder === "desc" ? -cmp : cmp;
          });
        }

        // Paginate
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / resultLimit));
        const start = (resultPage - 1) * resultLimit;
        const pageItems = filtered.slice(start, start + resultLimit);

        if (pageItems.length === 0) {
          return ok(`No requirements match the filter criteria. (${total} total scanned)`);
        }

        const rows = pageItems.map((r) => [
          r.ref ?? "?",
          truncate(r.text ?? "", 80),
          r.pattern ?? "",
          r.verification ?? "",
          r.qaScore != null ? String(r.qaScore) : "",
          r.complianceStatus ?? "",
          (r.tags ?? []).join(", "),
        ]);

        const header = `## Filtered Requirements (${total} matches, page ${resultPage}/${totalPages})\n\n`;
        const table = formatTable(
          ["Ref", "Text", "Pattern", "Verification", "QA", "Compliance", "Tags"],
          rows,
        );
        const footer =
          totalPages > resultPage
            ? `\n\n_Page ${resultPage} of ${totalPages}. Use page=${resultPage + 1} to see more._`
            : "";

        return ok(header + table + footer);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── list_tags ───────────────────────────────────────────────
  server.tool(
    "list_tags",
    "List all tags used in a project with their occurrence counts.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
    },
    async ({ project, tenant }) => {
      try {
        const requirements = await fetchAllRequirements(client, tenant, project);

        const tagCounts = new Map<string, number>();
        for (const r of requirements) {
          if (r.deleted || r.deletedAt) continue;
          for (const tag of r.tags ?? []) {
            tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
          }
        }

        if (tagCounts.size === 0) return ok("No tags found in this project.");

        const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
        const rows = sorted.map(([name, count]) => [name, String(count)]);

        return ok(
          `## Tags (${sorted.length} unique)\n\n` +
            formatTable(["Tag", "Count"], rows),
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
