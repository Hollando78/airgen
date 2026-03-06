import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";

interface ActivityEntry {
  type?: string;
  action?: string;
  description?: string;
  createdAt?: string;
  user?: string;
}

export function registerActivityCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("activity").description("Project activity timeline");

  cmd
    .command("list")
    .description("Get activity timeline for a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("-l, --limit <n>", "Max entries")
    .option("--type <type>", "Activity type filter")
    .option("--action <action>", "Action type filter")
    .action(async (tenant: string, project: string, opts: { limit?: string; type?: string; action?: string }) => {
      const data = await client.get<{ activities: ActivityEntry[] }>(
        "/activity",
        {
          tenantSlug: tenant,
          projectSlug: project,
          limit: opts.limit,
          activityTypes: opts.type,
          actionTypes: opts.action,
        },
      );
      const activities = data.activities ?? [];
      if (isJsonMode()) {
        output(activities);
      } else {
        printTable(
          ["Time", "Type", "Action", "Description"],
          activities.map(a => [
            a.createdAt ?? "",
            a.type ?? "",
            a.action ?? "",
            truncate(a.description ?? "", 60),
          ]),
        );
      }
    });
}
