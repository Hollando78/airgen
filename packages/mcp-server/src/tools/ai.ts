import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

export function registerAiTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "airgen_generate",
    "Use AIRGen's AI to generate requirement candidates from a natural language prompt. Candidates are stored in the project for review. You can then use list_candidates, accept_candidate, or reject_candidate to manage them.",
    {
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      user_input: z.string().describe("Natural language description of requirements needed"),
      glossary: z.string().optional().describe("Domain glossary or terminology"),
      constraints: z.string().optional().describe("Constraints or rules to follow"),
      n: z.number().optional().describe("Number of candidates to generate (default 5)"),
    },
    async (args) => {
      try {
        const data = await client.post<{
          prompt?: string;
          items?: Array<{
            id: string;
            text: string;
            status?: string;
            qa?: { score?: number; verdict?: string; suggestions?: string[] };
            qaScore?: number;
            qaVerdict?: string;
          }>;
          message?: string;
        }>("/airgen/chat", {
          tenant: args.tenant,
          projectKey: args.projectKey,
          user_input: args.user_input,
          glossary: args.glossary,
          constraints: args.constraints,
          n: args.n ?? 5,
          mode: "requirements",
        });

        const items = data.items ?? [];
        if (items.length === 0) {
          return ok(data.message ?? "No candidates generated. Try providing more context.");
        }

        const lines: string[] = [`## Generated ${items.length} Candidates\n`];
        for (let i = 0; i < items.length; i++) {
          const c = items[i];
          const score = c.qa?.score ?? c.qaScore;
          const scoreStr = score != null ? ` (QA: ${score}/100)` : "";
          lines.push(`${i + 1}. ${c.text}${scoreStr}`);
          lines.push(`   ID: ${c.id}`);
        }
        lines.push(`\nUse **accept_candidate** or **reject_candidate** to process these.`);
        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "list_candidates",
    "List pending AI-generated requirement candidates for a project",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
    },
    async ({ tenant, project }) => {
      try {
        const data = await client.get<{
          candidates?: Array<{
            id: string;
            text: string;
            status: string;
            score?: number;
            createdAt?: string;
          }>;
          items?: Array<{
            id: string;
            text: string;
            status: string;
            score?: number;
            createdAt?: string;
          }>;
        }>(`/airgen/candidates/${tenant}/${project}`);

        const candidates = data.candidates ?? data.items ?? [];
        if (candidates.length === 0) return ok("No pending candidates.");

        const lines: string[] = [`## Candidates (${candidates.length})\n`];
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          const score = c.score != null ? ` (QA: ${c.score}/100)` : "";
          const status = c.status !== "pending" ? ` [${c.status}]` : "";
          lines.push(`${i + 1}. ${truncate(c.text, 150)}${score}${status}`);
          lines.push(`   ID: ${c.id}`);
        }
        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "accept_candidate",
    "Accept an AI-generated candidate, promoting it to an actual requirement in the project. Optionally assign to a document/section.",
    {
      candidateId: z.string().describe("Candidate ID to accept"),
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
      pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional()
        .describe("EARS requirement pattern to assign"),
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional()
        .describe("Verification method"),
      documentSlug: z.string().optional().describe("Assign to this document"),
      sectionId: z.string().optional().describe("Assign to this section"),
      tags: z.array(z.string()).optional().describe("Tags to attach"),
    },
    async ({ candidateId, ...body }) => {
      try {
        const data = await client.post<{
          candidate?: { text: string; status: string };
          requirement?: { ref: string; text: string };
        }>(`/airgen/candidates/${candidateId}/accept`, body);

        const ref = data.requirement?.ref ?? "?";
        const text = data.requirement?.text ?? data.candidate?.text ?? "";
        return ok(`Candidate accepted → **${ref}**: ${truncate(text, 200)}`);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  server.tool(
    "reject_candidate",
    "Reject an AI-generated candidate (archives it but preserves the record)",
    {
      candidateId: z.string().describe("Candidate ID to reject"),
      tenant: z.string().describe("Tenant slug"),
      projectKey: z.string().describe("Project slug/key"),
    },
    async ({ candidateId, tenant, projectKey }) => {
      try {
        await client.post(`/airgen/candidates/${candidateId}/reject`, { tenant, projectKey });
        return ok(`Candidate ${candidateId} rejected.`);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
