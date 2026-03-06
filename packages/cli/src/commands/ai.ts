import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";

interface Candidate {
  id: string;
  text?: string;
  status?: string;
  createdAt?: string;
}

export function registerAiCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("ai").description("AI generation and candidates");

  cmd
    .command("generate")
    .description("Generate requirement candidates using AI")
    .argument("<tenant>", "Tenant slug")
    .argument("<project-key>", "Project key")
    .requiredOption("--input <text>", "Natural language input")
    .option("--glossary <text>", "Domain glossary")
    .option("--constraints <text>", "Constraints")
    .option("-n, --count <n>", "Number of candidates")
    .action(async (tenant: string, projectKey: string, opts: {
      input: string; glossary?: string; constraints?: string; count?: string;
    }) => {
      const data = await client.post("/airgen/chat", {
        tenant,
        projectKey,
        user_input: opts.input,
        glossary: opts.glossary,
        constraints: opts.constraints,
        n: opts.count ? parseInt(opts.count, 10) : undefined,
        mode: "generate",
      });
      output(data);
    });

  cmd
    .command("candidates")
    .description("List pending AI-generated candidates")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ candidates: Candidate[] }>(
        `/airgen/candidates/${tenant}/${project}`,
      );
      const candidates = data.candidates ?? [];
      if (isJsonMode()) {
        output(candidates);
      } else {
        printTable(
          ["ID", "Text", "Status", "Created"],
          candidates.map(c => [
            c.id,
            truncate(c.text ?? "", 60),
            c.status ?? "",
            c.createdAt ?? "",
          ]),
        );
      }
    });

  cmd
    .command("accept")
    .description("Accept a candidate and promote to requirement")
    .argument("<candidate-id>", "Candidate ID")
    .requiredOption("--tenant <slug>", "Tenant slug")
    .requiredOption("--project-key <key>", "Project key")
    .option("--pattern <p>", "Pattern")
    .option("--verification <v>", "Verification method")
    .option("--document <slug>", "Document slug")
    .option("--section <id>", "Section ID")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (candidateId: string, opts: {
      tenant: string; projectKey: string;
      pattern?: string; verification?: string; document?: string; section?: string; tags?: string;
    }) => {
      const data = await client.post(`/airgen/candidates/${candidateId}/accept`, {
        tenant: opts.tenant,
        projectKey: opts.projectKey,
        pattern: opts.pattern,
        verification: opts.verification,
        documentSlug: opts.document,
        sectionId: opts.section,
        tags: opts.tags?.split(",").map(t => t.trim()),
      });
      if (isJsonMode()) {
        output(data);
      } else {
        console.log("Candidate accepted.");
      }
    });

  cmd
    .command("reject")
    .description("Reject a candidate")
    .argument("<candidate-id>", "Candidate ID")
    .requiredOption("--tenant <slug>", "Tenant slug")
    .requiredOption("--project-key <key>", "Project key")
    .action(async (candidateId: string, opts: { tenant: string; projectKey: string }) => {
      await client.post(`/airgen/candidates/${candidateId}/reject`, {
        tenant: opts.tenant,
        projectKey: opts.projectKey,
      });
      console.log("Candidate rejected.");
    });
}
