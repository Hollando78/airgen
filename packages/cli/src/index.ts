#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { AirgenClient } from "./client.js";
import { loadConfig } from "./config.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
import { setJsonMode } from "./output.js";
import { registerTenantCommands } from "./commands/tenants.js";
import { registerProjectCommands } from "./commands/projects.js";
import { registerRequirementCommands } from "./commands/requirements.js";
import { registerDocumentCommands } from "./commands/documents.js";
import { registerDiagramCommands } from "./commands/diagrams.js";
import { registerTraceabilityCommands } from "./commands/traceability.js";
import { registerBaselineCommands } from "./commands/baselines.js";
import { registerQualityCommands } from "./commands/quality.js";
import { registerAiCommands } from "./commands/ai.js";
import { registerReportCommands } from "./commands/reports.js";
import { registerImportExportCommands } from "./commands/import-export.js";
import { registerActivityCommands } from "./commands/activity.js";
import { registerImplementationCommands } from "./commands/implementation.js";
import { registerLintCommands } from "./commands/lint.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerVerifyCommands } from "./commands/verify.js";

const program = new Command();

// Lazy-init: only create client when a command actually runs
let client: AirgenClient | null = null;

function getClient(): AirgenClient {
  if (!client) {
    const config = loadConfig();
    client = new AirgenClient(config);
  }
  return client;
}

// Proxy that defers client creation — commands receive this and call methods lazily
const clientProxy = new Proxy({} as AirgenClient, {
  get(_target, prop) {
    const c = getClient();
    const val = (c as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof val === "function") return val.bind(c);
    return val;
  },
});

program
  .name("airgen")
  .description("AIRGen CLI — requirements engineering from the command line")
  .version(version)
  .option("--json", "Output as JSON")
  .hook("preAction", (_thisCommand, actionCommand) => {
    let cmd: Command | null = actionCommand;
    while (cmd) {
      if ((cmd.opts() as { json?: boolean }).json) {
        setJsonMode(true);
        break;
      }
      cmd = cmd.parent;
    }
  });

registerTenantCommands(program, clientProxy);
registerProjectCommands(program, clientProxy);
registerRequirementCommands(program, clientProxy);
registerDocumentCommands(program, clientProxy);
registerDiagramCommands(program, clientProxy);
registerTraceabilityCommands(program, clientProxy);
registerBaselineCommands(program, clientProxy);
registerQualityCommands(program, clientProxy);
registerAiCommands(program, clientProxy);
registerReportCommands(program, clientProxy);
registerImportExportCommands(program, clientProxy);
registerActivityCommands(program, clientProxy);
registerImplementationCommands(program, clientProxy);
registerLintCommands(program, clientProxy);
registerDiffCommand(program, clientProxy);
registerVerifyCommands(program, clientProxy);

// Handle async errors from Commander action handlers
process.on("uncaughtException", (err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
