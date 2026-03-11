import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

interface Baseline {
  id: string;
  ref?: string;
  label?: string;
  createdAt?: string;
  requirementCount?: number;
}

export function registerBaselineCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("baselines").alias("bl").description("Baseline snapshots");

  cmd
    .command("list")
    .description("List all baselines for a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ items: Baseline[] }>(
        `/baselines/${tenant}/${project}`,
      );
      const baselines = data.items ?? [];
      if (isJsonMode()) {
        output(baselines);
      } else {
        printTable(
          ["Ref", "Label", "Created", "Requirements"],
          baselines.map(b => [
            b.ref ?? b.id,
            b.label ?? "",
            b.createdAt ?? "",
            String(b.requirementCount ?? 0),
          ]),
        );
      }
    });

  cmd
    .command("create")
    .description("Create a new baseline snapshot")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .option("--label <label>", "Baseline label")
    .action(async (tenant: string, projectKey: string, opts: { label?: string }) => {
      const data = await client.post("/baseline", {
        tenant,
        projectKey,
        label: opts.label,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Baseline created.");
        output(data);
      }
    });

  cmd
    .command("compare")
    .description("Compare two baselines")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .requiredOption("--from <ref>", "From baseline ref")
    .requiredOption("--to <ref>", "To baseline ref")
    .action(async (tenant: string, project: string, opts: { from: string; to: string }) => {
      const data = await client.get(
        `/baselines/${tenant}/${project}/compare`,
        { from: opts.from, to: opts.to },
      );
      output(data);
    });
}
