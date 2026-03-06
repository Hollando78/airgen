import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode } from "../output.js";

interface Document {
  slug: string;
  name?: string;
  code?: string;
  kind?: string;
  description?: string;
  sectionCount?: number;
  requirementCount?: number;
}

export function registerDocumentCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("documents").alias("docs").description("Manage documents");

  cmd
    .command("list")
    .description("List all documents in a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ documents: Document[] }>(
        `/documents/${tenant}/${project}`,
      );
      const docs = data.documents ?? [];
      if (isJsonMode()) {
        output(docs);
      } else {
        printTable(
          ["Slug", "Name", "Kind", "Sections", "Reqs"],
          docs.map(d => [
            d.slug,
            d.name ?? d.slug,
            d.kind ?? "",
            String(d.sectionCount ?? 0),
            String(d.requirementCount ?? 0),
          ]),
        );
      }
    });

  cmd
    .command("get")
    .description("Get document with all sections and content")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<slug>", "Document slug")
    .action(async (tenant: string, project: string, slug: string) => {
      const data = await client.get(
        `/sections/${tenant}/${project}/${slug}/full`,
      );
      output(data);
    });

  cmd
    .command("create")
    .description("Create a new document")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--name <name>", "Document name")
    .option("--code <code>", "Document code")
    .option("--description <desc>", "Description")
    .action(async (tenant: string, projectKey: string, opts: { name: string; code?: string; description?: string }) => {
      const data = await client.post("/documents", {
        tenant,
        projectKey,
        name: opts.name,
        shortCode: opts.code,
        description: opts.description,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Document created.");
        output(data);
      }
    });

  cmd
    .command("delete")
    .description("Delete a document")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<slug>", "Document slug")
    .action(async (tenant: string, project: string, slug: string) => {
      await client.delete(`/documents/${tenant}/${project}/${slug}`);
      console.log(`Document "${slug}" deleted.`);
    });

  cmd
    .command("export")
    .description("Export document as markdown")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<slug>", "Document slug")
    .action(async (tenant: string, project: string, slug: string) => {
      const data = await client.get<{ markdown?: string; content?: string }>(
        `/markdown/${tenant}/${project}/${slug}/content`,
      );
      if (isJsonMode()) {
        output(data);
      } else {
        console.log(data.markdown ?? data.content ?? JSON.stringify(data, null, 2));
      }
    });

  // Sections sub-group
  const sections = cmd.command("sections").alias("sec").description("Manage document sections");

  sections
    .command("create")
    .description("Create a section in a document")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .argument("<document>", "Document slug")
    .requiredOption("--title <title>", "Section title")
    .option("--order <n>", "Order index")
    .option("--description <desc>", "Description")
    .option("--code <code>", "Short code")
    .action(async (tenant: string, projectKey: string, document: string, opts: {
      title: string; order?: string; description?: string; code?: string;
    }) => {
      const data = await client.post("/sections", {
        tenant,
        projectKey,
        documentSlug: document,
        name: opts.title,
        order: opts.order ? parseInt(opts.order, 10) : 0,
        description: opts.description,
        shortCode: opts.code,
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Section created.");
        output(data);
      }
    });

  sections
    .command("delete")
    .description("Delete a section")
    .argument("<tenant>", "Tenant slug")
    .argument("<section-id>", "Section ID")
    .action(async (tenant: string, sectionId: string) => {
      await client.delete(`/sections/${sectionId}`, { tenant });
      console.log("Section deleted.");
    });
}
