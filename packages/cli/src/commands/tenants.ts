import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

export function registerTenantCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("tenants").description("Manage tenants");

  cmd
    .command("list")
    .description("List all tenants you have access to")
    .action(async () => {
      const data = await client.get<{ tenants: Array<{ slug: string; name?: string; createdAt?: string }> }>("/tenants");
      const tenants = data.tenants ?? [];
      if (isJsonMode()) {
        output(tenants);
      } else {
        printTable(
          ["Slug", "Name", "Created"],
          tenants.map(t => [t.slug, t.name ?? t.slug, t.createdAt ?? ""]),
        );
      }
    });
}
