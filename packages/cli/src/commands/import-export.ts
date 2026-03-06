import { Command } from "commander";
import { readFileSync } from "node:fs";
import type { AirgenClient } from "../client.js";
import { output, isJsonMode } from "../output.js";

export function registerImportExportCommands(program: Command, client: AirgenClient) {
  const imp = program.command("import").description("Import requirements");

  imp
    .command("requirements")
    .description("Import requirements from CSV file (one per line)")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--file <path>", "Path to CSV file")
    .option("--document <slug>", "Target document slug")
    .option("--section <id>", "Target section ID")
    .option("--tags <tags>", "Comma-separated tags to apply to all")
    .option("--dry-run", "Preview without importing")
    .action(async (tenant: string, projectKey: string, opts: {
      file: string; document?: string; section?: string; tags?: string; dryRun?: boolean;
    }) => {
      const content = readFileSync(opts.file, "utf-8");
      const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      const tags = opts.tags?.split(",").map(t => t.trim());

      if (opts.dryRun) {
        console.log(`Would import ${lines.length} requirements.`);
        for (const line of lines.slice(0, 5)) {
          console.log(`  - ${line.slice(0, 80)}`);
        }
        if (lines.length > 5) console.log(`  ... and ${lines.length - 5} more`);
        return;
      }

      let created = 0;
      for (const text of lines) {
        await client.post("/requirements", {
          tenant,
          projectKey,
          text,
          documentSlug: opts.document,
          sectionId: opts.section,
          tags,
        });
        created++;
      }
      console.log(`Imported ${created} requirements.`);
    });

  const exp = program.command("export").description("Export data");

  exp
    .command("requirements")
    .description("Export requirements as markdown or JSON")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--document <slug>", "Export specific document as markdown")
    .option("--format <fmt>", "Format: json, markdown", "json")
    .action(async (tenant: string, project: string, opts: { document?: string; format: string }) => {
      if (opts.document && opts.format === "markdown") {
        const data = await client.get<{ markdown?: string; content?: string }>(
          `/markdown/${tenant}/${project}/${opts.document}/content`,
        );
        if (isJsonMode()) {
          output(data);
        } else {
          console.log(data.markdown ?? data.content ?? JSON.stringify(data, null, 2));
        }
      } else {
        // Export all as JSON
        const data = await client.get(`/requirements/${tenant}/${project}`, { page: "1", limit: "1000" });
        output(data);
      }
    });
}
