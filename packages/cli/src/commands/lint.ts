import { writeFileSync } from "node:fs";
import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { UhtClient, type UhtClassification, type UhtBatchResult } from "../uht-client.js";
import { output, isJsonMode, truncate } from "../output.js";

// ── Types ────────────────────────────────────────────────────

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  tags?: string[];
  pattern?: string;
  verification?: string;
  qaScore?: number | null;
  complianceStatus?: string;
  attributes?: Record<string, string | number | boolean | null>;
  deleted?: boolean;
  deletedAt?: string | null;
}

interface LintFinding {
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  affectedReqs: string[];
  recommendation: string;
}

interface ConceptInfo {
  name: string;
  hexCode: string;
  isPhysical: boolean;
  traits: string[];
  reqs: string[];        // requirement refs that mention this concept
}

// ── Constants ────────────────────────────────────────────────

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

// ── Helpers ──────────────────────────────────────────────────

async function fetchAllRequirements(
  client: AirgenClient, tenant: string, project: string,
): Promise<Requirement[]> {
  const all: Requirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    all.push(...(data.data ?? []));
    if (page >= (data.meta?.totalPages ?? 1)) break;
  }
  return all.filter(r => !r.deleted && !r.deletedAt);
}

/**
 * Extract domain concepts from requirement text.
 * Looks for:
 *  - Subjects: "The <concept> shall..."
 *  - References: "using the <concept>", "via the <concept>", "from the <concept>"
 *  - Named systems: multi-word capitalized terms, known patterns
 */
function extractConcepts(requirements: Requirement[]): Map<string, string[]> {
  const conceptRefs = new Map<string, string[]>();

  function addConcept(concept: string, ref: string) {
    const normalized = concept.toLowerCase().trim();
    if (normalized.length < 3 || normalized.length > 60) return;
    // Skip generic words
    const skip = new Set(["system", "the system", "it", "this", "all", "each", "any"]);
    if (skip.has(normalized)) return;
    const refs = conceptRefs.get(normalized) ?? [];
    if (!refs.includes(ref)) refs.push(ref);
    conceptRefs.set(normalized, refs);
  }

  for (const req of requirements) {
    if (!req.text || !req.ref) continue;
    const text = req.text;

    // "The <concept> shall"
    const subjectMatch = text.match(/^(?:the|a|an)\s+(.+?)\s+shall\b/i);
    if (subjectMatch) addConcept(subjectMatch[1], req.ref);

    // "If the <concept> detects/is/has..."
    const ifMatch = text.match(/^if\s+the\s+(.+?)\s+(?:detects?|is|has|does|fails?|receives?)\b/i);
    if (ifMatch) addConcept(ifMatch[1], req.ref);

    // "While the <concept> is..."
    const whileMatch = text.match(/^while\s+(?:the\s+)?(.+?)\s+is\b/i);
    if (whileMatch) addConcept(whileMatch[1], req.ref);

    // "When the <concept> designates/detects..."
    const whenMatch = text.match(/^when\s+the\s+(.+?)\s+(?:designates?|detects?|receives?|completes?)\b/i);
    if (whenMatch) addConcept(whenMatch[1], req.ref);

    // References: "using the X", "via X", "from the X", "to the X"
    const refPatterns = [
      /using\s+(?:the\s+)?(.+?)(?:\s+(?:for|to|at|in|with)\b|[.,;]|$)/gi,
      /via\s+(?:the\s+)?(.+?)(?:\s+(?:for|to|at|in|with)\b|[.,;]|$)/gi,
      /from\s+the\s+(.+?)(?:\s+(?:for|to|at|in|with)\b|[.,;]|$)/gi,
      /(?:to|into)\s+the\s+(.+?)(?:\s+(?:for|to|at|in|with)\b|[.,;]|$)/gi,
      /(?:against|per|in accordance with)\s+(.+?)(?:\s+(?:for|to|at|in|with)\b|[.,;]|$)/gi,
    ];
    for (const pat of refPatterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        addConcept(m[1], req.ref);
      }
    }
  }

  return conceptRefs;
}

/**
 * Rank concepts by frequency and pick top N.
 */
function topConcepts(conceptRefs: Map<string, string[]>, maxCount: number): Array<[string, string[]]> {
  return [...conceptRefs.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxCount);
}

// ── Analysis ─────────────────────────────────────────────────

function analyzeFindings(
  concepts: ConceptInfo[],
  comparisons: UhtBatchResult[],
  requirements: Requirement[],
): LintFinding[] {
  const findings: LintFinding[] = [];
  const conceptMap = new Map(concepts.map(c => [c.name, c]));

  // 1. Physical mismatch: non-physical concepts with environmental/physical requirements
  const envKeywords = /temperature|shock|vibrat|humidity|nbc|contamina|electromagnetic|emc|climatic/i;
  for (const c of concepts) {
    if (c.isPhysical) continue;
    const envReqs = c.reqs.filter(ref => {
      const req = requirements.find(r => r.ref === ref);
      return req?.text && envKeywords.test(req.text);
    });
    if (envReqs.length > 0) {
      findings.push({
        severity: "high",
        category: "Ontological Mismatch",
        title: `"${c.name}" lacks Physical Object trait but has physical constraints`,
        description: `UHT classifies "${c.name}" (${c.hexCode}) without the Physical Object trait, but ${envReqs.length} requirement(s) impose physical/environmental constraints on it.`,
        affectedReqs: envReqs,
        recommendation: `Add a requirement defining the physical embodiment of "${c.name}" (e.g., housing, LRU, equipment rack).`,
      });
    }
  }

  // 2. Abstract metrics without statistical parameters
  const metricKeywords = /probability|rate|percentage|ratio|mtbf|availability/i;
  const statKeywords = /confidence|sample size|number of|minimum of \d+ |statistical/i;
  for (const c of concepts) {
    if (c.traits.length > 3) continue; // very abstract = few traits
    const metricReqs = c.reqs.filter(ref => {
      const req = requirements.find(r => r.ref === ref);
      return req?.text && metricKeywords.test(req.text);
    });
    if (metricReqs.length === 0) continue;
    const hasStats = metricReqs.some(ref => {
      const req = requirements.find(r => r.ref === ref);
      return req?.text && statKeywords.test(req.text);
    });
    if (!hasStats) {
      findings.push({
        severity: "medium",
        category: "Missing Statistical Context",
        title: `"${c.name}" is an abstract metric without statistical parameters`,
        description: `"${c.name}" (${c.hexCode}) has only ${c.traits.length} UHT traits (very abstract). Requirements set thresholds but don't specify confidence level, sample size, or test conditions.`,
        affectedReqs: metricReqs,
        recommendation: `Add statistical parameters (confidence level, sample size, conditions) to requirements referencing "${c.name}".`,
      });
    }
  }

  // 3. Verification requirements mixed with functional requirements
  const verificationReqs = requirements.filter(r =>
    r.text && /shall be verified|verification|shall be demonstrated|shall be tested/i.test(r.text)
  );
  const functionalReqs = requirements.filter(r =>
    r.text && /shall\b/i.test(r.text) && !/shall be verified|verification/i.test(r.text)
  );
  if (verificationReqs.length > 0 && functionalReqs.length > 0) {
    const ratio = verificationReqs.length / requirements.length;
    if (ratio > 0.05 && ratio < 0.95) {
      findings.push({
        severity: "medium",
        category: "Structural Issue",
        title: "Verification requirements mixed with functional requirements",
        description: `${verificationReqs.length} verification requirement(s) (${(ratio * 100).toFixed(0)}%) are co-mingled with ${functionalReqs.length} functional requirements. This makes traceability harder.`,
        affectedReqs: verificationReqs.map(r => r.ref!).filter(Boolean),
        recommendation: "Move verification requirements to a separate document or tag them with a distinct pattern. Create trace links to parent functional requirements.",
      });
    }
  }

  // 4. Degraded mode gaps: requirements mentioning "manual", "reversion", "fallback" without performance criteria
  const degradedReqs = requirements.filter(r =>
    r.text && /manual\s+(?:reversion|mode|override|backup)|fallback|degraded/i.test(r.text)
  );
  for (const req of degradedReqs) {
    const hasPerf = /\d+%|\d+\s*(?:second|ms|metre|meter|m\b)/i.test(req.text ?? "");
    if (!hasPerf) {
      findings.push({
        severity: "medium",
        category: "Coverage Gap",
        title: `Degraded mode without performance criteria: ${req.ref}`,
        description: `${req.ref} specifies a degraded/manual mode but provides no acceptance criteria for performance in that mode.`,
        affectedReqs: [req.ref!],
        recommendation: "Add measurable performance criteria for degraded operation (e.g., acceptable accuracy, response time, available subsystems).",
      });
    }
  }

  // 5. Cross-comparison: high similarity between concepts in different categories
  for (const batch of comparisons) {
    for (const comp of batch.comparisons) {
      const a = conceptMap.get(batch.entity);
      const b = conceptMap.get(comp.candidate);
      if (!a || !b) continue;

      // Different physical classification but high similarity = potential confusion
      if (comp.jaccard_similarity > 0.6 && a.isPhysical !== b.isPhysical) {
        findings.push({
          severity: "low",
          category: "Ontological Ambiguity",
          title: `"${a.name}" and "${b.name}" are similar (${(comp.jaccard_similarity * 100).toFixed(0)}%) but differ in physical classification`,
          description: `"${a.name}" is ${a.isPhysical ? "" : "not "}a Physical Object; "${b.name}" is ${b.isPhysical ? "" : "not "}. High Jaccard similarity (${comp.jaccard_similarity.toFixed(3)}) suggests they should be treated consistently.`,
          affectedReqs: [...a.reqs, ...b.reqs],
          recommendation: `Review whether both concepts should have consistent physical classification. Consider adding clarifying requirements.`,
        });
      }
    }
  }

  // 6. Requirements without "shall" (weak language)
  const weakReqs = requirements.filter(r =>
    r.text && !/\bshall\b/i.test(r.text) && !/shall be verified/i.test(r.text)
  );
  if (weakReqs.length > 0) {
    findings.push({
      severity: "low",
      category: "Language Quality",
      title: `${weakReqs.length} requirement(s) lack "shall" keyword`,
      description: `Requirements without "shall" may be informational text rather than testable requirements.`,
      affectedReqs: weakReqs.map(r => r.ref!).filter(Boolean),
      recommendation: 'Rephrase using "shall" for testable requirements, or move informational text to notes/rationale.',
    });
  }

  return findings.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ── Report formatting ────────────────────────────────────────

function formatReport(
  tenant: string,
  project: string,
  requirements: Requirement[],
  concepts: ConceptInfo[],
  comparisons: UhtBatchResult[],
  findings: LintFinding[],
): string {
  const lines: string[] = [];
  const high = findings.filter(f => f.severity === "high").length;
  const med = findings.filter(f => f.severity === "medium").length;
  const low = findings.filter(f => f.severity === "low").length;

  lines.push("  Semantic Lint Report");
  lines.push("  ════════════════════");
  lines.push(`  Project: ${project} (${tenant})`);
  lines.push(`  Requirements: ${requirements.length} | Concepts classified: ${concepts.length}`);
  lines.push(`  Findings: ${findings.length} (${high} high, ${med} medium, ${low} low)`);
  lines.push("");

  // Concept classifications table
  lines.push("  ┄┄ Concept Classifications ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  lines.push("");
  const nameW = Math.max(...concepts.map(c => c.name.length), 10);
  for (const c of concepts) {
    const phys = c.isPhysical ? "Physical" : "Abstract";
    const pad = " ".repeat(Math.max(0, nameW - c.name.length));
    lines.push(`    ${c.name}${pad}  ${c.hexCode}  ${phys.padEnd(8)}  ${c.traits.slice(0, 4).join(", ")}${c.traits.length > 4 ? "..." : ""}`);
  }
  lines.push("");

  // Cross-comparison highlights
  if (comparisons.length > 0) {
    lines.push("  ┄┄ Key Similarities ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
    lines.push("");
    for (const batch of comparisons) {
      for (const comp of batch.comparisons) {
        if (comp.jaccard_similarity >= 0.4) {
          const pct = (comp.jaccard_similarity * 100).toFixed(0);
          lines.push(`    ${batch.entity} ↔ ${comp.candidate}: ${pct}% Jaccard`);
        }
      }
    }
    lines.push("");
  }

  // Findings
  lines.push("  ┄┄ Findings ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  lines.push("");

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const sevIcon = f.severity === "high" ? "!!!" : f.severity === "medium" ? " ! " : " . ";
    lines.push(`  ${i + 1}. [${sevIcon}] ${f.title}`);
    lines.push(`     Category: ${f.category}`);
    lines.push(`     ${f.description}`);
    lines.push(`     Affects: ${f.affectedReqs.join(", ")}`);
    lines.push(`     Fix: ${f.recommendation}`);
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push("  No findings — requirements look clean.");
    lines.push("");
  }

  return lines.join("\n");
}

function formatMarkdown(
  tenant: string,
  project: string,
  requirements: Requirement[],
  concepts: ConceptInfo[],
  comparisons: UhtBatchResult[],
  findings: LintFinding[],
): string {
  const lines: string[] = [];
  const high = findings.filter(f => f.severity === "high").length;
  const med = findings.filter(f => f.severity === "medium").length;
  const low = findings.filter(f => f.severity === "low").length;

  lines.push("## Semantic Lint Report");
  lines.push(`**Project:** ${project} (\`${tenant}\`)  `);
  lines.push(`**Requirements:** ${requirements.length} | **Concepts classified:** ${concepts.length}  `);
  lines.push(`**Findings:** ${findings.length} (${high} high, ${med} medium, ${low} low)`);
  lines.push("");

  // Concept table
  lines.push("### Concept Classifications");
  lines.push("| Concept | UHT Code | Physical? | Key Traits |");
  lines.push("|---|---|---|---|");
  for (const c of concepts) {
    lines.push(`| ${c.name} | \`${c.hexCode}\` | ${c.isPhysical ? "Yes" : "No"} | ${c.traits.slice(0, 4).join(", ")} |`);
  }
  lines.push("");

  // Similarities
  if (comparisons.length > 0) {
    lines.push("### Key Similarities");
    lines.push("| Pair | Jaccard |");
    lines.push("|---|---|");
    for (const batch of comparisons) {
      for (const comp of batch.comparisons) {
        if (comp.jaccard_similarity >= 0.4) {
          lines.push(`| ${batch.entity} / ${comp.candidate} | **${(comp.jaccard_similarity * 100).toFixed(0)}%** |`);
        }
      }
    }
    lines.push("");
  }

  // Findings
  lines.push("### Findings");
  lines.push("| # | Severity | Title | Affected |");
  lines.push("|---|---|---|---|");
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    lines.push(`| ${i + 1} | **${f.severity}** | ${f.title} | ${f.affectedReqs.join(", ")} |`);
  }
  lines.push("");

  for (const f of findings) {
    lines.push(`#### ${f.title}`);
    lines.push(`- **Severity:** ${f.severity} | **Category:** ${f.category}`);
    lines.push(`- ${f.description}`);
    lines.push(`- **Affects:** ${f.affectedReqs.join(", ")}`);
    lines.push(`- **Recommendation:** ${f.recommendation}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Command registration ─────────────────────────────────────

export function registerLintCommands(program: Command, client: AirgenClient) {
  program
    .command("lint")
    .description("Semantic requirements lint — classifies domain concepts via UHT and flags ontological issues")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--concepts <n>", "Max concepts to classify", "15")
    .option("--format <fmt>", "Output format: text, markdown, json", "text")
    .option("-o, --output <file>", "Write report to file")
    .action(async (tenant: string, project: string, opts: {
      concepts: string; format: string; output?: string;
    }) => {
      const uht = new UhtClient();
      if (!uht.isConfigured) {
        console.error("UHT not configured. Set UHT_TOKEN environment variable.");
        console.error("Get a token at https://universalhex.org");
        process.exit(1);
      }

      const maxConcepts = parseInt(opts.concepts, 10) || 15;

      // Step 1: Fetch all requirements
      console.error("Fetching requirements...");
      const requirements = await fetchAllRequirements(client, tenant, project);
      if (requirements.length === 0) {
        console.error("No requirements found.");
        process.exit(1);
      }
      console.error(`  ${requirements.length} requirements loaded.`);

      // Step 2: Extract domain concepts
      console.error("Extracting domain concepts...");
      const conceptRefs = extractConcepts(requirements);
      const top = topConcepts(conceptRefs, maxConcepts);
      console.error(`  ${conceptRefs.size} unique concepts found, classifying top ${top.length}.`);

      // Step 3: Classify each concept via UHT
      console.error("Classifying concepts via UHT...");
      const concepts: ConceptInfo[] = [];
      for (const [name, refs] of top) {
        try {
          const result = await uht.classify(name);
          const traitNames = result.traits.map(t => t.name).filter(Boolean);
          concepts.push({
            name,
            hexCode: result.hex_code,
            isPhysical: traitNames.includes("Physical Object"),
            traits: traitNames,
            reqs: refs,
          });
          console.error(`  ✓ ${name} → ${result.hex_code} (${traitNames.length} traits)`);
        } catch (err) {
          console.error(`  ✗ ${name}: ${(err as Error).message}`);
        }
      }

      // Step 4: Cross-compare concepts in batches
      console.error("Cross-comparing concepts...");
      const comparisons: UhtBatchResult[] = [];
      if (concepts.length >= 2) {
        // Compare top concept against others, then second against rest
        const names = concepts.map(c => c.name);
        const batchSize = Math.min(names.length - 1, 15);
        try {
          const result = await uht.batchCompare(names[0], names.slice(1, batchSize + 1));
          comparisons.push(result);
          console.error(`  ✓ ${names[0]} vs ${batchSize} others`);
        } catch (err) {
          console.error(`  ✗ batch compare: ${(err as Error).message}`);
        }

        if (names.length > 3) {
          try {
            const mid = Math.floor(names.length / 2);
            const candidates = [...names.slice(0, mid), ...names.slice(mid + 1)].slice(0, 10);
            const result = await uht.batchCompare(names[mid], candidates);
            comparisons.push(result);
            console.error(`  ✓ ${names[mid]} vs ${candidates.length} others`);
          } catch (err) {
            console.error(`  ✗ batch compare: ${(err as Error).message}`);
          }
        }
      }

      // Step 5: Analyze findings
      console.error("Analyzing...");
      const findings = analyzeFindings(concepts, comparisons, requirements);

      // Step 6: Output report
      let report: string;
      if (opts.format === "json" || isJsonMode()) {
        const data = { tenant, project, requirements: requirements.length, concepts, comparisons, findings };
        report = JSON.stringify(data, null, 2);
      } else if (opts.format === "markdown") {
        report = formatMarkdown(tenant, project, requirements, concepts, comparisons, findings);
      } else {
        report = formatReport(tenant, project, requirements, concepts, comparisons, findings);
      }

      if (opts.output) {
        writeFileSync(opts.output, report + "\n", "utf-8");
        console.error(`Report written to ${opts.output}`);
      } else {
        console.log(report);
      }
    });
}
