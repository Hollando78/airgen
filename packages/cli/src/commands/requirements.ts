import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";
import { resolveRequirementId } from "../resolve.js";

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  title?: string;
  pattern?: string;
  verification?: string;
  qaScore?: number | null;
  tags?: string[];
  rationale?: string;
  complianceStatus?: string;
  documentSlug?: string;
  sectionId?: string;
}

interface ListResponse {
  data: Requirement[];
  meta: { totalItems: number; currentPage: number; pageSize: number; totalPages: number };
}

export function registerRequirementCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("requirements").alias("reqs").description("Manage requirements");

  cmd
    .command("list")
    .description("List requirements with pagination and optional filters")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("-p, --page <n>", "Page number", "1")
    .option("-l, --limit <n>", "Items per page", "25")
    .option("--sort <field>", "Sort by: ref, createdAt, qaScore")
    .option("--order <dir>", "Sort order: asc, desc")
    .option("--tags <tags>", "Comma-separated tags to filter by (server-side)")
    .option("--document <slug>", "Filter by document slug (server-side)")
    .action(async (tenant: string, project: string, opts: {
      page: string; limit: string; sort?: string; order?: string;
      tags?: string; document?: string;
    }) => {
      const params: Record<string, string | undefined> = {
        page: opts.page,
        limit: opts.limit,
        sortBy: opts.sort,
        sortOrder: opts.order,
      };
      if (opts.tags) params.tags = opts.tags;
      if (opts.document) params.documentSlug = opts.document;

      const data = await client.get<ListResponse>(
        `/requirements/${tenant}/${project}`,
        params,
      );
      const reqs = data.data ?? [];
      const meta = data.meta;
      if (isJsonMode()) {
        output(data);
      } else {
        if (reqs.length === 0) {
          console.log("No requirements found.");
          return;
        }
        console.log(`Requirements (${meta?.totalItems ?? reqs.length} total, page ${meta?.currentPage ?? 1}/${meta?.totalPages ?? 1})\n`);
        printTable(
          ["Ref", "Text", "Pattern", "QA", "Tags"],
          reqs.map(r => [
            r.ref ?? "?",
            truncate(r.text ?? "", 60),
            r.pattern ?? "",
            r.qaScore != null ? String(r.qaScore) : "-",
            (r.tags ?? []).join(", "),
          ]),
        );
      }
    });

  cmd
    .command("get")
    .description("Get full details of a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<ref>", "Requirement reference (e.g. REQ-001)")
    .action(async (tenant: string, project: string, ref: string) => {
      const data = await client.get<{ record: Requirement }>(
        `/requirements/${tenant}/${project}/${ref}`,
      );
      const r = data.record ?? data;
      if (isJsonMode()) {
        output(r);
      } else {
        const lines = [
          `${r.ref ?? ref}${r.qaScore != null ? ` (QA: ${r.qaScore}/100)` : ""}`,
          "",
          r.title ? `Title: ${r.title}` : null,
          r.text ? `Text: ${r.text}` : null,
          r.pattern ? `Pattern: ${r.pattern}` : null,
          r.verification ? `Verification: ${r.verification}` : null,
          r.rationale ? `Rationale: ${r.rationale}` : null,
          r.complianceStatus ? `Compliance: ${r.complianceStatus}` : null,
          r.documentSlug ? `Document: ${r.documentSlug}${r.sectionId ? ` / ${r.sectionId}` : ""}` : null,
          r.tags?.length ? `Tags: ${r.tags.join(", ")}` : null,
          r.id ? `ID: ${r.id}` : null,
        ].filter(Boolean);
        console.log(lines.join("\n"));
      }
    });

  cmd
    .command("create")
    .description("Create a new requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--text <text>", "Requirement text")
    .option("--pattern <p>", "Pattern: ubiquitous, event, state, unwanted, optional")
    .option("--verification <v>", "Verification: Test, Analysis, Inspection, Demonstration")
    .option("--document <slug>", "Document slug")
    .option("--section <id>", "Section ID")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (tenant: string, projectKey: string, opts: {
      text: string; pattern?: string; verification?: string;
      document?: string; section?: string; tags?: string;
    }) => {
      const data = await client.post("/requirements", {
        tenant,
        projectKey,
        text: opts.text,
        pattern: opts.pattern,
        verification: opts.verification,
        documentSlug: opts.document,
        sectionId: opts.section,
        tags: opts.tags?.split(",").map(t => t.trim()),
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Requirement created.");
        output(data);
      }
    });

  cmd
    .command("update")
    .description("Update a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Requirement ref, ID, or hashId")
    .option("--text <text>", "Requirement text")
    .option("--pattern <p>", "Pattern")
    .option("--verification <v>", "Verification method")
    .option("--rationale <r>", "Rationale")
    .option("--compliance <status>", "Compliance status")
    .option("--section <id>", "Section ID")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (tenant: string, project: string, id: string, opts: {
      text?: string; pattern?: string; verification?: string;
      rationale?: string; compliance?: string; section?: string; tags?: string;
    }) => {
      const resolvedId = await resolveRequirementId(client, tenant, project, id);
      const body: Record<string, unknown> = {};
      if (opts.text) body.text = opts.text;
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.verification) body.verification = opts.verification;
      if (opts.rationale) body.rationale = opts.rationale;
      if (opts.compliance) body.complianceStatus = opts.compliance;
      if (opts.section) body.sectionId = opts.section;
      if (opts.tags) body.tags = opts.tags.split(",").map(t => t.trim());

      await client.patch(`/requirements/${tenant}/${project}/${resolvedId}`, body);
      if (isJsonMode()) {
        output({ ok: true });
      } else {
        console.log("Requirement updated.");
      }
    });

  cmd
    .command("delete")
    .description("Soft-delete a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Requirement ref, ID, or hashId")
    .action(async (tenant: string, project: string, id: string) => {
      const resolvedId = await resolveRequirementId(client, tenant, project, id);
      await client.delete(`/requirements/${tenant}/${project}/${resolvedId}`);
      console.log("Requirement deleted.");
    });

  cmd
    .command("history")
    .description("Get version history of a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<id>", "Requirement ref, ID, or hashId")
    .action(async (tenant: string, project: string, id: string) => {
      const resolvedId = await resolveRequirementId(client, tenant, project, id);
      const data = await client.get(`/requirements/${tenant}/${project}/${resolvedId}/history`);
      output(data);
    });

  cmd
    .command("search")
    .description("Search requirements (semantic, similar, duplicates)")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .requiredOption("-q, --query <text>", "Search query")
    .option("--mode <m>", "Mode: semantic, similar, duplicates", "semantic")
    .option("-l, --limit <n>", "Max results")
    .option("--min-similarity <n>", "Minimum similarity score")
    .action(async (tenant: string, project: string, opts: { query: string; mode: string; limit?: string; minSimilarity?: string }) => {
      if (opts.mode === "semantic") {
        const data = await client.post("/requirements/search/semantic", {
          tenant,
          project,
          query: opts.query,
          limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
          minSimilarity: opts.minSimilarity ? parseFloat(opts.minSimilarity) : undefined,
        });
        output(data);
      } else {
        // similar/duplicates modes need a requirementId
        console.error("Similar/duplicates modes require --requirement-id (not yet implemented in CLI).");
      }
    });

  cmd
    .command("filter")
    .description("Advanced server-side filtering with multiple criteria")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--pattern <p>", "Pattern filter")
    .option("--verification <v>", "Verification filter")
    .option("--compliance <status>", "Compliance status filter")
    .option("--qa-min <n>", "Min QA score")
    .option("--qa-max <n>", "Max QA score")
    .option("--document <slug>", "Document slug")
    .option("--section <id>", "Section ID")
    .option("--contains <text>", "Text contains (case-insensitive)")
    .option("-p, --page <n>", "Page number", "1")
    .option("-l, --limit <n>", "Items per page", "50")
    .option("--sort <field>", "Sort by: ref, createdAt, qaScore")
    .option("--order <dir>", "Sort order: asc, desc")
    .action(async (tenant: string, project: string, opts: {
      tags?: string; pattern?: string; verification?: string; compliance?: string;
      qaMin?: string; qaMax?: string; document?: string; section?: string;
      contains?: string; page: string; limit: string; sort?: string; order?: string;
    }) => {
      const params: Record<string, string | undefined> = {
        page: opts.page,
        limit: opts.limit,
        sortBy: opts.sort,
        sortOrder: opts.order,
      };
      if (opts.tags) params.tags = opts.tags;
      if (opts.pattern) params.pattern = opts.pattern;
      if (opts.verification) params.verification = opts.verification;
      if (opts.compliance) params.complianceStatus = opts.compliance;
      if (opts.qaMin) params.qaScoreMin = opts.qaMin;
      if (opts.qaMax) params.qaScoreMax = opts.qaMax;
      if (opts.document) params.documentSlug = opts.document;
      if (opts.section) params.sectionId = opts.section;
      if (opts.contains) params.textContains = opts.contains;

      const data = await client.get<ListResponse>(
        `/requirements/${tenant}/${project}`,
        params,
      );
      const reqs = data.data ?? [];

      if (isJsonMode()) {
        output(reqs);
      } else {
        console.log(`Filtered: ${reqs.length} requirements\n`);
        printTable(
          ["Ref", "Text", "Pattern", "QA"],
          reqs.map(r => [
            r.ref ?? "?",
            truncate(r.text ?? "", 60),
            r.pattern ?? "",
            r.qaScore != null ? String(r.qaScore) : "-",
          ]),
        );
      }
    });
}
