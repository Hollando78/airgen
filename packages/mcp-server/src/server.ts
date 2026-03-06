/**
 * AIRGen MCP Server — tool registration and setup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "./client.js";
import { registerNavigationTools } from "./tools/navigation.js";
import { registerRequirementsTools } from "./tools/requirements.js";
import { registerDocumentsTools } from "./tools/documents.js";
import { registerQualityTools } from "./tools/quality.js";
import { registerTraceabilityTools } from "./tools/traceability.js";
import { registerBaselinesTools } from "./tools/baselines.js";
import { registerArchitectureTools } from "./tools/architecture.js";
import { registerSearchTools } from "./tools/search.js";
import { registerAiTools } from "./tools/ai.js";
import { registerActivityTools } from "./tools/activity.js";
import { registerImagineTools } from "./tools/imagine.js";
import { registerDocumentManagementTools } from "./tools/document-management.js";
import { registerProjectManagementTools } from "./tools/project-management.js";
import { registerFilteringTools } from "./tools/filtering.js";
import { registerReportingTools } from "./tools/reporting.js";
import { registerImportExportTools } from "./tools/import-export.js";
import { registerImplementationTools } from "./tools/implementation.js";
import { registerSectionContentTools } from "./tools/section-content.js";

export function createServer(client: AirgenClient): McpServer {
  const server = new McpServer({
    name: "airgen",
    version: "0.1.0",
  });

  registerNavigationTools(server, client);
  registerRequirementsTools(server, client);
  registerDocumentsTools(server, client);
  registerQualityTools(server, client);
  registerTraceabilityTools(server, client);
  registerBaselinesTools(server, client);
  registerArchitectureTools(server, client);
  registerSearchTools(server, client);
  registerAiTools(server, client);
  registerActivityTools(server, client);
  registerImagineTools(server, client);
  registerDocumentManagementTools(server, client);
  registerProjectManagementTools(server, client);
  registerFilteringTools(server, client);
  registerReportingTools(server, client);
  registerImportExportTools(server, client);
  registerImplementationTools(server, client);
  registerSectionContentTools(server, client);

  return server;
}
