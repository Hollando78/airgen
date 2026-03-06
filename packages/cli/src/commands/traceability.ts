import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

interface TraceLink {
  id: string;
  sourceRequirementId?: string;
  sourceRef?: string;
  targetRequirementId?: string;
  targetRef?: string;
  linkType?: string;
  description?: string;
}

export function registerTraceabilityCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("traces").alias("trace").description("Traceability links");

  cmd
    .command("list")
    .description("List trace links in a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--requirement <id>", "Filter by requirement ID")
    .action(async (tenant: string, project: string, opts: { requirement?: string }) => {
      const path = opts.requirement
        ? `/trace-links/${tenant}/${project}/${opts.requirement}`
        : `/trace-links/${tenant}/${project}`;
      const data = await client.get<{ links: TraceLink[] }>(path);
      const links = data.links ?? [];
      if (isJsonMode()) {
        output(links);
      } else {
        printTable(
          ["ID", "Source", "Target", "Type", "Description"],
          links.map(l => [
            l.id,
            l.sourceRef ?? l.sourceRequirementId ?? "",
            l.targetRef ?? l.targetRequirementId ?? "",
            l.linkType ?? "",
            l.description ?? "",
          ]),
        );
      }
    });

  cmd
    .command("create")
    .description("Create a trace link between requirements")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--source <id>", "Source requirement ID")
    .requiredOption("--target <id>", "Target requirement ID")
    .requiredOption("--type <type>", "Link type: satisfies, derives, verifies, implements, refines, conflicts")
    .option("--description <desc>", "Description")
    .action(async (tenant: string, projectKey: string, opts: {
      source: string; target: string; type: string; description?: string;
    }) => {
      const data = await client.post("/trace-links", {
        tenant,
        projectKey,
        sourceRequirementId: opts.source,
        targetRequirementId: opts.target,
        linkType: opts.type,
        description: opts.description,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Trace link created.");
      }
    });

  cmd
    .command("delete")
    .description("Delete a trace link")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<link-id>", "Link ID")
    .action(async (tenant: string, project: string, linkId: string) => {
      await client.delete(`/trace-links/${tenant}/${project}/${linkId}`);
      console.log("Trace link deleted.");
    });

  // Linksets
  const linksets = cmd.command("linksets").description("Document linksets");

  linksets
    .command("list")
    .description("List document linksets")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get(`/linksets/${tenant}/${project}`);
      output(data);
    });

  linksets
    .command("create")
    .description("Create a document linkset")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .requiredOption("--source <slug>", "Source document slug")
    .requiredOption("--target <slug>", "Target document slug")
    .option("--link-type <type>", "Default link type")
    .action(async (tenant: string, project: string, opts: { source: string; target: string; linkType?: string }) => {
      const data = await client.post(`/linksets/${tenant}/${project}`, {
        sourceDocumentSlug: opts.source,
        targetDocumentSlug: opts.target,
        defaultLinkType: opts.linkType,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Linkset created.");
      }
    });

  linksets
    .command("delete")
    .description("Delete a linkset")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<linkset-id>", "Linkset ID")
    .action(async (tenant: string, project: string, linksetId: string) => {
      await client.delete(`/linksets/${tenant}/${project}/${linksetId}`);
      console.log("Linkset deleted.");
    });
}
