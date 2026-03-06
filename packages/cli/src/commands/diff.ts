import { writeFileSync } from "node:fs";
import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, isJsonMode, truncate } from "../output.js";

// ── Types (mirrors API response) ─────────────────────────────

interface BaselineInfo {
  ref: string;
  label?: string | null;
  createdAt?: string;
}

interface ReqVersion {
  requirementId?: string;
  text?: string;
  pattern?: string;
  tags?: string[];
  qaScore?: number;
}

interface EntityComparison<T> {
  added: T[];
  removed: T[];
  modified: T[];
  unchanged: T[];
}

interface CompareResponse {
  fromBaseline?: BaselineInfo;
  toBaseline?: BaselineInfo;
  requirements?: EntityComparison<ReqVersion>;
  documents?: EntityComparison<{ documentId?: string; title?: string }>;
  traceLinks?: EntityComparison<{ traceLinkId?: string }>;
  diagrams?: EntityComparison<{ diagramId?: string; name?: string }>;
  blocks?: EntityComparison<{ blockId?: string; name?: string }>;
  connectors?: EntityComparison<{ connectorId?: string }>;
}

// ── Helpers ───────────────────────────────────────────────────

/** Extract short ref from "tenant:project:REQ-001" → "REQ-001" */
function shortRef(id?: string): string {
  return id?.split(":").pop() ?? "?";
}

function counts(comp?: EntityComparison<unknown>): { added: number; removed: number; modified: number; unchanged: number } {
  return {
    added: comp?.added?.length ?? 0,
    removed: comp?.removed?.length ?? 0,
    modified: comp?.modified?.length ?? 0,
    unchanged: comp?.unchanged?.length ?? 0,
  };
}

// ── Structured output ────────────────────────────────────────

function buildStructured(data: CompareResponse) {
  const reqs = data.requirements ?? { added: [], removed: [], modified: [], unchanged: [] };
  const r = counts(reqs);

  return {
    summary: {
      from: data.fromBaseline?.ref ?? "?",
      to: data.toBaseline?.ref ?? "?",
      requirements: r,
    },
    added: reqs.added.map(v => ({ ref: shortRef(v.requirementId), text: v.text ?? "" })),
    removed: reqs.removed.map(v => ({ ref: shortRef(v.requirementId), text: v.text ?? "" })),
    modified: reqs.modified.map(v => ({ ref: shortRef(v.requirementId), text: v.text ?? "" })),
  };
}

// ── Pretty text ──────────────────────────────────────────────

function formatPretty(data: CompareResponse): string {
  const from = data.fromBaseline?.ref ?? "?";
  const to = data.toBaseline?.ref ?? "?";
  const reqs = data.requirements ?? { added: [], removed: [], modified: [], unchanged: [] };
  const r = counts(reqs);
  const lines: string[] = [];

  lines.push(`  Baseline Diff: ${from} → ${to}`);
  lines.push(`  ${"═".repeat(20 + from.length + to.length)}`);
  lines.push(`  ${r.added} added, ${r.modified} modified, ${r.removed} removed, ${r.unchanged} unchanged`);
  lines.push("");

  if (reqs.added.length > 0) {
    lines.push("  ┄┄ Added ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
    for (const v of reqs.added) {
      lines.push(`    + ${shortRef(v.requirementId)}`);
      lines.push(`      ${truncate(v.text ?? "", 100)}`);
    }
    lines.push("");
  }

  if (reqs.modified.length > 0) {
    lines.push("  ┄┄ Modified ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
    for (const v of reqs.modified) {
      lines.push(`    ~ ${shortRef(v.requirementId)}`);
      lines.push(`      ${truncate(v.text ?? "", 100)}`);
    }
    lines.push("");
  }

  if (reqs.removed.length > 0) {
    lines.push("  ┄┄ Removed ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
    for (const v of reqs.removed) {
      lines.push(`    - ${shortRef(v.requirementId)}`);
      lines.push(`      ${truncate(v.text ?? "", 100)}`);
    }
    lines.push("");
  }

  // Non-requirement entity summary
  const others: Array<[string, EntityComparison<unknown> | undefined]> = [
    ["Documents", data.documents],
    ["Trace Links", data.traceLinks],
    ["Diagrams", data.diagrams],
    ["Blocks", data.blocks],
    ["Connectors", data.connectors],
  ];
  const changed = others.filter(([, c]) => {
    const n = counts(c);
    return n.added + n.modified + n.removed > 0;
  });
  if (changed.length > 0) {
    lines.push("  ┄┄ Other Changes ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
    for (const [label, comp] of changed) {
      const n = counts(comp);
      lines.push(`    ${label}: +${n.added} ~${n.modified} -${n.removed}`);
    }
    lines.push("");
  }

  if (r.added + r.modified + r.removed === 0 && changed.length === 0) {
    lines.push("  No changes between baselines.");
    lines.push("");
  }

  return lines.join("\n");
}

// ── Markdown ─────────────────────────────────────────────────

function formatMarkdown(data: CompareResponse): string {
  const from = data.fromBaseline?.ref ?? "?";
  const to = data.toBaseline?.ref ?? "?";
  const reqs = data.requirements ?? { added: [], removed: [], modified: [], unchanged: [] };
  const r = counts(reqs);
  const lines: string[] = [];

  lines.push(`## Baseline Diff: ${from} → ${to}`);
  lines.push("");
  lines.push(`**${r.added}** added, **${r.modified}** modified, **${r.removed}** removed, **${r.unchanged}** unchanged`);
  lines.push("");

  if (reqs.added.length > 0) {
    lines.push("### Added");
    lines.push("| Ref | Text |");
    lines.push("|---|---|");
    for (const v of reqs.added) {
      lines.push(`| ${shortRef(v.requirementId)} | ${truncate(v.text ?? "", 120)} |`);
    }
    lines.push("");
  }

  if (reqs.modified.length > 0) {
    lines.push("### Modified");
    lines.push("| Ref | Text (current) |");
    lines.push("|---|---|");
    for (const v of reqs.modified) {
      lines.push(`| ${shortRef(v.requirementId)} | ${truncate(v.text ?? "", 120)} |`);
    }
    lines.push("");
  }

  if (reqs.removed.length > 0) {
    lines.push("### Removed");
    lines.push("| Ref | Text |");
    lines.push("|---|---|");
    for (const v of reqs.removed) {
      lines.push(`| ${shortRef(v.requirementId)} | ${truncate(v.text ?? "", 120)} |`);
    }
    lines.push("");
  }

  // Non-requirement entity summary
  const others: Array<[string, EntityComparison<unknown> | undefined]> = [
    ["Documents", data.documents],
    ["Trace Links", data.traceLinks],
    ["Diagrams", data.diagrams],
    ["Blocks", data.blocks],
    ["Connectors", data.connectors],
  ];
  const changed = others.filter(([, c]) => {
    const n = counts(c);
    return n.added + n.modified + n.removed > 0;
  });
  if (changed.length > 0) {
    lines.push("### Other Changes");
    lines.push("| Entity | Added | Modified | Removed |");
    lines.push("|---|---|---|---|");
    for (const [label, comp] of changed) {
      const n = counts(comp);
      lines.push(`| ${label} | ${n.added} | ${n.modified} | ${n.removed} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Command registration ─────────────────────────────────────

export function registerDiffCommand(program: Command, client: AirgenClient) {
  program
    .command("diff")
    .description("Show what changed between two baselines")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .requiredOption("--from <ref>", "Source baseline ref (earlier)")
    .requiredOption("--to <ref>", "Target baseline ref (later)")
    .option("--format <fmt>", "Output format: text, markdown", "text")
    .option("-o, --output <file>", "Write report to file")
    .action(async (tenant: string, project: string, opts: {
      from: string; to: string; format: string; output?: string;
    }) => {
      const data = await client.get<CompareResponse>(
        `/baselines/${tenant}/${project}/compare`,
        { from: opts.from, to: opts.to },
      );

      let result: string;

      if (isJsonMode()) {
        result = JSON.stringify(buildStructured(data), null, 2);
      } else if (opts.format === "markdown") {
        result = formatMarkdown(data);
      } else {
        result = formatPretty(data);
      }

      if (opts.output) {
        writeFileSync(opts.output, result + "\n", "utf-8");
        console.log(`Diff written to ${opts.output}`);
      } else {
        console.log(result);
      }
    });
}
