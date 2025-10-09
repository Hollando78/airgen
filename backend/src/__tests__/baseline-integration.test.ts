import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "neo4j-driver";
import { __setDriverForTests } from "../services/graph.js";
import {
  createBaseline,
  listBaselines,
  getBaselineDetails,
  compareBaselines
} from "../services/graph/requirement-baselines.js";

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

describe("Baseline Creation with Version Snapshots", () => {
  it("creates baseline with all entity version counts", async () => {
    const mockTx: MockTx = {
      run: vi.fn(async (query: string) => {
        // Preparation query returns collected versions
        if (query.includes("RETURN project, ref, requirements")) {
          return {
            records: [{
              get: (key: string) => {
                if (key === "ref") return "BL-TEST-001";
                if (key === "requirements") return [
                  { properties: { ref: "REQ-001" } },
                  { properties: { ref: "REQ-002" } }
                ];
                if (key === "reqVers") return [
                  { properties: { versionId: "ver-req-1" } },
                  { properties: { versionId: "ver-req-2" } }
                ];
                if (key === "docVers") return [
                  { properties: { versionId: "ver-doc-1" } }
                ];
                if (key === "secVers") return [
                  { properties: { versionId: "ver-sec-1" } },
                  { properties: { versionId: "ver-sec-2" } }
                ];
                if (key === "infoVers") return [
                  { properties: { versionId: "ver-info-1" } }
                ];
                if (key === "surVers") return [];
                if (key === "linkVers") return [
                  { properties: { versionId: "ver-link-1" } }
                ];
                if (key === "linksetVers") return [];
                if (key === "diagVers") return [
                  { properties: { versionId: "ver-diag-1" } }
                ];
                if (key === "blockVers") return [
                  { properties: { versionId: "ver-block-1" } },
                  { properties: { versionId: "ver-block-2" } }
                ];
                if (key === "connVers") return [
                  { properties: { versionId: "ver-conn-1" } }
                ];
                return [];
              }
            }]
          };
        }

        // Creation query returns baseline
        if (query.includes("CREATE (baseline:Baseline")) {
          return {
            records: [{
              get: () => ({
                properties: {
                  id: "tenant:project:BL-TEST-001",
                  ref: "BL-TEST-001",
                  tenant: "tenant",
                  projectKey: "project",
                  createdAt: "2024-01-01T00:00:00Z",
                  author: "user1",
                  label: "Test Baseline",
                  requirementRefs: ["REQ-001", "REQ-002"],
                  requirementVersionCount: 2,
                  documentVersionCount: 1,
                  documentSectionVersionCount: 2,
                  infoVersionCount: 1,
                  surrogateVersionCount: 0,
                  traceLinkVersionCount: 1,
                  linksetVersionCount: 0,
                  diagramVersionCount: 1,
                  blockVersionCount: 2,
                  connectorVersionCount: 1
                }
              })
            }]
          };
        }

        return { records: [] };
      })
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    const baseline = await createBaseline({
      tenant: "tenant",
      projectKey: "project",
      author: "user1",
      label: "Test Baseline"
    });

    expect(baseline.ref).toBe("BL-TEST-001");
    expect(baseline.requirementVersionCount).toBe(2);
    expect(baseline.documentVersionCount).toBe(1);
    expect(baseline.documentSectionVersionCount).toBe(2);
    expect(baseline.infoVersionCount).toBe(1);
    expect(baseline.surrogateVersionCount).toBe(0);
    expect(baseline.traceLinkVersionCount).toBe(1);
    expect(baseline.linksetVersionCount).toBe(0);
    expect(baseline.diagramVersionCount).toBe(1);
    expect(baseline.blockVersionCount).toBe(2);
    expect(baseline.connectorVersionCount).toBe(1);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("creates baseline with backward compatible requirementRefs", async () => {
    const mockTx: MockTx = {
      run: vi.fn(async (query: string) => {
        if (query.includes("RETURN project, ref, requirements")) {
          return {
            records: [{
              get: (key: string) => {
                if (key === "ref") return "BL-TEST-001";
                if (key === "requirements") return [
                  { properties: { ref: "REQ-001" } },
                  { properties: { ref: "REQ-002" } },
                  { properties: { ref: "REQ-003" } }
                ];
                // Return empty version arrays for simplicity
                return [];
              }
            }]
          };
        }

        if (query.includes("CREATE (baseline:Baseline")) {
          return {
            records: [{
              get: () => ({
                properties: {
                  id: "tenant:project:BL-TEST-001",
                  ref: "BL-TEST-001",
                  tenant: "tenant",
                  projectKey: "project",
                  createdAt: "2024-01-01T00:00:00Z",
                  requirementRefs: ["REQ-001", "REQ-002", "REQ-003"]
                }
              })
            }]
          };
        }

        return { records: [] };
      })
    };

    mockSession.executeWrite.mockImplementation(async (fn) => fn(mockTx));

    const baseline = await createBaseline({
      tenant: "tenant",
      projectKey: "project"
    });

    expect(baseline.requirementRefs).toEqual(["REQ-001", "REQ-002", "REQ-003"]);
    expect(mockSession.close).toHaveBeenCalled();
  });
});

describe("Baseline Listing", () => {
  it("lists all baselines for a project ordered by creation time", async () => {
    mockSession.run.mockResolvedValue({
      records: [
        {
          get: () => ({
            properties: {
              id: "tenant:project:BL-TEST-002",
              ref: "BL-TEST-002",
              tenant: "tenant",
              projectKey: "project",
              createdAt: "2024-01-02T00:00:00Z",
              author: "user1",
              label: "Second Baseline",
              requirementRefs: ["REQ-001", "REQ-002", "REQ-003"],
              requirementVersionCount: 3,
              documentVersionCount: 1
            }
          })
        },
        {
          get: () => ({
            properties: {
              id: "tenant:project:BL-TEST-001",
              ref: "BL-TEST-001",
              tenant: "tenant",
              projectKey: "project",
              createdAt: "2024-01-01T00:00:00Z",
              author: "user1",
              label: "First Baseline",
              requirementRefs: ["REQ-001", "REQ-002"],
              requirementVersionCount: 2,
              documentVersionCount: 1
            }
          })
        }
      ]
    });

    const baselines = await listBaselines("tenant", "project");

    expect(baselines).toHaveLength(2);
    expect(baselines[0].ref).toBe("BL-TEST-002");
    expect(baselines[0].requirementVersionCount).toBe(3);
    expect(baselines[1].ref).toBe("BL-TEST-001");
    expect(baselines[1].requirementVersionCount).toBe(2);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("returns empty array when no baselines exist", async () => {
    mockSession.run.mockResolvedValue({
      records: []
    });

    const baselines = await listBaselines("tenant", "project");

    expect(baselines).toHaveLength(0);
    expect(mockSession.close).toHaveBeenCalled();
  });
});

describe("Baseline Details Retrieval", () => {
  it("retrieves complete baseline snapshot with all version types", async () => {
    mockSession.run.mockResolvedValue({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-001",
                ref: "BL-TEST-001",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-01T00:00:00Z",
                requirementVersionCount: 2,
                documentVersionCount: 1
              }
            };
          }
          if (key === "requirementVersions") {
            return [
              {
                properties: {
                  versionId: "ver-req-1",
                  requirementId: "req-1",
                  versionNumber: 1,
                  timestamp: "2024-01-01T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 1",
                  contentHash: "hash1"
                }
              },
              {
                properties: {
                  versionId: "ver-req-2",
                  requirementId: "req-2",
                  versionNumber: 1,
                  timestamp: "2024-01-01T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 2",
                  contentHash: "hash2"
                }
              }
            ];
          }
          if (key === "documentVersions") {
            return [{
              properties: {
                versionId: "ver-doc-1",
                documentId: "doc-1",
                versionNumber: 1,
                timestamp: "2024-01-01T00:00:00Z",
                changedBy: "user1",
                changeType: "created",
                slug: "srd",
                name: "System Requirements Document",
                contentHash: "hash-doc"
              }
            }];
          }
          // Other version types return empty arrays for simplicity
          return [];
        }
      }]
    });

    const snapshot = await getBaselineDetails("tenant", "project", "BL-TEST-001");

    expect(snapshot.baseline.ref).toBe("BL-TEST-001");
    expect(snapshot.requirementVersions).toHaveLength(2);
    expect(snapshot.requirementVersions[0].versionId).toBe("ver-req-1");
    expect(snapshot.requirementVersions[1].versionId).toBe("ver-req-2");
    expect(snapshot.documentVersions).toHaveLength(1);
    expect(snapshot.documentVersions[0].slug).toBe("srd");
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("throws error when baseline not found", async () => {
    mockSession.run.mockResolvedValue({
      records: []
    });

    await expect(
      getBaselineDetails("tenant", "project", "BL-NOTFOUND-001")
    ).rejects.toThrow("Baseline not found: BL-NOTFOUND-001");

    expect(mockSession.close).toHaveBeenCalled();
  });
});

describe("Baseline Comparison", () => {
  it("identifies added requirements between baselines", async () => {
    // Mock first call for baseline 1
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-001",
                ref: "BL-TEST-001",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-01T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [{
              properties: {
                versionId: "ver-req-1",
                requirementId: "req-1",
                versionNumber: 1,
                timestamp: "2024-01-01T00:00:00Z",
                changedBy: "user1",
                changeType: "created",
                text: "Requirement 1",
                contentHash: "hash1"
              }
            }];
          }
          return [];
        }
      }]
    });

    // Mock second call for baseline 2
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-002",
                ref: "BL-TEST-002",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-02T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [
              {
                properties: {
                  versionId: "ver-req-1",
                  requirementId: "req-1",
                  versionNumber: 1,
                  timestamp: "2024-01-01T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 1",
                  contentHash: "hash1"
                }
              },
              {
                properties: {
                  versionId: "ver-req-2",
                  requirementId: "req-2",
                  versionNumber: 1,
                  timestamp: "2024-01-02T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 2",
                  contentHash: "hash2"
                }
              }
            ];
          }
          return [];
        }
      }]
    });

    const comparison = await compareBaselines("tenant", "project", "BL-TEST-001", "BL-TEST-002");

    expect(comparison.fromBaseline.ref).toBe("BL-TEST-001");
    expect(comparison.toBaseline.ref).toBe("BL-TEST-002");
    expect(comparison.requirements.added).toHaveLength(1);
    expect(comparison.requirements.added[0].requirementId).toBe("req-2");
    expect(comparison.requirements.unchanged).toHaveLength(1);
    expect(comparison.requirements.removed).toHaveLength(0);
    expect(comparison.requirements.modified).toHaveLength(0);
  });

  it("identifies modified requirements between baselines", async () => {
    // Mock first call for baseline 1
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-001",
                ref: "BL-TEST-001",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-01T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [{
              properties: {
                versionId: "ver-req-1-v1",
                requirementId: "req-1",
                versionNumber: 1,
                timestamp: "2024-01-01T00:00:00Z",
                changedBy: "user1",
                changeType: "created",
                text: "Original text",
                contentHash: "hash-old"
              }
            }];
          }
          return [];
        }
      }]
    });

    // Mock second call for baseline 2
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-002",
                ref: "BL-TEST-002",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-02T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [{
              properties: {
                versionId: "ver-req-1-v2",
                requirementId: "req-1",
                versionNumber: 2,
                timestamp: "2024-01-02T00:00:00Z",
                changedBy: "user1",
                changeType: "updated",
                text: "Modified text",
                contentHash: "hash-new"
              }
            }];
          }
          return [];
        }
      }]
    });

    const comparison = await compareBaselines("tenant", "project", "BL-TEST-001", "BL-TEST-002");

    expect(comparison.requirements.modified).toHaveLength(1);
    expect(comparison.requirements.modified[0].requirementId).toBe("req-1");
    expect(comparison.requirements.modified[0].versionNumber).toBe(2);
    expect(comparison.requirements.modified[0].text).toBe("Modified text");
    expect(comparison.requirements.added).toHaveLength(0);
    expect(comparison.requirements.removed).toHaveLength(0);
    expect(comparison.requirements.unchanged).toHaveLength(0);
  });

  it("identifies removed requirements between baselines", async () => {
    // Mock first call for baseline 1
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-001",
                ref: "BL-TEST-001",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-01T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [
              {
                properties: {
                  versionId: "ver-req-1",
                  requirementId: "req-1",
                  versionNumber: 1,
                  timestamp: "2024-01-01T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 1",
                  contentHash: "hash1"
                }
              },
              {
                properties: {
                  versionId: "ver-req-2",
                  requirementId: "req-2",
                  versionNumber: 1,
                  timestamp: "2024-01-01T00:00:00Z",
                  changedBy: "user1",
                  changeType: "created",
                  text: "Requirement 2",
                  contentHash: "hash2"
                }
              }
            ];
          }
          return [];
        }
      }]
    });

    // Mock second call for baseline 2 (req-2 removed)
    mockSession.run.mockResolvedValueOnce({
      records: [{
        get: (key: string) => {
          if (key === "baseline") {
            return {
              properties: {
                id: "tenant:project:BL-TEST-002",
                ref: "BL-TEST-002",
                tenant: "tenant",
                projectKey: "project",
                createdAt: "2024-01-02T00:00:00Z"
              }
            };
          }
          if (key === "requirementVersions") {
            return [{
              properties: {
                versionId: "ver-req-1",
                requirementId: "req-1",
                versionNumber: 1,
                timestamp: "2024-01-01T00:00:00Z",
                changedBy: "user1",
                changeType: "created",
                text: "Requirement 1",
                contentHash: "hash1"
              }
            }];
          }
          return [];
        }
      }]
    });

    const comparison = await compareBaselines("tenant", "project", "BL-TEST-001", "BL-TEST-002");

    expect(comparison.requirements.removed).toHaveLength(1);
    expect(comparison.requirements.removed[0].requirementId).toBe("req-2");
    expect(comparison.requirements.unchanged).toHaveLength(1);
    expect(comparison.requirements.unchanged[0].requirementId).toBe("req-1");
    expect(comparison.requirements.added).toHaveLength(0);
    expect(comparison.requirements.modified).toHaveLength(0);
  });
});
