#!/usr/bin/env node

/**
 * AIRGen MCP Server entry point.
 *
 * Environment variables:
 *   AIRGEN_API_URL  — Base URL of the AIRGen API (e.g. https://api.airgen.studio/api)
 *   AIRGEN_EMAIL    — Login email
 *   AIRGEN_PASSWORD — Login password
 *   MCP_PORT        — If set, run as HTTP server on this port (for Claude.ai connector)
 *                     If not set, run as stdio server (for Claude Desktop / Claude Code)
 */

import { AirgenClient } from "./client.js";
import { createServer } from "./server.js";

const apiUrl = process.env.AIRGEN_API_URL;
const email = process.env.AIRGEN_EMAIL;
const password = process.env.AIRGEN_PASSWORD;
const mcpPort = process.env.MCP_PORT;

if (!apiUrl) {
  console.error("AIRGEN_API_URL is required (e.g. https://api.airgen.studio/api)");
  process.exit(1);
}

if (!email || !password) {
  console.error("AIRGEN_EMAIL and AIRGEN_PASSWORD are required");
  process.exit(1);
}

const client = new AirgenClient({ apiUrl, email, password });

if (mcpPort) {
  // HTTP mode — for Claude.ai web connector
  // Each session gets its own McpServer + transport (created inside startHttpServer)
  const { startHttpServer } = await import("./http.js");
  await startHttpServer(client, parseInt(mcpPort, 10));
} else {
  // Stdio mode — for Claude Desktop / Claude Code
  const mcpServer = createServer(client);
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
