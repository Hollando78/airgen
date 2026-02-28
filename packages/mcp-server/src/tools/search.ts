import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

export function registerSearchTools(server: McpServer, client: AirgenClient) {
  server.tool(
    "search_requirements",
    "Search requirements. Modes: 'semantic' (natural language query), 'similar' (find requirements similar to a given one), 'duplicates' (detect potential duplicates of a given requirement).",
    {
      tenant: z.string().describe("Tenant slug"),
      project: z.string().describe("Project slug"),
      mode: z
        .enum(["semantic", "similar", "duplicates"])
        .optional()
        .describe("Search mode. Default: semantic"),
      query: z
        .string()
        .optional()
        .describe("(semantic) Natural language search query"),
      requirementId: z
        .string()
        .optional()
        .describe("(similar, duplicates) Requirement ID to find matches for"),
      limit: z.number().optional().describe("Max results (default 10 for semantic, 5 for similar)"),
      minSimilarity: z
        .number()
        .optional()
        .describe("(semantic, similar) Minimum similarity threshold 0-1"),
    },
    async ({ tenant, project, mode, query, requirementId, limit, minSimilarity }) => {
      try {
        const searchMode = mode ?? "semantic";

        switch (searchMode) {
          case "semantic": {
            if (!query) return ok("semantic mode requires 'query'.");
            const data = await client.post<{
              results: Array<{
                ref: string;
                text: string;
                similarity: number;
                qaScore?: number;
              }>;
            }>("/requirements/search/semantic", {
              tenant,
              project,
              query,
              limit: limit ?? 10,
              minSimilarity: minSimilarity ?? 0.5,
            });

            const results = data.results ?? [];
            if (results.length === 0) return ok("No matching requirements found.");

            const lines: string[] = [
              `## Search Results for "${query}" (${results.length} matches)\n`,
            ];
            for (let i = 0; i < results.length; i++) {
              const r = results[i];
              const sim = (r.similarity * 100).toFixed(1);
              const score = r.qaScore != null ? ` QA:${r.qaScore}` : "";
              lines.push(`${i + 1}. **${r.ref}** (${sim}% match${score})`);
              lines.push(`   ${truncate(r.text, 200)}`);
            }
            return ok(lines.join("\n"));
          }

          case "similar": {
            if (!requirementId) return ok("similar mode requires 'requirementId'.");
            const data = await client.get<{
              similar: Array<{
                id: string;
                ref: string;
                text: string;
                similarity: number;
              }>;
            }>(`/requirements/${tenant}/${project}/${requirementId}/similar`, {
              limit,
              minSimilarity,
            });

            const results = data.similar ?? [];
            if (results.length === 0) return ok("No similar requirements found.");

            const lines: string[] = [`## Similar Requirements (${results.length})\n`];
            for (const r of results) {
              const sim = (r.similarity * 100).toFixed(1);
              lines.push(`- **${r.ref}** (${sim}% similar): ${truncate(r.text, 200)}`);
            }
            return ok(lines.join("\n"));
          }

          case "duplicates": {
            if (!requirementId) return ok("duplicates mode requires 'requirementId'.");
            const data = await client.get<{
              duplicates: Array<{
                ref: string;
                text: string;
                similarity: number;
              }>;
            }>(`/requirements/${tenant}/${project}/${requirementId}/duplicates`);

            const duplicates = data.duplicates ?? [];
            if (duplicates.length === 0) return ok("No potential duplicates found.");

            const lines: string[] = [`## Potential Duplicates (${duplicates.length})\n`];
            for (const d of duplicates) {
              const sim = (d.similarity * 100).toFixed(1);
              lines.push(`- **${d.ref}** (${sim}% overlap): ${truncate(d.text, 200)}`);
            }
            return ok(lines.join("\n"));
          }
        }
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
