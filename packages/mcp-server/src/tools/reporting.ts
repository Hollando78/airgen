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
  qaVerdict?: string | null;
  complianceStatus?: string;
  complianceRationale?: string;
  documentSlug?: string;
  sectionId?: string;
  deleted?: boolean;
  deletedAt?: string | null;
}

interface TraceLink {
  id?: string;
  sourceRequirementId?: string;
  targetRequirementId?: string;
  linkType?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

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
      // Legacy shape fallback
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

async function fetchTraceLinks(
  client: AirgenClient,
  tenant: string,
  project: string,
): Promise<TraceLink[]> {
  const data = await client.get<{ traceLinks: TraceLink[] }>(
    `/trace-links/${tenant}/${project}`,
  );
  return data.traceLinks ?? [];
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

async function fetchDocRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
  documentSlug?: string,
): Promise<Requirement[]> {
  if (documentSlug) {
    const secData = await client.get<{
      sections: Array<{ requirements?: Array<Requirement> }>;
    }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
    const reqs: Requirement[] = [];
    for (const sec of secData.sections ?? []) {
      reqs.push(...(sec.requirements ?? []));
    }
    return reqs;
  }
  return fetchAllRequirements(client, tenant, project);
}

// ── Report handlers ──────────────────────────────────────────

type ReportParams = {
  project: string;
  tenant: string;
  sourceDocumentSlug?: string;
  targetDocumentSlug?: string;
  linkType?: string;
  matrixFormat?: string;
  documentSlug?: string;
  threshold?: number;
  orphanDirection?: string;
  requirementId?: string;
  impactDirection?: string;
  maxDepth?: number;
};

async function handleStats(client: AirgenClient, p: ReportParams) {
  const [requirements, links, docsData, diagramsData, baselinesData] =
    await Promise.all([
      fetchAllRequirements(client, p.tenant, p.project),
      fetchTraceLinks(client, p.tenant, p.project),
      client.get<{ documents: Array<{ slug: string }> }>(
        `/documents/${p.tenant}/${p.project}`,
      ),
      client
        .get<{ diagrams: Array<{ id: string }> }>(
          `/architecture/diagrams/${p.tenant}/${p.project}`,
        )
        .catch(() => ({ diagrams: [] })),
      client
        .get<{ items: Array<{ ref: string }> }>(
          `/baselines/${p.tenant}/${p.project}`,
        )
        .catch(() => ({ items: [] })),
    ]);

  const total = requirements.length;

  const byPattern: Record<string, number> = {};
  for (const r of requirements) {
    const pat = r.pattern ?? "unclassified";
    byPattern[pat] = (byPattern[pat] ?? 0) + 1;
  }

  const byVerification: Record<string, number> = {};
  for (const r of requirements) {
    const v = r.verification ?? "unassigned";
    byVerification[v] = (byVerification[v] ?? 0) + 1;
  }

  const byCompliance: Record<string, number> = {};
  for (const r of requirements) {
    const c = r.complianceStatus ?? "Not assessed";
    byCompliance[c] = (byCompliance[c] ?? 0) + 1;
  }

  const scores = requirements.map((r) => r.qaScore ?? 0);
  const avgScore = total > 0 ? scores.reduce((a, b) => a + b, 0) / total : 0;
  const above80 = scores.filter((s) => s >= 80).length;
  const between60and80 = scores.filter((s) => s >= 60 && s < 80).length;
  const below60 = scores.filter((s) => s < 60).length;

  const linkedIds = new Set<string>();
  for (const link of links) {
    if (link.sourceRequirementId) linkedIds.add(link.sourceRequirementId);
    if (link.targetRequirementId) linkedIds.add(link.targetRequirementId);
  }
  const reqIds = new Set(requirements.map((r) => r.id).filter(Boolean));
  const withLinks = [...reqIds].filter((id) => linkedIds.has(id!)).length;
  const orphans = reqIds.size - withLinks;

  const lines = [
    `## Project Stats: ${p.project}\n`,
    `### Requirements: ${total}\n`,
    `**By Pattern:**`,
    ...Object.entries(byPattern).map(([k, v]) => `- ${k}: ${v}`),
    `\n**By Verification:**`,
    ...Object.entries(byVerification).map(([k, v]) => `- ${k}: ${v}`),
    `\n**By Compliance:**`,
    ...Object.entries(byCompliance).map(([k, v]) => `- ${k}: ${v}`),
    `\n### Quality`,
    `- Average QA score: ${avgScore.toFixed(1)}`,
    `- Above 80: ${above80}`,
    `- 60-80: ${between60and80}`,
    `- Below 60: ${below60}`,
    `\n### Traceability`,
    `- Total trace links: ${links.length}`,
    `- Requirements with links: ${withLinks}`,
    `- Orphan requirements: ${orphans}`,
    `- Coverage: ${pct(withLinks, reqIds.size)}`,
    `\n### Assets`,
    `- Documents: ${(docsData.documents ?? []).length}`,
    `- Diagrams: ${(diagramsData.diagrams ?? []).length}`,
    `- Baselines: ${(baselinesData.items ?? []).length}`,
  ];

  return ok(lines.join("\n"));
}

async function handleMatrix(client: AirgenClient, p: ReportParams) {
  if (!p.sourceDocumentSlug || !p.targetDocumentSlug) {
    return ok("traceability_matrix requires sourceDocumentSlug and targetDocumentSlug.");
  }

  const outputFormat = p.matrixFormat ?? "full";
  const [sourceData, targetData, allLinks] = await Promise.all([
    client.get<{
      sections: Array<{
        id: string;
        requirements?: Array<{ id?: string; ref?: string; text?: string }>;
      }>;
    }>(`/sections/${p.tenant}/${p.project}/${p.sourceDocumentSlug}/full`),
    client.get<{
      sections: Array<{
        id: string;
        requirements?: Array<{ id?: string; ref?: string; text?: string }>;
      }>;
    }>(`/sections/${p.tenant}/${p.project}/${p.targetDocumentSlug}/full`),
    fetchTraceLinks(client, p.tenant, p.project),
  ]);

  const sourceReqs: Array<{ id: string; ref: string; text: string }> = [];
  for (const sec of sourceData.sections ?? []) {
    for (const r of sec.requirements ?? []) {
      if (r.id) sourceReqs.push({ id: r.id, ref: r.ref ?? "?", text: r.text ?? "" });
    }
  }

  const targetReqs: Array<{ id: string; ref: string; text: string }> = [];
  for (const sec of targetData.sections ?? []) {
    for (const r of sec.requirements ?? []) {
      if (r.id) targetReqs.push({ id: r.id, ref: r.ref ?? "?", text: r.text ?? "" });
    }
  }

  const sourceIds = new Set(sourceReqs.map((r) => r.id));
  const targetIds = new Set(targetReqs.map((r) => r.id));

  const relevantLinks = allLinks.filter((l) => {
    if (p.linkType && l.linkType !== p.linkType) return false;
    return (
      (sourceIds.has(l.sourceRequirementId ?? "") &&
        targetIds.has(l.targetRequirementId ?? "")) ||
      (sourceIds.has(l.targetRequirementId ?? "") &&
        targetIds.has(l.sourceRequirementId ?? ""))
    );
  });

  const sourceToTargets = new Map<string, Set<string>>();
  const targetToSources = new Map<string, Set<string>>();

  for (const link of relevantLinks) {
    const src = link.sourceRequirementId ?? "";
    const tgt = link.targetRequirementId ?? "";

    if (sourceIds.has(src) && targetIds.has(tgt)) {
      if (!sourceToTargets.has(src)) sourceToTargets.set(src, new Set());
      sourceToTargets.get(src)!.add(tgt);
      if (!targetToSources.has(tgt)) targetToSources.set(tgt, new Set());
      targetToSources.get(tgt)!.add(src);
    }
    if (sourceIds.has(tgt) && targetIds.has(src)) {
      if (!sourceToTargets.has(tgt)) sourceToTargets.set(tgt, new Set());
      sourceToTargets.get(tgt)!.add(src);
      if (!targetToSources.has(src)) targetToSources.set(src, new Set());
      targetToSources.get(src)!.add(tgt);
    }
  }

  const linkedSources = sourceReqs.filter((r) => sourceToTargets.has(r.id));
  const unlinkedSources = sourceReqs.filter((r) => !sourceToTargets.has(r.id));
  const linkedTargets = targetReqs.filter((r) => targetToSources.has(r.id));
  const unlinkedTargets = targetReqs.filter((r) => !targetToSources.has(r.id));

  const lines = [
    `## Traceability Matrix\n`,
    `**Source:** ${p.sourceDocumentSlug} (${sourceReqs.length} requirements)`,
    `**Target:** ${p.targetDocumentSlug} (${targetReqs.length} requirements)`,
    p.linkType ? `**Link type:** ${p.linkType}` : "",
    `\n### Coverage`,
    `- Forward coverage: ${pct(linkedSources.length, sourceReqs.length)} (${linkedSources.length}/${sourceReqs.length} source reqs linked)`,
    `- Backward coverage: ${pct(linkedTargets.length, targetReqs.length)} (${linkedTargets.length}/${targetReqs.length} target reqs linked)`,
    `- Total links: ${relevantLinks.length}`,
  ].filter(Boolean);

  if (unlinkedSources.length > 0) {
    lines.push(`\n### Unlinked Source Requirements (${unlinkedSources.length})\n`);
    for (const r of unlinkedSources.slice(0, 20)) {
      lines.push(`- **${r.ref}**: ${truncate(r.text, 80)}`);
    }
    if (unlinkedSources.length > 20)
      lines.push(`_... and ${unlinkedSources.length - 20} more_`);
  }

  if (unlinkedTargets.length > 0) {
    lines.push(`\n### Unlinked Target Requirements (${unlinkedTargets.length})\n`);
    for (const r of unlinkedTargets.slice(0, 20)) {
      lines.push(`- **${r.ref}**: ${truncate(r.text, 80)}`);
    }
    if (unlinkedTargets.length > 20)
      lines.push(`_... and ${unlinkedTargets.length - 20} more_`);
  }

  if (outputFormat === "full" && sourceReqs.length > 0) {
    const targetById = new Map(targetReqs.map((r) => [r.id, r]));
    lines.push(`\n### Full Matrix\n`);
    const rows: string[][] = [];
    for (const src of sourceReqs) {
      const targets = sourceToTargets.get(src.id);
      if (targets && targets.size > 0) {
        const targetRefs = [...targets]
          .map((id) => targetById.get(id)?.ref ?? id)
          .join(", ");
        rows.push([src.ref, truncate(src.text, 60), targetRefs]);
      } else {
        rows.push([src.ref, truncate(src.text, 60), "(none)"]);
      }
    }
    lines.push(formatTable(["Source", "Text", "Linked Targets"], rows));
  }

  return ok(lines.join("\n"));
}

async function handleQuality(client: AirgenClient, p: ReportParams) {
  const minScore = p.threshold ?? 60;
  const requirements = await fetchDocRequirements(client, p.tenant, p.project, p.documentSlug);

  const total = requirements.length;
  if (total === 0) return ok("No requirements found.");

  const scores = requirements.map((r) => r.qaScore ?? 0);
  scores.sort((a, b) => a - b);
  const avg = scores.reduce((a, b) => a + b, 0) / total;
  const median = scores[Math.floor(total / 2)];

  const dist: Record<string, number> = {
    "90-100": 0, "80-89": 0, "70-79": 0, "60-69": 0, "50-59": 0, "0-49": 0,
  };
  for (const s of scores) {
    if (s >= 90) dist["90-100"]++;
    else if (s >= 80) dist["80-89"]++;
    else if (s >= 70) dist["70-79"]++;
    else if (s >= 60) dist["60-69"]++;
    else if (s >= 50) dist["50-59"]++;
    else dist["0-49"]++;
  }

  const belowThreshold = requirements
    .filter((r) => (r.qaScore ?? 0) < minScore)
    .sort((a, b) => (a.qaScore ?? 0) - (b.qaScore ?? 0));

  const lines = [
    `## Quality Report${p.documentSlug ? ` — ${p.documentSlug}` : ""}\n`,
    `- **Total requirements:** ${total}`,
    `- **Average score:** ${avg.toFixed(1)}`,
    `- **Median score:** ${median}`,
    `\n### Score Distribution\n`,
    ...Object.entries(dist).map(([range, count]) => {
      const bar = "\u2588".repeat(Math.round((count / total) * 30));
      return `- ${range}: ${count} ${bar}`;
    }),
  ];

  if (belowThreshold.length > 0) {
    lines.push(
      `\n### Below Threshold (score < ${minScore}): ${belowThreshold.length} requirements\n`,
    );
    for (const r of belowThreshold.slice(0, 15)) {
      lines.push(
        `- **${r.ref ?? "?"}** (QA: ${r.qaScore ?? 0}): ${truncate(r.text ?? "", 80)}`,
      );
    }
    if (belowThreshold.length > 15)
      lines.push(`_... and ${belowThreshold.length - 15} more_`);
  }

  return ok(lines.join("\n"));
}

async function handleCompliance(client: AirgenClient, p: ReportParams) {
  const requirements = await fetchDocRequirements(client, p.tenant, p.project, p.documentSlug);

  const total = requirements.length;
  if (total === 0) return ok("No requirements found.");

  const groups: Record<string, Requirement[]> = {
    Compliant: [],
    "Compliance Risk": [],
    "Non-Compliant": [],
    "N/A": [],
    "Not assessed": [],
  };

  for (const r of requirements) {
    const status = r.complianceStatus || "Not assessed";
    if (!groups[status]) groups[status] = [];
    groups[status].push(r);
  }

  const lines = [
    `## Compliance Report${p.documentSlug ? ` — ${p.documentSlug}` : ""}\n`,
    `**Total requirements:** ${total}\n`,
  ];

  for (const [status, reqs] of Object.entries(groups)) {
    if (reqs.length === 0) continue;
    lines.push(`### ${status}: ${reqs.length} (${pct(reqs.length, total)})\n`);

    if (status === "Compliance Risk" || status === "Non-Compliant") {
      for (const r of reqs.slice(0, 10)) {
        lines.push(`- **${r.ref ?? "?"}**: ${truncate(r.text ?? "", 80)}`);
        if (r.complianceRationale)
          lines.push(`  _Rationale: ${truncate(r.complianceRationale, 120)}_`);
      }
      if (reqs.length > 10) lines.push(`_... and ${reqs.length - 10} more_`);
      lines.push("");
    }
  }

  return ok(lines.join("\n"));
}

async function handleOrphans(client: AirgenClient, p: ReportParams) {
  const mode = p.orphanDirection ?? "completely_isolated";
  const requirements = await fetchDocRequirements(client, p.tenant, p.project, p.documentSlug);
  const links = await fetchTraceLinks(client, p.tenant, p.project);

  const hasParent = new Set<string>();
  const hasChild = new Set<string>();
  for (const link of links) {
    if (link.targetRequirementId) hasParent.add(link.targetRequirementId);
    if (link.sourceRequirementId) hasChild.add(link.sourceRequirementId);
  }

  const orphans = requirements.filter((r) => {
    const id = r.id ?? "";
    switch (mode) {
      case "completely_isolated":
        return !hasParent.has(id) && !hasChild.has(id);
      case "no_parents":
        return !hasParent.has(id);
      case "no_children":
        return !hasChild.has(id);
      case "any":
        return !hasParent.has(id) || !hasChild.has(id);
      default:
        return !hasParent.has(id) && !hasChild.has(id);
    }
  });

  if (orphans.length === 0) {
    return ok(`No orphan requirements found (mode: ${mode}).`);
  }

  const rows = orphans.map((r) => [
    r.ref ?? "?",
    truncate(r.text ?? "", 80),
    String(r.qaScore ?? ""),
    r.documentSlug ?? "",
  ]);

  return ok(
    `## Orphan Requirements (${orphans.length}, mode: ${mode})\n\n` +
      formatTable(["Ref", "Text", "QA", "Document"], rows),
  );
}

async function handleImpact(client: AirgenClient, p: ReportParams) {
  if (!p.requirementId) {
    return ok("impact report requires requirementId.");
  }

  const dir = p.impactDirection ?? "both";
  const depth = p.maxDepth ?? 5;

  const [allReqs, allLinks] = await Promise.all([
    fetchAllRequirements(client, p.tenant, p.project),
    fetchTraceLinks(client, p.tenant, p.project),
  ]);

  const reqById = new Map(allReqs.map((r) => [r.id, r]));

  const downstream = new Map<string, Array<{ id: string; linkType: string }>>();
  const upstream = new Map<string, Array<{ id: string; linkType: string }>>();

  for (const link of allLinks) {
    const src = link.sourceRequirementId ?? "";
    const tgt = link.targetRequirementId ?? "";
    const lt = link.linkType ?? "unknown";

    if (!downstream.has(src)) downstream.set(src, []);
    downstream.get(src)!.push({ id: tgt, linkType: lt });
    if (!upstream.has(tgt)) upstream.set(tgt, []);
    upstream.get(tgt)!.push({ id: src, linkType: lt });
  }

  interface ImpactNode {
    depth: number;
    linkType: string;
    requirement: { ref: string; text: string; id: string };
  }

  function traverse(
    startId: string,
    adjacency: Map<string, Array<{ id: string; linkType: string }>>,
    maxD: number,
  ): ImpactNode[] {
    const result: ImpactNode[] = [];
    const visited = new Set<string>([startId]);
    const queue: Array<{ id: string; depth: number; linkType: string }> = [];

    for (const next of adjacency.get(startId) ?? []) {
      if (!visited.has(next.id)) {
        queue.push({ id: next.id, depth: 1, linkType: next.linkType });
        visited.add(next.id);
      }
    }

    while (queue.length > 0) {
      const item = queue.shift()!;
      const req = reqById.get(item.id);
      result.push({
        depth: item.depth,
        linkType: item.linkType,
        requirement: {
          id: item.id,
          ref: req?.ref ?? "?",
          text: req?.text ?? "",
        },
      });

      if (item.depth < maxD) {
        for (const next of adjacency.get(item.id) ?? []) {
          if (!visited.has(next.id)) {
            queue.push({
              id: next.id,
              depth: item.depth + 1,
              linkType: next.linkType,
            });
            visited.add(next.id);
          }
        }
      }
    }

    return result;
  }

  const startReq = reqById.get(p.requirementId);
  const lines = [
    `## Impact Analysis\n`,
    `**Starting requirement:** ${startReq?.ref ?? p.requirementId}`,
    startReq?.text ? `**Text:** ${truncate(startReq.text, 100)}` : "",
    `**Direction:** ${dir} | **Max depth:** ${depth}\n`,
  ].filter(Boolean);

  let upstreamNodes: ImpactNode[] = [];
  let downstreamNodes: ImpactNode[] = [];

  if (dir === "upstream" || dir === "both") {
    upstreamNodes = traverse(p.requirementId, upstream, depth);
  }
  if (dir === "downstream" || dir === "both") {
    downstreamNodes = traverse(p.requirementId, downstream, depth);
  }

  if (upstreamNodes.length > 0) {
    lines.push(`### Upstream (${upstreamNodes.length})\n`);
    for (const node of upstreamNodes) {
      const indent = "  ".repeat(node.depth - 1);
      lines.push(
        `${indent}- [depth ${node.depth}, ${node.linkType}] **${node.requirement.ref}**: ${truncate(node.requirement.text, 80)}`,
      );
    }
  }

  if (downstreamNodes.length > 0) {
    lines.push(`\n### Downstream (${downstreamNodes.length})\n`);
    for (const node of downstreamNodes) {
      const indent = "  ".repeat(node.depth - 1);
      lines.push(
        `${indent}- [depth ${node.depth}, ${node.linkType}] **${node.requirement.ref}**: ${truncate(node.requirement.text, 80)}`,
      );
    }
  }

  const totalImpacted = upstreamNodes.length + downstreamNodes.length;
  if (totalImpacted === 0) {
    lines.push(`\n_No linked requirements found in the ${dir} direction._`);
  } else {
    lines.push(`\n**Total impacted:** ${totalImpacted}`);
  }

  return ok(lines.join("\n"));
}

export function registerReportingTools(
  server: McpServer,
  client: AirgenClient,
) {
  server.tool(
    "get_report",
    "Generate a project report. Types: 'stats' (project overview), 'traceability_matrix' (coverage between documents), 'quality' (QA score analysis), 'compliance' (status breakdown), 'orphans' (unlinked requirements), 'impact' (change impact chain).",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      type: z
        .enum([
          "stats",
          "traceability_matrix",
          "quality",
          "compliance",
          "orphans",
          "impact",
        ])
        .describe("Report type"),
      // traceability_matrix params
      sourceDocumentSlug: z
        .string()
        .optional()
        .describe("(traceability_matrix) Source document slug"),
      targetDocumentSlug: z
        .string()
        .optional()
        .describe("(traceability_matrix) Target document slug"),
      linkType: z
        .enum([
          "satisfies",
          "derives",
          "verifies",
          "implements",
          "refines",
          "conflicts",
        ])
        .optional()
        .describe("(traceability_matrix) Filter by link type"),
      matrixFormat: z
        .enum(["summary", "full"])
        .optional()
        .describe("(traceability_matrix) Output format. Default: full"),
      // quality/compliance/orphans scoping
      documentSlug: z
        .string()
        .optional()
        .describe("(quality, compliance, orphans) Scope to this document"),
      // quality
      threshold: z
        .number()
        .optional()
        .describe("(quality) QA score threshold for flagging. Default: 60"),
      // orphans
      orphanDirection: z
        .enum(["any", "no_parents", "no_children", "completely_isolated"])
        .optional()
        .describe("(orphans) Detection mode. Default: completely_isolated"),
      // impact
      requirementId: z
        .string()
        .optional()
        .describe("(impact) Starting requirement ID"),
      impactDirection: z
        .enum(["upstream", "downstream", "both"])
        .optional()
        .describe("(impact) Trace direction. Default: both"),
      maxDepth: z
        .number()
        .optional()
        .describe("(impact) Max traversal depth. Default: 5"),
    },
    async (params) => {
      try {
        switch (params.type) {
          case "stats":
            return await handleStats(client, params);
          case "traceability_matrix":
            return await handleMatrix(client, params);
          case "quality":
            return await handleQuality(client, params);
          case "compliance":
            return await handleCompliance(client, params);
          case "orphans":
            return await handleOrphans(client, params);
          case "impact":
            return await handleImpact(client, params);
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
