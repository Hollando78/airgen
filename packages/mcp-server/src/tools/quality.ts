import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError } from "../format.js";

export function registerQualityTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "analyze_requirement_quality",
    "Analyze requirement quality using AIRGen's deterministic QA engine (ISO/IEC/IEEE 29148 + EARS). Returns score, verdict, and suggestions. Set autoFix=true to also get an automatically fixed version.",
    {
      text: z.string().describe("Requirement text to analyze"),
      autoFix: z
        .boolean()
        .optional()
        .describe("If true, also return an auto-fixed version with ambiguities removed and weak modals strengthened. Default: false"),
    },
    async ({ text, autoFix }) => {
      try {
        const data = await client.post<{
          score: number;
          verdict: string;
          pattern?: string;
          verification?: string;
          hits?: Array<{ rule: string; ok: boolean; message?: string }>;
          suggestions?: string[];
        }>("/qa", { text });

        const lines: string[] = [
          `## QA Analysis`,
          `**Score:** ${data.score}/100 (${data.verdict})`,
        ];

        if (data.pattern) lines.push(`**Detected Pattern:** ${data.pattern}`);
        if (data.verification) lines.push(`**Verification Method:** ${data.verification}`);

        if (data.hits?.length) {
          const failed = data.hits.filter(h => !h.ok);
          const passed = data.hits.filter(h => h.ok);
          if (failed.length > 0) {
            lines.push(`\n**Failed Rules (${failed.length}):**`);
            for (const h of failed) {
              lines.push(`- \u274C ${h.rule}${h.message ? `: ${h.message}` : ""}`);
            }
          }
          if (passed.length > 0) {
            lines.push(`\n**Passed Rules (${passed.length}):**`);
            for (const h of passed) {
              lines.push(`- \u2705 ${h.rule}`);
            }
          }
        }

        if (data.suggestions?.length) {
          lines.push(`\n**Suggestions:**`);
          for (const s of data.suggestions) {
            lines.push(`- ${s}`);
          }
        }

        // Auto-fix if requested
        if (autoFix) {
          try {
            const fixData = await client.post<{
              before: string;
              after: string;
              notes?: string[];
            }>("/apply-fix", { text });

            lines.push(`\n## Auto-Fix`);
            lines.push(`**Original:** ${fixData.before}`);
            lines.push(`**Fixed:** ${fixData.after}`);

            if (fixData.notes?.length) {
              lines.push(`\n**Changes Applied:**`);
              for (const note of fixData.notes) {
                lines.push(`- ${note}`);
              }
            }
          } catch {
            lines.push(`\n_Auto-fix unavailable._`);
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── Background QA Scorer ──────────────────────────────────────
  server.tool(
    "score_project_quality",
    "Start, check status, or stop the background QA scorer that analyses all requirements in a project. Action 'start' kicks off scoring (fire-and-forget). Action 'status' returns progress. Action 'stop' cancels a running job.",
    {
      action: z.enum(["start", "status", "stop"]).describe("Operation to perform"),
      tenant: z.string().optional().describe("(start) Tenant slug"),
      project: z.string().optional().describe("(start) Project slug"),
    },
    async ({ action, tenant, project }) => {
      try {
        switch (action) {
          case "start": {
            if (!tenant || !project) return ok("start requires 'tenant' and 'project'.");
            const data = await client.post<{
              message: string;
              status: {
                isRunning: boolean;
                processedCount: number;
                totalCount: number;
                currentRequirement?: string;
              };
            }>("/workers/qa-scorer/start", { tenant, project });

            const s = data.status;
            return ok(
              `QA scoring started.\n\n` +
                `- **Status:** ${s.isRunning ? "running" : "queued"}\n` +
                `- **Total requirements:** ${s.totalCount}\n` +
                `- **Message:** ${data.message}`,
            );
          }

          case "status": {
            const data = await client.get<{
              isRunning: boolean;
              processedCount: number;
              totalCount: number;
              currentRequirement?: string | null;
              lastError?: string | null;
              startedAt?: string | null;
              completedAt?: string | null;
            }>("/workers/qa-scorer/status");

            const pct = data.totalCount > 0
              ? ((data.processedCount / data.totalCount) * 100).toFixed(1) + "%"
              : "N/A";

            const lines = [
              `## QA Scorer Status\n`,
              `- **Running:** ${data.isRunning ? "yes" : "no"}`,
              `- **Progress:** ${data.processedCount}/${data.totalCount} (${pct})`,
            ];
            if (data.currentRequirement) lines.push(`- **Current:** ${data.currentRequirement}`);
            if (data.lastError) lines.push(`- **Last error:** ${data.lastError}`);
            if (data.startedAt) lines.push(`- **Started:** ${data.startedAt}`);
            if (data.completedAt) lines.push(`- **Completed:** ${data.completedAt}`);
            return ok(lines.join("\n"));
          }

          case "stop": {
            const data = await client.post<{ message: string }>("/workers/qa-scorer/stop", {});
            return ok(data.message ?? "QA scorer stop requested.");
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "draft_requirements",
    "Generate multiple candidate requirement texts from a natural language description. Uses AIRGen's heuristic drafting engine with optional LLM enhancement. Returns candidates with quality scores.",
    {
      user_input: z.string().describe("Natural language description of what you need requirements for"),
      glossary: z.string().optional().describe("Domain glossary or terminology to use"),
      constraints: z.string().optional().describe("Constraints or rules to follow"),
      n: z.number().optional().describe("Number of candidates to generate (default 5)"),
    },
    async ({ user_input, glossary, constraints, n }) => {
      try {
        const data = await client.post<{
          count: number;
          items: Array<{
            text: string;
            qa?: {
              score?: number;
              verdict?: string;
              suggestions?: string[];
            };
          }>;
        }>("/draft/candidates", {
          user_input,
          glossary,
          constraints,
          n: n ?? 5,
        });

        const items = data.items ?? [];
        if (items.length === 0) return ok("No candidates generated.");

        const lines: string[] = [`## Draft Candidates (${items.length})\n`];
        for (let i = 0; i < items.length; i++) {
          const c = items[i];
          const score = c.qa?.score != null ? ` (QA: ${c.qa.score}/100 — ${c.qa.verdict ?? ""})` : "";
          lines.push(`${i + 1}. ${c.text}${score}`);
          if (c.qa?.suggestions?.length) {
            for (const s of c.qa.suggestions) {
              lines.push(`   - ${s}`);
            }
          }
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
