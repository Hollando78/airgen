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

export function registerReportingTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── get_project_stats ───────────────────────────────────────
  server.tool(
    "get_project_stats",
    "Dashboard-level overview of project health: requirement counts by pattern, verification, compliance, quality distribution, traceability coverage, and asset counts.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
    },
    async ({ project, tenant }) => {
      try {
        // Parallel fetches
        const [requirements, links, docsData, diagramsData, baselinesData] =
          await Promise.all([
            fetchAllRequirements(client, tenant, project),
            fetchTraceLinks(client, tenant, project),
            client.get<{ documents: Array<{ slug: string }> }>(
              `/documents/${tenant}/${project}`,
            ),
            client
              .get<{ diagrams: Array<{ id: string }> }>(
                `/architecture/diagrams/${tenant}/${project}`,
              )
              .catch(() => ({ diagrams: [] })),
            client
              .get<{ items: Array<{ ref: string }> }>(
                `/baselines/${tenant}/${project}`,
              )
              .catch(() => ({ items: [] })),
          ]);

        const total = requirements.length;

        // Pattern distribution
        const byPattern: Record<string, number> = {};
        for (const r of requirements) {
          const p = r.pattern ?? "unclassified";
          byPattern[p] = (byPattern[p] ?? 0) + 1;
        }

        // Verification distribution
        const byVerification: Record<string, number> = {};
        for (const r of requirements) {
          const v = r.verification ?? "unassigned";
          byVerification[v] = (byVerification[v] ?? 0) + 1;
        }

        // Compliance distribution
        const byCompliance: Record<string, number> = {};
        for (const r of requirements) {
          const c = r.complianceStatus ?? "Not assessed";
          byCompliance[c] = (byCompliance[c] ?? 0) + 1;
        }

        // QA score distribution
        const scores = requirements.map((r) => r.qaScore ?? 0);
        const avgScore = total > 0 ? scores.reduce((a, b) => a + b, 0) / total : 0;
        const above80 = scores.filter((s) => s >= 80).length;
        const between60and80 = scores.filter((s) => s >= 60 && s < 80).length;
        const below60 = scores.filter((s) => s < 60).length;

        // Traceability
        const linkedIds = new Set<string>();
        for (const link of links) {
          if (link.sourceRequirementId) linkedIds.add(link.sourceRequirementId);
          if (link.targetRequirementId) linkedIds.add(link.targetRequirementId);
        }
        const reqIds = new Set(requirements.map((r) => r.id).filter(Boolean));
        const withLinks = [...reqIds].filter((id) => linkedIds.has(id!)).length;
        const orphans = reqIds.size - withLinks;

        const lines = [
          `## Project Stats: ${project}\n`,
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
          `- 60–80: ${between60and80}`,
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
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_traceability_matrix ─────────────────────────────────
  server.tool(
    "get_traceability_matrix",
    "Traceability coverage between two document levels. Shows which source requirements are linked to which targets, and identifies gaps.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      sourceDocumentSlug: z.string().describe("Source (parent) document slug"),
      targetDocumentSlug: z.string().describe("Target (child) document slug"),
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
        .describe("Filter to this link type. Default: all."),
      format: z
        .enum(["summary", "full"])
        .optional()
        .describe(
          "'summary' returns coverage stats. 'full' includes the complete mapping. Default: full.",
        ),
    },
    async ({
      project,
      tenant,
      sourceDocumentSlug,
      targetDocumentSlug,
      linkType,
      format,
    }) => {
      try {
        const outputFormat = format ?? "full";

        // Fetch both documents' requirements via sections/full
        const [sourceData, targetData, allLinks] = await Promise.all([
          client.get<{
            sections: Array<{
              id: string;
              requirements?: Array<{ id?: string; ref?: string; text?: string }>;
            }>;
          }>(`/sections/${tenant}/${project}/${sourceDocumentSlug}/full`),
          client.get<{
            sections: Array<{
              id: string;
              requirements?: Array<{ id?: string; ref?: string; text?: string }>;
            }>;
          }>(`/sections/${tenant}/${project}/${targetDocumentSlug}/full`),
          fetchTraceLinks(client, tenant, project),
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

        // Filter links to those connecting source ↔ target documents
        const relevantLinks = allLinks.filter((l) => {
          if (linkType && l.linkType !== linkType) return false;
          return (
            (sourceIds.has(l.sourceRequirementId ?? "") &&
              targetIds.has(l.targetRequirementId ?? "")) ||
            (sourceIds.has(l.targetRequirementId ?? "") &&
              targetIds.has(l.sourceRequirementId ?? ""))
          );
        });

        // Build mapping: source → targets
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
          // Handle reverse direction
          if (sourceIds.has(tgt) && targetIds.has(src)) {
            if (!sourceToTargets.has(tgt)) sourceToTargets.set(tgt, new Set());
            sourceToTargets.get(tgt)!.add(src);
            if (!targetToSources.has(src)) targetToSources.set(src, new Set());
            targetToSources.get(src)!.add(tgt);
          }
        }

        const linkedSources = sourceReqs.filter((r) => sourceToTargets.has(r.id));
        const unlinkedSources = sourceReqs.filter(
          (r) => !sourceToTargets.has(r.id),
        );
        const linkedTargets = targetReqs.filter((r) => targetToSources.has(r.id));
        const unlinkedTargets = targetReqs.filter(
          (r) => !targetToSources.has(r.id),
        );

        const lines = [
          `## Traceability Matrix\n`,
          `**Source:** ${sourceDocumentSlug} (${sourceReqs.length} requirements)`,
          `**Target:** ${targetDocumentSlug} (${targetReqs.length} requirements)`,
          linkType ? `**Link type:** ${linkType}` : "",
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
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_quality_report ──────────────────────────────────────
  server.tool(
    "get_quality_report",
    "QA score analysis. Shows score distribution, flags low-quality requirements, and identifies common defects.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("Scope to this document. Omit for entire project."),
      threshold: z
        .number()
        .optional()
        .describe("QA score threshold below which requirements are flagged. Default: 60"),
    },
    async ({ project, tenant, documentSlug, threshold }) => {
      try {
        const minScore = threshold ?? 60;

        let requirements: Requirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{
              requirements?: Array<Requirement>;
            }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
          requirements = [];
          for (const sec of secData.sections ?? []) {
            requirements.push(...(sec.requirements ?? []));
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

        const total = requirements.length;
        if (total === 0) return ok("No requirements found.");

        const scores = requirements.map((r) => r.qaScore ?? 0);
        scores.sort((a, b) => a - b);
        const avg = scores.reduce((a, b) => a + b, 0) / total;
        const median = scores[Math.floor(total / 2)];

        // Distribution buckets
        const dist: Record<string, number> = {
          "90-100": 0,
          "80-89": 0,
          "70-79": 0,
          "60-69": 0,
          "50-59": 0,
          "0-49": 0,
        };
        for (const s of scores) {
          if (s >= 90) dist["90-100"]++;
          else if (s >= 80) dist["80-89"]++;
          else if (s >= 70) dist["70-79"]++;
          else if (s >= 60) dist["60-69"]++;
          else if (s >= 50) dist["50-59"]++;
          else dist["0-49"]++;
        }

        // Below threshold
        const belowThreshold = requirements
          .filter((r) => (r.qaScore ?? 0) < minScore)
          .sort((a, b) => (a.qaScore ?? 0) - (b.qaScore ?? 0));

        const lines = [
          `## Quality Report${documentSlug ? ` — ${documentSlug}` : ""}\n`,
          `- **Total requirements:** ${total}`,
          `- **Average score:** ${avg.toFixed(1)}`,
          `- **Median score:** ${median}`,
          `\n### Score Distribution\n`,
          ...Object.entries(dist).map(([range, count]) => {
            const bar = "█".repeat(Math.round((count / total) * 30));
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
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_compliance_report ───────────────────────────────────
  server.tool(
    "get_compliance_report",
    "Compliance status overview. Shows breakdown by status with details for at-risk and non-compliant requirements.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("Scope to this document. Omit for entire project."),
    },
    async ({ project, tenant, documentSlug }) => {
      try {
        let requirements: Requirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{ requirements?: Array<Requirement> }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
          requirements = [];
          for (const sec of secData.sections ?? []) {
            requirements.push(...(sec.requirements ?? []));
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

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
          `## Compliance Report${documentSlug ? ` — ${documentSlug}` : ""}\n`,
          `**Total requirements:** ${total}\n`,
        ];

        for (const [status, reqs] of Object.entries(groups)) {
          if (reqs.length === 0) continue;
          lines.push(
            `### ${status}: ${reqs.length} (${pct(reqs.length, total)})\n`,
          );

          // Show details for risk/non-compliant
          if (
            status === "Compliance Risk" ||
            status === "Non-Compliant"
          ) {
            for (const r of reqs.slice(0, 10)) {
              lines.push(`- **${r.ref ?? "?"}**: ${truncate(r.text ?? "", 80)}`);
              if (r.complianceRationale)
                lines.push(`  _Rationale: ${truncate(r.complianceRationale, 120)}_`);
            }
            if (reqs.length > 10)
              lines.push(`_... and ${reqs.length - 10} more_`);
            lines.push("");
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_orphan_requirements ─────────────────────────────────
  server.tool(
    "get_orphan_requirements",
    "Find requirements with no trace links — these represent traceability gaps.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      direction: z
        .enum(["any", "no_parents", "no_children", "completely_isolated"])
        .optional()
        .describe(
          "'any' = missing parent or child. 'no_parents' = no incoming links. 'no_children' = no outgoing links. 'completely_isolated' = no links at all. Default: completely_isolated",
        ),
      documentSlug: z.string().optional().describe("Scope to this document"),
    },
    async ({ project, tenant, direction, documentSlug }) => {
      try {
        const mode = direction ?? "completely_isolated";

        let requirements: Requirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{ requirements?: Array<Requirement> }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
          requirements = [];
          for (const sec of secData.sections ?? []) {
            requirements.push(...(sec.requirements ?? []));
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

        const links = await fetchTraceLinks(client, tenant, project);

        // Build parent/child sets
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
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── get_requirement_impact ──────────────────────────────────
  server.tool(
    "get_requirement_impact",
    "Trace the full impact chain from a requirement — upstream parents and downstream children. Essential for change impact analysis.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      requirementId: z.string().describe("Starting requirement ID"),
      direction: z
        .enum(["upstream", "downstream", "both"])
        .optional()
        .describe("Trace direction. Default: both."),
      maxDepth: z
        .number()
        .optional()
        .describe("Maximum link depth to traverse. Default: 5."),
    },
    async ({ project, tenant, requirementId, direction, maxDepth }) => {
      try {
        const dir = direction ?? "both";
        const depth = maxDepth ?? 5;

        // Fetch all requirements and trace links
        const [allReqs, allLinks] = await Promise.all([
          fetchAllRequirements(client, tenant, project),
          fetchTraceLinks(client, tenant, project),
        ]);

        const reqById = new Map(
          allReqs.map((r) => [r.id, r]),
        );

        // Build adjacency: source → targets (downstream), target → sources (upstream)
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

        // BFS traversal
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

        const startReq = reqById.get(requirementId);
        const lines = [
          `## Impact Analysis\n`,
          `**Starting requirement:** ${startReq?.ref ?? requirementId}`,
          startReq?.text ? `**Text:** ${truncate(startReq.text, 100)}` : "",
          `**Direction:** ${dir} | **Max depth:** ${depth}\n`,
        ].filter(Boolean);

        let upstreamNodes: ImpactNode[] = [];
        let downstreamNodes: ImpactNode[] = [];

        if (dir === "upstream" || dir === "both") {
          upstreamNodes = traverse(requirementId, upstream, depth);
        }
        if (dir === "downstream" || dir === "both") {
          downstreamNodes = traverse(requirementId, downstream, depth);
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
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
