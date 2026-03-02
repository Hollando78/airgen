import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";

/** Minimal stub that satisfies the AirgenClient interface for tool registration. */
function stubClient(): any {
  return {
    config: { apiUrl: "http://localhost/api", email: "x", password: "x" },
    get: async () => ({}),
    post: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
    fetchBinary: async () => ({ data: Buffer.alloc(0), contentType: "application/octet-stream" }),
    fetchStaticFile: async () => ({ data: Buffer.alloc(0), contentType: "application/octet-stream" }),
  };
}

describe("createServer", () => {
  it("creates a server and registers all tools without errors", () => {
    const server = createServer(stubClient());
    expect(server).toBeDefined();
  });

  it("is an McpServer instance", () => {
    const server = createServer(stubClient());
    expect(server.constructor.name).toBe("McpServer");
  });
});
