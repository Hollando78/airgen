import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  qaScore?: number | null;
  tags?: string[];
  pattern?: string;
  complianceStatus?: string;
  attributes?: Record<string, string | number | boolean | null>;
  deleted?: boolean;
  deletedAt?: string | null;
}

const IMPL_TAG_PREFIX = "impl:";
const IMPL_STATUSES = ["not_started", "in_progress", "implemented", "verified", "blocked"] as const;
type ImplStatus = (typeof IMPL_STATUSES)[number];
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function getImplStatus(tags?: string[]): ImplStatus | null {
  if (!tags) return null;
  const implTag = tags.find(t => t.startsWith(IMPL_TAG_PREFIX));
  if (!implTag) return null;
  const status = implTag.slice(IMPL_TAG_PREFIX.length);
  return IMPL_STATUSES.includes(status as ImplStatus) ? (status as ImplStatus) : null;
}

async function fetchAllRequirements(client: AirgenClient, tenant: string, project: string): Promise<Requirement[]> {
  const all: Requirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const items = data.data ?? [];
    all.push(...items);
    const totalPages = data.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
  }
  return all.filter(r => !r.deleted && !r.deletedAt);
}

export function registerReportCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("reports").alias("report").description("Project reports");

  cmd
    .command("stats")
    .description("Project statistics overview")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const [reqs, links, docs, diagrams, baselines] = await Promise.all([
        client.get<{ meta: { totalItems: number } }>(`/requirements/${tenant}/${project}`, { page: "1", limit: "1" }),
        client.get<{ links: unknown[] }>(`/trace-links/${tenant}/${project}`),
        client.get<{ documents: unknown[] }>(`/documents/${tenant}/${project}`),
        client.get<{ diagrams: unknown[] }>(`/architecture/diagrams/${tenant}/${project}`),
        client.get<{ baselines: unknown[] }>(`/baselines/${tenant}/${project}`),
      ]);

      const stats = {
        requirements: reqs.meta?.totalItems ?? 0,
        traceLinks: (links.links ?? []).length,
        documents: (docs.documents ?? []).length,
        diagrams: (diagrams.diagrams ?? []).length,
        baselines: (baselines.baselines ?? []).length,
      };

      if (isJsonMode()) {
        output(stats);
      } else {
        printTable(
          ["Metric", "Count"],
          Object.entries(stats).map(([k, v]) => [k, String(v)]),
        );
      }
    });

  cmd
    .command("quality")
    .description("Quality score summary")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const reqs = await fetchAllRequirements(client, tenant, project);
      const scored = reqs.filter(r => r.qaScore != null);
      const avg = scored.length > 0
        ? scored.reduce((sum, r) => sum + (r.qaScore ?? 0), 0) / scored.length
        : 0;
      const below50 = scored.filter(r => (r.qaScore ?? 0) < 50);

      if (isJsonMode()) {
        output({ total: reqs.length, scored: scored.length, averageScore: Math.round(avg), belowThreshold: below50.length });
      } else {
        console.log(`Total requirements: ${reqs.length}`);
        console.log(`Scored: ${scored.length}`);
        console.log(`Average QA score: ${Math.round(avg)}/100`);
        console.log(`Below 50: ${below50.length}`);
        if (below50.length > 0) {
          console.log("\nLowest scoring:");
          printTable(
            ["Ref", "Score", "Text"],
            below50
              .sort((a, b) => (a.qaScore ?? 0) - (b.qaScore ?? 0))
              .slice(0, 10)
              .map(r => [r.ref ?? "?", String(r.qaScore ?? 0), truncate(r.text ?? "", 60)]),
          );
        }
      }
    });

  cmd
    .command("compliance")
    .description("Compliance and implementation status summary")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const reqs = await fetchAllRequirements(client, tenant, project);

      // Compliance status
      const compCounts: Record<string, number> = {};
      for (const r of reqs) {
        const status = r.complianceStatus || "Unset";
        compCounts[status] = (compCounts[status] ?? 0) + 1;
      }

      // Implementation status (read from tags, matching MCP server)
      const implCounts: Record<string, number> = {};
      for (const s of IMPL_STATUSES) implCounts[s] = 0;
      implCounts["unset"] = 0;
      for (const r of reqs) {
        const status = getImplStatus(r.tags);
        if (status) implCounts[status]++;
        else implCounts["unset"]++;
      }

      if (isJsonMode()) {
        output({ total: reqs.length, compliance: compCounts, implementation: implCounts });
      } else {
        console.log(`Total requirements: ${reqs.length}\n`);
        console.log("Compliance Status:");
        printTable(
          ["Status", "Count"],
          Object.entries(compCounts).map(([k, v]) => [k, String(v)]),
        );
        console.log("\nImplementation Status:");
        printTable(
          ["Status", "Count"],
          Object.entries(implCounts).filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)]),
        );
      }
    });

  cmd
    .command("orphans")
    .description("Find requirements with no trace links")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const [reqs, linkData] = await Promise.all([
        fetchAllRequirements(client, tenant, project),
        client.get<{ links: Array<{ sourceRequirementId?: string; targetRequirementId?: string }> }>(`/trace-links/${tenant}/${project}`),
      ]);
      const links = linkData.links ?? [];

      const linked = new Set<string>();
      for (const l of links) {
        if (l.sourceRequirementId) linked.add(l.sourceRequirementId);
        if (l.targetRequirementId) linked.add(l.targetRequirementId);
      }

      const orphans = reqs.filter(r => r.id && !linked.has(r.id));

      if (isJsonMode()) {
        output(orphans);
      } else {
        console.log(`Orphan requirements (no trace links): ${orphans.length}/${reqs.length}\n`);
        if (orphans.length > 0) {
          printTable(
            ["Ref", "Text"],
            orphans.slice(0, 30).map(r => [r.ref ?? "?", truncate(r.text ?? "", 70)]),
          );
        }
      }
    });
}
