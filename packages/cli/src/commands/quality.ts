import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output } from "../output.js";

export function registerQualityCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("quality").alias("qa").description("Requirement quality analysis");

  cmd
    .command("analyze")
    .description("Analyze requirement quality (ISO 29148 + EARS)")
    .argument("<text>", "Requirement text to analyze")
    .option("--auto-fix", "Suggest improved text")
    .action(async (text: string, opts: { autoFix?: boolean }) => {
      if (opts.autoFix) {
        const data = await client.post("/apply-fix", { text });
        output(data);
      } else {
        const data = await client.post("/qa", { text });
        output(data);
      }
    });

  cmd
    .command("score")
    .description("Start, check, or stop background QA scorer")
    .argument("<action>", "Action: start, status, stop")
    .option("--tenant <slug>", "Tenant slug (required for start)")
    .option("--project <slug>", "Project slug (required for start)")
    .action(async (action: string, opts: { tenant?: string; project?: string }) => {
      if (action === "start") {
        const data = await client.post("/workers/qa-scorer/start", {
          tenant: opts.tenant,
          project: opts.project,
        });
        output(data);
      } else if (action === "status") {
        const data = await client.get("/workers/qa-scorer/status");
        output(data);
      } else if (action === "stop") {
        const data = await client.post("/workers/qa-scorer/stop", {});
        output(data);
      } else {
        console.error(`Unknown action "${action}". Use: start, status, stop`);
      }
    });

  cmd
    .command("draft")
    .description("Generate candidate requirement texts from natural language")
    .argument("<input>", "Natural language description")
    .option("--glossary <text>", "Domain glossary")
    .option("--constraints <text>", "Constraints")
    .option("-n, --count <n>", "Number of candidates")
    .action(async (input: string, opts: { glossary?: string; constraints?: string; count?: string }) => {
      const data = await client.post("/draft/candidates", {
        user_input: input,
        glossary: opts.glossary,
        constraints: opts.constraints,
        n: opts.count ? parseInt(opts.count, 10) : undefined,
      });
      output(data);
    });
}
