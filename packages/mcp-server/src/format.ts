/**
 * Response formatting helpers.
 *
 * Converts API JSON into concise text for Claude's context window.
 */

import { AirgenApiError } from "./client.js";

// ── Tool response builders ──────────────────────────────────

export function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function error(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function formatError(err: unknown) {
  if (err instanceof AirgenApiError) {
    switch (err.statusCode) {
      case 401:
        return error("Authentication failed. Check your AIRGEN_EMAIL and AIRGEN_PASSWORD.");
      case 403:
        return error(`Access denied: ${err.apiMessage}`);
      case 404:
        return error(`Not found: ${err.apiMessage}`);
      case 429:
        return error("Rate limit exceeded. Wait before making more requests.");
      default:
        return error(`API error (${err.statusCode}): ${err.apiMessage}`);
    }
  }
  if (err instanceof Error) {
    return error(err.message);
  }
  return error(String(err));
}

// ── Data formatters ─────────────────────────────────────────

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

export interface RequirementLike {
  id?: string;
  ref?: string;
  text?: string;
  title?: string;
  pattern?: string;
  verification?: string;
  qaScore?: number | null;
  qaVerdict?: string | null;
  tags?: string[];
  rationale?: string;
  complianceStatus?: string;
  archived?: boolean;
  deleted?: boolean;
  deletedAt?: string | null;
  documentSlug?: string;
  sectionId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function formatRequirement(r: RequirementLike): string {
  const lines: string[] = [];
  const score = r.qaScore != null ? `${r.qaScore}/100` : "unscored";
  lines.push(`**${r.ref ?? "?"}** (QA: ${score})`);
  if (r.id) lines.push(`ID: ${r.id}`);
  if (r.title) lines.push(`Title: ${r.title}`);
  if (r.text) lines.push(`Text: ${r.text}`);
  if (r.pattern) lines.push(`Pattern: ${r.pattern}`);
  if (r.verification) lines.push(`Verification: ${r.verification}`);
  if (r.rationale) lines.push(`Rationale: ${r.rationale}`);
  if (r.complianceStatus) lines.push(`Compliance: ${r.complianceStatus}`);
  if (r.documentSlug) lines.push(`Document: ${r.documentSlug}${r.sectionId ? ` / ${r.sectionId}` : ""}`);
  if (r.tags?.length) lines.push(`Tags: ${r.tags.join(", ")}`);
  if (r.archived) lines.push(`[ARCHIVED]`);
  if (r.deletedAt) lines.push(`[DELETED]`);
  return lines.join("\n");
}

export function formatRequirementList(
  items: RequirementLike[],
  meta?: { totalItems?: number; currentPage?: number; pageSize?: number; totalPages?: number },
): string {
  if (items.length === 0) return "No requirements found.";

  const total = meta?.totalItems ?? items.length;
  const page = meta?.currentPage ?? 1;
  const pageSize = meta?.pageSize ?? items.length;

  const header = `## Requirements (${total} total, page ${page})\n`;
  const body = items
    .map((r, i) => {
      const idx = (page - 1) * pageSize + i + 1;
      const score = r.qaScore != null ? `QA:${r.qaScore}` : "unscored";
      const id = r.id ? ` [ID: ${r.id}]` : "";
      return `${idx}. **${r.ref ?? "?"}** — ${truncate(r.text ?? "", 120)} (${score})${id}`;
    })
    .join("\n");

  const totalPages = meta?.totalPages ?? 1;
  const footer = totalPages > page ? `\n\n_Page ${page} of ${totalPages}. Use page=${page + 1} to see more._` : "";

  return header + body + footer;
}

export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return "No results.";
  const sep = headers.map(() => "---");
  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.map(row => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}
