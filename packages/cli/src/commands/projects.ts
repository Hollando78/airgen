import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

interface Project {
  slug: string;
  name?: string;
  key?: string;
  code?: string;
  description?: string;
  requirementCount?: number;
  documentCount?: number;
}

export function registerProjectCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("projects").alias("proj").description("Manage projects");

  cmd
    .command("list")
    .description("List all projects in a tenant")
    .argument("<tenant>", "Tenant slug")
    .action(async (tenant: string) => {
      const data = await client.get<{ projects: Project[] }>(`/tenants/${tenant}/projects`);
      const projects = data.projects ?? [];
      if (isJsonMode()) {
        output(projects);
      } else {
        printTable(
          ["Slug", "Name", "Code", "Reqs", "Docs"],
          projects.map(p => [
            p.slug,
            p.name ?? p.slug,
            p.code ?? "",
            String(p.requirementCount ?? 0),
            String(p.documentCount ?? 0),
          ]),
        );
      }
    });

  cmd
    .command("create")
    .description("Create a new project")
    .argument("<tenant>", "Tenant slug")
    .requiredOption("--name <name>", "Project name")
    .option("--key <key>", "Project key")
    .option("--code <code>", "Project code")
    .option("--slug <slug>", "Project slug (auto-generated from name if omitted)")
    .option("--description <desc>", "Description")
    .action(async (tenant: string, opts: { name: string; slug?: string; key?: string; code?: string; description?: string }) => {
      const slug = opts.slug ?? opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const data = await client.post(`/tenants/${tenant}/projects`, {
        slug,
        name: opts.name,
        key: opts.key,
        code: opts.code,
        description: opts.description,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Project created successfully.");
        output(data);
      }
    });

  cmd
    .command("delete")
    .description("Delete a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      await client.delete(`/tenants/${tenant}/projects/${project}`);
      console.log(`Project "${project}" deleted.`);
    });
}
