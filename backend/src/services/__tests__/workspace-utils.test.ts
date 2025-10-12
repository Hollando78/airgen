import { describe, expect, it, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "node:path";
import os from "node:os";
import { slugify, ensureWorkspace } from "../workspace.ts";
import { config } from "../../config.js";

const tmpRoot = path.join(os.tmpdir(), "airgen-workspace-test");

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe("workspace utilities", () => {
  it("slugifies arbitrary strings consistently", () => {
    expect(slugify(" Hello World ")).toBe("hello-world");
    expect(slugify("Project 123!")).toBe("project-123");
    expect(slugify("Already-slugged")).toBe("already-slugged");
  });

  it("creates the workspace directory when missing", async () => {
    const dir = path.join(tmpRoot, "workspace-dir");
    const originalRoot = config.workspaceRoot;
    (config as any).workspaceRoot = dir;

    await ensureWorkspace();

    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
    (config as any).workspaceRoot = originalRoot;
  });
});
