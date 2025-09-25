import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "neo4j-driver";
import {
  __setDriverForTests,
  listProjects,
  createBaseline,
  updateRequirement,
  updateDocument,
  deleteTraceLink
} from "../services/graph.js";
import * as workspace from "../services/workspace.js";
import * as requirements from "../services/graph/requirements.js";

type MockRecord = {
  get: (key: string) => unknown;
};

type MockSession = {
  run: ReturnType<typeof vi.fn>;
  executeWrite: ReturnType<typeof vi.fn>;
  executeRead: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type MockTx = {
  run: ReturnType<typeof vi.fn>;
};

let mockSession: MockSession;

function createMockDriver(session: MockSession): Driver {
  return {
    session: vi.fn(() => session),
    close: vi.fn(),
    verifyConnectivity: vi.fn()
  } as unknown as Driver;
}

beforeEach(() => {
  mockSession = {
    run: vi.fn(),
    executeWrite: vi.fn(),
    executeRead: vi.fn(),
    close: vi.fn()
  };
  __setDriverForTests(createMockDriver(mockSession));
});

afterEach(() => {
  __setDriverForTests(null);
  vi.restoreAllMocks();
});

describe("graph service integrations", () => {
  it("listProjects counts requirements attached via documents", async () => {
    const projectNode = {
      properties: {
        slug: "alpha",
        tenantSlug: "tenant",
        key: "ALPHA",
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    };

    mockSession.run.mockImplementation(async (query, _params) => {
      expect(query).toContain("[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)");
      expect(query).toContain("[req IN reqs WHERE req IS NOT NULL]");

      const record: MockRecord = {
        get: (key: string) => {
          if (key === "project") return projectNode;
          if (key === "requirementCount") return 2;
          throw new Error(`Unexpected key ${key}`);
        }
      };

      return { records: [record] };
    });

    const projects = await listProjects("Tenant");

    expect(projects).toHaveLength(1);
    expect(projects[0].requirementCount).toBe(2);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("createBaseline collects requirements reachable via documents", async () => {
    const mockTx: MockTx = {
      run: vi.fn(async (query) => {
        expect(query).toContain("[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)");
        expect(query).toContain("collect(DISTINCT directReq) + collect(DISTINCT docReq)");

        const record: MockRecord = {
          get: (key: string) => {
            if (key === "baseline") {
              return {
                properties: {
                  id: "tenant:project:BL-TEST-001",
                  ref: "BL-TEST-001",
                  tenant: "tenant",
                  projectKey: "project",
                  createdAt: "2024-01-01T00:00:00.000Z",
                  author: null,
                  label: null,
                  requirementRefs: ["REQ-ALPHA-001", "REQ-BETA-002"]
                }
              };
            }
            throw new Error(`Unexpected key ${key}`);
          }
        };

        return { records: [record] };
      })
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    const baseline = await createBaseline({ tenant: "tenant", projectKey: "project" });

    expect(baseline.requirementRefs).toEqual(["REQ-ALPHA-001", "REQ-BETA-002"]);
    expect(mockTx.run).toHaveBeenCalled();
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("updateRequirement rewrites markdown after persisting changes", async () => {
    const requirementNode = {
      properties: {
        id: "tenant:project:REQ-001",
        ref: "REQ-001",
        tenant: "tenant",
        projectKey: "project",
        title: "Updated title",
        text: "Updated text",
        pattern: null,
        verification: null,
        qaScore: null,
        qaVerdict: null,
        suggestions: [],
        tags: [],
        path: "tenant/project/requirements/REQ-001.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z"
      }
    };

    const mockTx: MockTx = {
      run: vi.fn(async () => ({
        records: [
          {
            get: (key: string) => {
              if (key === "requirement") return requirementNode;
              throw new Error(`Unexpected key ${key}`);
            }
          }
        ]
      }))
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    const markdownSpy = vi
      .spyOn(workspace, "writeRequirementMarkdown")
      .mockResolvedValue();

    const result = await updateRequirement("tenant", "project", "tenant:project:REQ-001", {
      text: "Updated text"
    });

    expect(result.text).toBe("Updated text");
    expect(markdownSpy).toHaveBeenCalledTimes(1);
    expect(markdownSpy).toHaveBeenCalledWith({
      id: "tenant:project:REQ-001",
      ref: "REQ-001",
      tenant: "tenant",
      projectKey: "project",
      title: "Updated title",
      text: "Updated text",
      pattern: undefined,
      verification: undefined,
      qaScore: undefined,
      qaVerdict: undefined,
      suggestions: [],
      tags: [],
      path: "tenant/project/requirements/REQ-001.md",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      deleted: undefined
    });
  });

  it("updateDocument recalculates requirement references when short code changes", async () => {
    const documentNode = {
      properties: {
        id: "tenant:project:doc",
        slug: "doc",
        name: "System Document",
        description: null,
        tenant: "tenant",
        projectKey: "project",
        parentFolder: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      }
    };

    const mockTx: MockTx = {
      run: vi.fn(async (query: string) => {
        expect(query).toContain("SET document.shortCode = $shortCode");
        return {
          records: [
            {
              get: (key: string) => {
                if (key === "document") return documentNode;
                throw new Error(`Unexpected key ${key}`);
              }
            }
          ]
        };
      })
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    const refSpy = vi
      .spyOn(requirements, "updateRequirementRefsForDocument")
      .mockResolvedValue();

    const result = await updateDocument("tenant", "project", "doc", { shortCode: "DOC" });

    expect(result?.slug).toBe("doc");
    expect(refSpy).toHaveBeenCalledWith(mockTx, "tenant", "project", "doc");
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("deleteTraceLink throws when no nodes are deleted", async () => {
    const mockTx: MockTx = {
      run: vi.fn(async (query: string) => {
        expect(query).toContain("DETACH DELETE link");
        return {
          summary: {
            counters: {
              updates: () => ({ nodesDeleted: 0 })
            }
          }
        };
      })
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    await expect(
      deleteTraceLink({ tenant: "tenant", projectKey: "project", linkId: "trace-1" })
    ).rejects.toThrow("Trace link not found");

    expect(mockSession.close).toHaveBeenCalled();
  });
});
