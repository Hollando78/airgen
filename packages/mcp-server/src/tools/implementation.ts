/**
 * Implementation tracking tools — bridge requirements to code artifacts.
 *
 * Uses existing requirement `attributes` (JSON key-value store) and `tags`
 * (string array) fields. No backend changes needed.
 *
 * Conventions:
 * - Tags: impl:not_started, impl:in_progress, impl:implemented, impl:verified, impl:blocked
 * - Attributes:
 *   - artifacts: JSON string encoding Array<ArtifactEntry>
 *   - impl_status: status string
 *   - impl_notes: free text
 *   - impl_updated_at: ISO timestamp
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

// ── Types ────────────────────────────────────────────────────

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  qaScore?: number | null;
  documentSlug?: string;
  sectionId?: string;
  deleted?: boolean;
  deletedAt?: string | null;
}

interface ArtifactEntry {
  type: string;
  path: string;
  label?: string;
  line?: number;
}

const IMPL_STATUSES = [
  "not_started",
  "in_progress",
  "implemented",
  "verified",
  "blocked",
] as const;
type ImplStatus = (typeof IMPL_STATUSES)[number];

const IMPL_TAG_PREFIX = "impl:";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

// ── Helpers ──────────────────────────────────────────────────

async function fetchAllRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
): Promise<Requirement[]> {
  const all: Requirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
      items?: Requirement[];
      pages?: number;
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const items = data.data ?? data.items ?? [];
    all.push(...items);
    const totalPages = data.meta?.totalPages ?? data.pages ?? 1;
    if (page >= totalPages) break;
  }
  return all.filter((r) => !r.deleted && !r.deletedAt);
}

async function fetchDocRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
  documentSlug?: string,
): Promise<Requirement[]> {
  if (documentSlug) {
    const secData = await client.get<{
      sections: Array<{ requirements?: Requirement[] }>;
    }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
    const reqs: Requirement[] = [];
    for (const sec of secData.sections ?? []) {
      reqs.push(...(sec.requirements ?? []));
    }
    return reqs;
  }
  return fetchAllRequirements(client, tenant, project);
}

async function fetchRequirementById(
  client: AirgenClient,
  tenant: string,
  project: string,
  requirementId: string,
): Promise<Requirement | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
      items?: Requirement[];
      pages?: number;
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const items = data.data ?? data.items ?? [];
    const found = items.find((r) => r.id === requirementId);
    if (found) return found;
    const totalPages = data.meta?.totalPages ?? data.pages ?? 1;
    if (page >= totalPages) break;
  }
  return null;
}

function parseArtifacts(
  attributes?: Record<string, string | number | boolean | null>,
): ArtifactEntry[] {
  if (!attributes?.artifacts || typeof attributes.artifacts !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(attributes.artifacts);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getImplStatus(tags?: string[]): ImplStatus | null {
  if (!tags) return null;
  const implTag = tags.find((t) => t.startsWith(IMPL_TAG_PREFIX));
  if (!implTag) return null;
  const status = implTag.slice(IMPL_TAG_PREFIX.length);
  return IMPL_STATUSES.includes(status as ImplStatus)
    ? (status as ImplStatus)
    : null;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function statusEmoji(status: ImplStatus | null): string {
  switch (status) {
    case "not_started":
      return "[ ]";
    case "in_progress":
      return "[~]";
    case "implemented":
      return "[x]";
    case "verified":
      return "[v]";
    case "blocked":
      return "[!]";
    default:
      return "[-]";
  }
}

function artifactLabel(a: ArtifactEntry): string {
  const lineInfo = a.line ? `:${a.line}` : "";
  const label = a.label ? ` — ${a.label}` : "";
  return `${a.type}: ${a.path}${lineInfo}${label}`;
}

// ── Tool registration ────────────────────────────────────────

export function registerImplementationTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── link_artifact ─────────────────────────────────────────
  server.tool(
    "link_artifact",
    "Link a code artifact (file, commit, PR, issue, test, URL) to a requirement. " +
      "Stores artifact references in the requirement's attributes for traceability between requirements and code.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().describe("Requirement node ID"),
      type: z
        .enum(["file", "commit", "pr", "issue", "test", "url"])
        .describe("Artifact type"),
      path: z
        .string()
        .describe(
          "Artifact identifier: file path, commit SHA, PR/issue number, test name, or URL",
        ),
      label: z
        .string()
        .optional()
        .describe("Human-readable description of this artifact link"),
      line: z.number().optional().describe("Line number (for file type)"),
    },
    async ({ tenant, project, requirementId, type, path, label, line }) => {
      try {
        const req = await fetchRequirementById(
          client,
          tenant,
          project,
          requirementId,
        );
        if (!req) return ok(`Requirement ${requirementId} not found.`);

        const artifacts = parseArtifacts(req.attributes);

        const exists = artifacts.some(
          (a) =>
            a.type === type &&
            a.path === path &&
            (a.line ?? null) === (line ?? null),
        );
        if (exists) {
          return ok(`Artifact already linked: ${type}: ${path}`);
        }

        const newEntry: ArtifactEntry = { type, path };
        if (label) newEntry.label = label;
        if (line != null) newEntry.line = line;
        artifacts.push(newEntry);

        const updatedAttributes: Record<
          string,
          string | number | boolean | null
        > = {
          ...(req.attributes ?? {}),
          artifacts: JSON.stringify(artifacts),
        };

        await client.patch(
          `/requirements/${tenant}/${project}/${requirementId}`,
          { attributes: updatedAttributes },
        );

        return ok(
          `Artifact linked to ${req.ref ?? requirementId}:\n` +
            `- **Type:** ${type}\n` +
            `- **Path:** ${path}\n` +
            (label ? `- **Label:** ${label}\n` : "") +
            (line != null ? `- **Line:** ${line}\n` : "") +
            `\nTotal artifacts: ${artifacts.length}`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── unlink_artifact ───────────────────────────────────────
  server.tool(
    "unlink_artifact",
    "Remove an artifact link from a requirement. Identifies the artifact by type + path.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z.string().describe("Requirement node ID"),
      type: z
        .enum(["file", "commit", "pr", "issue", "test", "url"])
        .describe("Artifact type to remove"),
      path: z.string().describe("Artifact identifier to remove"),
    },
    async ({ tenant, project, requirementId, type, path }) => {
      try {
        const req = await fetchRequirementById(
          client,
          tenant,
          project,
          requirementId,
        );
        if (!req) return ok(`Requirement ${requirementId} not found.`);

        const artifacts = parseArtifacts(req.attributes);
        const before = artifacts.length;
        const filtered = artifacts.filter(
          (a) => !(a.type === type && a.path === path),
        );

        if (filtered.length === before) {
          return ok(`No matching artifact found: ${type}: ${path}`);
        }

        const updatedAttributes: Record<
          string,
          string | number | boolean | null
        > = {
          ...(req.attributes ?? {}),
          artifacts: filtered.length > 0 ? JSON.stringify(filtered) : null,
        };

        await client.patch(
          `/requirements/${tenant}/${project}/${requirementId}`,
          { attributes: updatedAttributes },
        );

        return ok(
          `Artifact unlinked from ${req.ref ?? requirementId}: ${type}: ${path}\n` +
            `Remaining artifacts: ${filtered.length}`,
        );
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── set_implementation_status ─────────────────────────────
  server.tool(
    "set_implementation_status",
    "Set implementation status on one or more requirements. Uses tags (impl:*) for filtering " +
      "and attributes for metadata. Single mode: provide requirementId + status. Batch mode: provide batch array.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z
        .string()
        .optional()
        .describe("Requirement node ID (single mode)"),
      status: z
        .enum(IMPL_STATUSES)
        .optional()
        .describe("Implementation status (single mode)"),
      notes: z
        .string()
        .optional()
        .describe("Implementation notes (single mode)"),
      batch: z
        .array(
          z.object({
            requirementId: z.string(),
            status: z.enum(IMPL_STATUSES),
            notes: z.string().optional(),
          }),
        )
        .optional()
        .describe("Batch mode: array of { requirementId, status, notes? }"),
    },
    async ({ tenant, project, requirementId, status, notes, batch }) => {
      try {
        const items: Array<{
          requirementId: string;
          status: ImplStatus;
          notes?: string;
        }> = [];

        if (batch && batch.length > 0) {
          items.push(...batch);
        } else if (requirementId && status) {
          items.push({ requirementId, status, notes });
        } else {
          return ok(
            "Provide requirementId + status for single mode, or batch array for batch mode.",
          );
        }

        let updated = 0;
        const errors: Array<{ requirementId: string; error: string }> = [];
        const now = new Date().toISOString();

        for (const item of items) {
          try {
            const req = await fetchRequirementById(
              client,
              tenant,
              project,
              item.requirementId,
            );
            if (!req) {
              errors.push({
                requirementId: item.requirementId,
                error: "Not found",
              });
              continue;
            }

            // Update tags: remove existing impl:* tags, add new one
            const currentTags = (req.tags ?? []).filter(
              (t) => !t.startsWith(IMPL_TAG_PREFIX),
            );
            currentTags.push(`${IMPL_TAG_PREFIX}${item.status}`);

            // Update attributes
            const updatedAttributes: Record<
              string,
              string | number | boolean | null
            > = {
              ...(req.attributes ?? {}),
              impl_status: item.status,
              impl_updated_at: now,
            };
            if (item.notes !== undefined) {
              updatedAttributes.impl_notes = item.notes || null;
            }

            await client.patch(
              `/requirements/${tenant}/${project}/${item.requirementId}`,
              { tags: currentTags, attributes: updatedAttributes },
            );
            updated++;
          } catch (err) {
            errors.push({
              requirementId: item.requirementId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (items.length === 1 && updated === 1) {
          return ok(
            `Implementation status set to **${items[0].status}** on ${items[0].requirementId}.`,
          );
        }

        const lines = [
          `## Implementation Status Update\n`,
          `- **Updated:** ${updated}`,
          `- **Failed:** ${errors.length}`,
          `- **Total:** ${items.length}`,
        ];
        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors)
            lines.push(`- ${e.requirementId}: ${e.error}`);
        }
        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_implementation_details ────────────────────────────
  server.tool(
    "get_implementation_details",
    "Get implementation status and linked artifacts for requirements. " +
      "Provide requirementId for a single requirement, or documentSlug for all requirements in a document.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      requirementId: z
        .string()
        .optional()
        .describe("Single requirement node ID"),
      documentSlug: z
        .string()
        .optional()
        .describe("Document slug (all requirements in that document)"),
    },
    async ({ tenant, project, requirementId, documentSlug }) => {
      try {
        let requirements: Requirement[];

        if (requirementId) {
          const req = await fetchRequirementById(
            client,
            tenant,
            project,
            requirementId,
          );
          if (!req) return ok(`Requirement ${requirementId} not found.`);
          requirements = [req];
        } else if (documentSlug) {
          requirements = await fetchDocRequirements(
            client,
            tenant,
            project,
            documentSlug,
          );
        } else {
          return ok("Provide requirementId or documentSlug.");
        }

        if (requirements.length === 0) return ok("No requirements found.");

        const lines: string[] = [
          `## Implementation Details${documentSlug ? ` — ${documentSlug}` : ""}\n`,
        ];

        for (const req of requirements) {
          const status = getImplStatus(req.tags);
          const artifacts = parseArtifacts(req.attributes);
          const implNotes = req.attributes?.impl_notes;
          const implUpdatedAt = req.attributes?.impl_updated_at;

          lines.push(
            `### ${req.ref ?? req.id ?? "?"} ${statusEmoji(status)} ${status ?? "no status"}`,
          );
          if (req.text) lines.push(`> ${truncate(req.text, 120)}`);
          if (implNotes && typeof implNotes === "string") {
            lines.push(`**Notes:** ${implNotes}`);
          }
          if (implUpdatedAt && typeof implUpdatedAt === "string") {
            lines.push(`**Last updated:** ${implUpdatedAt}`);
          }

          if (artifacts.length > 0) {
            lines.push(`**Artifacts (${artifacts.length}):**`);
            for (const a of artifacts) {
              lines.push(`- ${artifactLabel(a)}`);
            }
          } else {
            lines.push(`_No artifacts linked._`);
          }
          lines.push("");
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── implementation_report ─────────────────────────────────
  server.tool(
    "implementation_report",
    "Generate an implementation coverage report for a project or document. " +
      "Shows status distribution, coverage percentages, artifact statistics, and lists unimplemented requirements.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("Scope report to this document"),
    },
    async ({ tenant, project, documentSlug }) => {
      try {
        const requirements = await fetchDocRequirements(
          client,
          tenant,
          project,
          documentSlug,
        );

        const total = requirements.length;
        if (total === 0) return ok("No requirements found.");

        const statusCounts: Record<string, number> = {};
        for (const s of IMPL_STATUSES) statusCounts[s] = 0;
        statusCounts["unset"] = 0;

        let withArtifactCount = 0;
        const unimplemented: Requirement[] = [];

        for (const req of requirements) {
          const status = getImplStatus(req.tags);
          if (status) {
            statusCounts[status]++;
          } else {
            statusCounts["unset"]++;
          }

          const artifacts = parseArtifacts(req.attributes);
          if (artifacts.length > 0) withArtifactCount++;

          if (!status || status === "not_started" || status === "blocked") {
            unimplemented.push(req);
          }
        }

        const done =
          (statusCounts["implemented"] ?? 0) +
          (statusCounts["verified"] ?? 0);
        const inProgress = statusCounts["in_progress"] ?? 0;
        const blocked = statusCounts["blocked"] ?? 0;

        const lines = [
          `## Implementation Report${documentSlug ? ` — ${documentSlug}` : ""}\n`,
          `**Total requirements:** ${total}`,
          `**Implementation coverage:** ${pct(done, total)}`,
          `**Artifact coverage:** ${pct(withArtifactCount, total)}`,
          `\n### Status Distribution\n`,
        ];

        const allStatuses = [...IMPL_STATUSES, "unset"] as const;
        for (const s of allStatuses) {
          const count = statusCounts[s] ?? 0;
          if (count === 0 && s === "unset") continue;
          const bar = "\u2588".repeat(Math.round((count / total) * 30));
          const emoji =
            s === "unset" ? "[-]" : statusEmoji(s as ImplStatus);
          lines.push(
            `- ${emoji} ${s}: ${count} (${pct(count, total)}) ${bar}`,
          );
        }

        lines.push(`\n### Summary`);
        lines.push(`- Done (implemented + verified): ${done}`);
        lines.push(`- In progress: ${inProgress}`);
        lines.push(`- Blocked: ${blocked}`);
        lines.push(
          `- Not started / unset: ${total - done - inProgress - blocked}`,
        );
        lines.push(
          `- Requirements with artifact links: ${withArtifactCount}`,
        );

        if (unimplemented.length > 0) {
          lines.push(
            `\n### Needs Implementation (${unimplemented.length})\n`,
          );
          for (const r of unimplemented.slice(0, 20)) {
            const status = getImplStatus(r.tags);
            lines.push(
              `- ${statusEmoji(status)} **${r.ref ?? "?"}**: ${truncate(r.text ?? "", 80)} [${status ?? "unset"}]`,
            );
          }
          if (unimplemented.length > 20) {
            lines.push(
              `_... and ${unimplemented.length - 20} more_`,
            );
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── find_requirements_for_code ────────────────────────────
  server.tool(
    "find_requirements_for_code",
    "Given a file path or artifact identifier, find all requirements linked to it. " +
      "Useful for understanding which requirements a code file implements.",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      path: z
        .string()
        .describe(
          "Artifact path to search for (file path, commit SHA, PR number, etc.)",
        ),
      type: z
        .enum(["file", "commit", "pr", "issue", "test", "url"])
        .optional()
        .describe(
          "Filter to specific artifact type. If omitted, searches all types.",
        ),
    },
    async ({ tenant, project, path, type }) => {
      try {
        const requirements = await fetchAllRequirements(
          client,
          tenant,
          project,
        );

        const matches: Array<{
          req: Requirement;
          matchingArtifacts: ArtifactEntry[];
          status: ImplStatus | null;
        }> = [];

        for (const req of requirements) {
          const artifacts = parseArtifacts(req.attributes);
          const matching = artifacts.filter((a) => {
            if (type && a.type !== type) return false;
            return (
              a.path === path ||
              a.path.includes(path) ||
              path.includes(a.path)
            );
          });

          if (matching.length > 0) {
            matches.push({
              req,
              matchingArtifacts: matching,
              status: getImplStatus(req.tags),
            });
          }
        }

        if (matches.length === 0) {
          return ok(`No requirements found linked to: ${path}`);
        }

        const lines = [
          `## Requirements linked to: ${path}\n`,
          `**Found:** ${matches.length} requirement(s)\n`,
        ];

        for (const m of matches) {
          const emoji = statusEmoji(m.status);
          lines.push(
            `- ${emoji} **${m.req.ref ?? m.req.id ?? "?"}** [${m.status ?? "unset"}]: ${truncate(m.req.text ?? "", 100)}`,
          );
          for (const a of m.matchingArtifacts) {
            lines.push(`  - ${artifactLabel(a)}`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
