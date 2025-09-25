import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { writeRequirementMarkdown } from "../services/workspace.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspace requirement serialization", () => {
  it("includes QA metadata when the score is zero", async () => {
    const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    const writeSpy = vi.spyOn(fs, "writeFile").mockResolvedValue();

    await writeRequirementMarkdown({
      id: "tenant:project:REQ-000",
      ref: "REQ-000",
      tenant: "tenant",
      projectKey: "project",
      title: "Requirement title",
      text: "Requirement text",
      pattern: "event",
      verification: "Test",
      qaScore: 0,
      qaVerdict: "Not compliant",
      suggestions: ["Add measurable criteria"],
      tags: [],
      path: "tenant/project/requirements/REQ-000.md",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    });

    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();

    const markdown = writeSpy.mock.calls[0][1] as string;
    expect(markdown).toContain("qa:");
    expect(markdown).toContain("score: 0");
  });
});
