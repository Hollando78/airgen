/**
 * HTTP transport for the AIRGen MCP server.
 *
 * Each client session gets its own McpServer + StreamableHTTPServerTransport pair.
 * Sessions are tracked by session ID and cleaned up on disconnect.
 *
 * Includes a minimal OAuth 2.0 Authorization Code + PKCE flow for Claude.ai.
 * Since credentials are server-side, the authorize endpoint auto-approves
 * (no login UI needed).
 */

import { createServer as createHttpServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "./client.js";
import { createServer } from "./server.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

// ── OAuth state ──────────────────────────────────────────────

interface AuthCode {
  code: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

interface AccessToken {
  token: string;
  expiresAt: number;
}

/** Pending authorization codes (short-lived, 5 min) */
const authCodes = new Map<string, AuthCode>();
/** Issued access tokens (long-lived, 24h) */
const accessTokens = new Map<string, AccessToken>();

const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CODE_TTL = 5 * 60 * 1000; // 5 minutes

function cleanExpired() {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
  for (const [k, v] of accessTokens) if (v.expiresAt < now) accessTokens.delete(k);
}

function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === "S256") {
    const hash = createHash("sha256").update(codeVerifier).digest("base64url");
    return hash === codeChallenge;
  }
  // plain
  return codeVerifier === codeChallenge;
}

function isValidToken(req: import("node:http").IncomingMessage): boolean {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const entry = accessTokens.get(token);
  return !!entry && entry.expiresAt > Date.now();
}

// ── Main server ──────────────────────────────────────────────

export async function startHttpServer(client: AirgenClient, port: number): Promise<void> {
  const sessions = new Map<string, Session>();

  // Determine external origin for OAuth metadata
  const externalOrigin = process.env.MCP_EXTERNAL_URL ?? `http://localhost:${port}`;

  const httpServer = createHttpServer(async (req, res) => {
    // CORS headers on all responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Log all requests for debugging
    const hasAuth = !!req.headers["authorization"];
    console.error(`${req.method} ${url.pathname} auth=${hasAuth} session=${req.headers["mcp-session-id"] ?? "none"}`);

    // Normalize trailing dots/slashes from path
    const pathname = url.pathname.replace(/[./]+$/, "") || "/";

    // ── OAuth protected resource metadata ──────────────────
    if (pathname === "/.well-known/oauth-protected-resource" || pathname === "/.well-known/oauth-protected-resource/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          resource: `${externalOrigin}/mcp`,
          authorization_servers: [externalOrigin],
          bearer_methods_supported: ["header"],
        }),
      );
      return;
    }

    // ── OAuth authorization server metadata ────────────────
    if (pathname === "/.well-known/oauth-authorization-server") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: externalOrigin,
          authorization_endpoint: `${externalOrigin}/authorize`,
          token_endpoint: `${externalOrigin}/token`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code"],
          code_challenge_methods_supported: ["S256", "plain"],
          token_endpoint_auth_methods_supported: ["none"],
        }),
      );
      return;
    }

    // ── OAuth authorize (auto-approve) ─────────────────────
    if (pathname === "/authorize") {
      cleanExpired();

      const responseType = url.searchParams.get("response_type");
      const clientId = url.searchParams.get("client_id") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const codeChallenge = url.searchParams.get("code_challenge") ?? "";
      const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "plain";
      const state = url.searchParams.get("state") ?? "";

      if (responseType !== "code" || !redirectUri) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request" }));
        return;
      }

      // Generate auth code and redirect immediately (auto-approve)
      const code = randomUUID();
      authCodes.set(code, {
        code,
        codeChallenge,
        codeChallengeMethod,
        redirectUri,
        clientId,
        expiresAt: Date.now() + CODE_TTL,
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);

      res.writeHead(302, { Location: redirect.toString() });
      res.end();
      console.error(`OAuth: issued auth code for client=${clientId}`);
      return;
    }

    // ── OAuth token exchange ───────────────────────────────
    if (pathname === "/token" && req.method === "POST") {
      cleanExpired();

      const body = await readFormOrJsonBody(req);
      const grantType = body.grant_type;
      const code = body.code;
      const codeVerifier = body.code_verifier;
      const redirectUri = body.redirect_uri;

      if (grantType !== "authorization_code" || !code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request" }));
        return;
      }

      const authCode = authCodes.get(code);
      if (!authCode || authCode.expiresAt < Date.now()) {
        authCodes.delete(code);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }

      // Verify PKCE
      if (authCode.codeChallenge && codeVerifier) {
        if (!verifyPkce(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
          authCodes.delete(code);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed" }));
          return;
        }
      }

      // Verify redirect_uri matches
      if (redirectUri && redirectUri !== authCode.redirectUri) {
        authCodes.delete(code);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }

      // Consume auth code (one-time use)
      authCodes.delete(code);

      // Issue access token
      const token = randomUUID();
      accessTokens.set(token, { token, expiresAt: Date.now() + TOKEN_TTL });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: token,
          token_type: "Bearer",
          expires_in: TOKEN_TTL / 1000,
        }),
      );
      console.error(`OAuth: issued access token for client=${authCode.clientId}`);
      return;
    }

    // ── Health check (no auth required) ────────────────────
    if (pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          server: "airgen-mcp",
          version: "0.1.0",
          sessions: sessions.size,
        }),
      );
      return;
    }

    // ── MCP endpoints (auth required) ──────────────────────
    if (pathname !== "/" && pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Require Bearer token for MCP requests
    if (!isValidToken(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Parse body for POST
    let body: unknown = undefined;
    if (req.method === "POST") {
      body = await readJsonBody(req);
    }

    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      try {
        await session.transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
        console.error("MCP request error:", err);
      }
      return;
    }

    // New session — must be an initialize request (POST with no session ID)
    if (req.method === "POST" && !sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server: mcpServer });
          console.error(`Session created: ${id} (total: ${sessions.size})`);
        },
      });

      transport.onclose = () => {
        for (const [id, session] of sessions) {
          if (session.transport === transport) {
            sessions.delete(id);
            console.error(`Session closed: ${id} (total: ${sessions.size})`);
            break;
          }
        }
      };

      const mcpServer = createServer(client);
      await mcpServer.connect(transport);

      try {
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
        console.error("MCP init error:", err);
      }
      return;
    }

    // Session ID provided but not found, or GET without session
    if (sessionId) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found. Send an initialize request first." }));
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing mcp-session-id header" }));
    }
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.error(`AIRGen MCP server listening on http://0.0.0.0:${port}/mcp`);
    console.error(`OAuth metadata: http://0.0.0.0:${port}/.well-known/oauth-authorization-server`);
    console.error(`Health check: http://0.0.0.0:${port}/health`);
  });

  const shutdown = () => {
    console.error("Shutting down MCP server...");
    for (const [, session] of sessions) {
      session.transport.close();
    }
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ── Body parsing helpers ─────────────────────────────────────

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readFormOrJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) {
        resolve({});
        return;
      }
      const ct = req.headers["content-type"] ?? "";
      if (ct.includes("application/json")) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      } else {
        // application/x-www-form-urlencoded
        const params = new URLSearchParams(raw);
        const obj: Record<string, string> = {};
        for (const [k, v] of params) obj[k] = v;
        resolve(obj);
      }
    });
    req.on("error", reject);
  });
}
