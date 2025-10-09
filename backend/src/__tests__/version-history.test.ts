import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver } from "neo4j-driver";
import { __setDriverForTests } from "../services/graph.js";
import { generateRequirementContentHash, getRequirementHistory } from "../services/graph/requirements/requirements-versions.js";
import { generateInfoContentHash, getInfoHistory } from "../services/graph/infos-versions.js";
import { generateDocumentContentHash } from "../services/graph/documents/documents-versions.js";
import { generateDocumentSectionContentHash } from "../services/graph/documents/sections-versions.js";
import { generateSurrogateContentHash } from "../services/graph/surrogates-versions.js";
import { generateTraceLinkContentHash } from "../services/graph/trace-versions.js";
import { generateDocumentLinksetContentHash } from "../services/graph/linksets-versions.js";
import { generateArchitectureDiagramContentHash } from "../services/graph/architecture/diagrams-versions.js";
import { generateArchitectureBlockContentHash } from "../services/graph/architecture/blocks-versions.js";
import { generateArchitectureConnectorContentHash } from "../services/graph/architecture/connectors-versions.js";

type MockRecord = {
  get: (key: string) => unknown;
};

type MockSession = {
  run: ReturnType<typeof vi.fn>;
  executeWrite: ReturnType<typeof vi.fn>;
  executeRead: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
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

describe("Content Hash Generation", () => {
  it("generates consistent hash for same requirement content", () => {
    const hash1 = generateRequirementContentHash({
      text: "The system shall respond within 2 seconds",
      pattern: "ubiquitous",
      verification: "Test"
    });

    const hash2 = generateRequirementContentHash({
      text: "The system shall respond within 2 seconds",
      pattern: "ubiquitous",
      verification: "Test"
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string length
  });

  it("generates different hash for different requirement content", () => {
    const hash1 = generateRequirementContentHash({
      text: "The system shall respond within 2 seconds",
      pattern: "ubiquitous"
    });

    const hash2 = generateRequirementContentHash({
      text: "The system shall respond within 3 seconds",
      pattern: "ubiquitous"
    });

    expect(hash1).not.toBe(hash2);
  });

  it("generates consistent hash for same info content", () => {
    const hash1 = generateInfoContentHash({
      text: "This is an informational note",
      title: "Important Note"
    });

    const hash2 = generateInfoContentHash({
      text: "This is an informational note",
      title: "Important Note"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same document content", () => {
    const hash1 = generateDocumentContentHash({
      slug: "srd",
      name: "System Requirements Document",
      description: "Main requirements document"
    });

    const hash2 = generateDocumentContentHash({
      slug: "srd",
      name: "System Requirements Document",
      description: "Main requirements document"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same section content", () => {
    const hash1 = generateDocumentSectionContentHash({
      name: "Functional Requirements",
      description: "System functions",
      order: 1
    });

    const hash2 = generateDocumentSectionContentHash({
      name: "Functional Requirements",
      description: "System functions",
      order: 1
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same surrogate content", () => {
    const hash1 = generateSurrogateContentHash({
      slug: "diagram-1",
      caption: "System Architecture"
    });

    const hash2 = generateSurrogateContentHash({
      slug: "diagram-1",
      caption: "System Architecture"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same trace link content", () => {
    const hash1 = generateTraceLinkContentHash({
      fromRequirementId: "req-1",
      toRequirementId: "req-2",
      linkType: "satisfies",
      rationale: "Derived from parent requirement"
    });

    const hash2 = generateTraceLinkContentHash({
      fromRequirementId: "req-1",
      toRequirementId: "req-2",
      linkType: "satisfies",
      rationale: "Derived from parent requirement"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same linkset content", () => {
    const hash1 = generateDocumentLinksetContentHash({
      fromDocumentSlug: "srd",
      toDocumentSlug: "fcs",
      linkType: "refines",
      description: "FCS refines SRD"
    });

    const hash2 = generateDocumentLinksetContentHash({
      fromDocumentSlug: "srd",
      toDocumentSlug: "fcs",
      linkType: "refines",
      description: "FCS refines SRD"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same diagram content", () => {
    const hash1 = generateArchitectureDiagramContentHash({
      name: "Block Diagram",
      description: "System overview",
      view: "block"
    });

    const hash2 = generateArchitectureDiagramContentHash({
      name: "Block Diagram",
      description: "System overview",
      view: "block"
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same block content", () => {
    const hash1 = generateArchitectureBlockContentHash({
      label: "Processor",
      description: "Main CPU",
      blockType: "component",
      x: 100,
      y: 200
    });

    const hash2 = generateArchitectureBlockContentHash({
      label: "Processor",
      description: "Main CPU",
      blockType: "component",
      x: 100,
      y: 200
    });

    expect(hash1).toBe(hash2);
  });

  it("generates consistent hash for same connector content", () => {
    const hash1 = generateArchitectureConnectorContentHash({
      fromBlockId: "block-1",
      toBlockId: "block-2",
      label: "Data Flow",
      connectorType: "flow"
    });

    const hash2 = generateArchitectureConnectorContentHash({
      fromBlockId: "block-1",
      toBlockId: "block-2",
      label: "Data Flow",
      connectorType: "flow"
    });

    expect(hash1).toBe(hash2);
  });

  it("treats null and undefined consistently in hash generation", () => {
    const hash1 = generateRequirementContentHash({
      text: "Requirement text",
      pattern: null as any
    });

    const hash2 = generateRequirementContentHash({
      text: "Requirement text",
      pattern: undefined
    });

    expect(hash1).toBe(hash2);
  });
});

describe("Version History Retrieval", () => {
  it("retrieves requirement version history ordered by version number", async () => {
    const version1 = {
      properties: {
        versionId: "ver-1",
        requirementId: "req-1",
        versionNumber: 1,
        timestamp: "2024-01-01T00:00:00Z",
        changedBy: "user1",
        changeType: "created",
        text: "Initial text",
        contentHash: "hash1"
      }
    };

    const version2 = {
      properties: {
        versionId: "ver-2",
        requirementId: "req-1",
        versionNumber: 2,
        timestamp: "2024-01-02T00:00:00Z",
        changedBy: "user2",
        changeType: "updated",
        text: "Updated text",
        contentHash: "hash2"
      }
    };

    mockSession.run.mockResolvedValue({
      records: [
        { get: () => version2 }, // Latest first
        { get: () => version1 }
      ]
    });

    const history = await getRequirementHistory("tenant", "project", "req-1");

    expect(history).toHaveLength(2);
    expect(history[0].versionNumber).toBe(2);
    expect(history[0].changeType).toBe("updated");
    expect(history[1].versionNumber).toBe(1);
    expect(history[1].changeType).toBe("created");
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("retrieves info version history with all properties", async () => {
    const version = {
      properties: {
        versionId: "ver-1",
        infoId: "info-1",
        versionNumber: 1,
        timestamp: "2024-01-01T00:00:00Z",
        changedBy: "user1",
        changeType: "created",
        ref: "INFO-001",
        text: "Info text",
        title: "Info Title",
        sectionId: "section-1",
        order: 5,
        contentHash: "hash1"
      }
    };

    mockSession.run.mockResolvedValue({
      records: [{ get: () => version }]
    });

    const history = await getInfoHistory("tenant", "project", "info-1");

    expect(history).toHaveLength(1);
    expect(history[0].ref).toBe("INFO-001");
    expect(history[0].title).toBe("Info Title");
    expect(history[0].sectionId).toBe("section-1");
    expect(history[0].order).toBe(5);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("handles empty version history", async () => {
    mockSession.run.mockResolvedValue({
      records: []
    });

    const history = await getRequirementHistory("tenant", "project", "req-1");

    expect(history).toHaveLength(0);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("handles version history with change descriptions", async () => {
    const version = {
      properties: {
        versionId: "ver-1",
        requirementId: "req-1",
        versionNumber: 2,
        timestamp: "2024-01-02T00:00:00Z",
        changedBy: "user1",
        changeType: "updated",
        changeDescription: "Updated based on stakeholder feedback",
        text: "Revised text",
        contentHash: "hash2"
      }
    };

    mockSession.run.mockResolvedValue({
      records: [{ get: () => version }]
    });

    const history = await getRequirementHistory("tenant", "project", "req-1");

    expect(history[0].changeDescription).toBe("Updated based on stakeholder feedback");
    expect(mockSession.close).toHaveBeenCalled();
  });
});

describe("Version Change Detection", () => {
  it("detects no change when content hash is identical", () => {
    const oldHash = generateRequirementContentHash({
      text: "The system shall...",
      pattern: "ubiquitous"
    });

    const newHash = generateRequirementContentHash({
      text: "The system shall...",
      pattern: "ubiquitous"
    });

    expect(oldHash).toBe(newHash);
  });

  it("detects change when text is modified", () => {
    const oldHash = generateRequirementContentHash({
      text: "The system shall respond within 2 seconds"
    });

    const newHash = generateRequirementContentHash({
      text: "The system shall respond within 3 seconds"
    });

    expect(oldHash).not.toBe(newHash);
  });

  it("detects change when pattern is modified", () => {
    const oldHash = generateRequirementContentHash({
      text: "The system shall...",
      pattern: "ubiquitous"
    });

    const newHash = generateRequirementContentHash({
      text: "The system shall...",
      pattern: "event"
    });

    expect(oldHash).not.toBe(newHash);
  });

  it("treats null and undefined consistently in hash generation", () => {
    const hash1 = generateRequirementContentHash({
      text: "Requirement text",
      pattern: null as any
    });

    const hash2 = generateRequirementContentHash({
      text: "Requirement text",
      pattern: undefined
    });

    expect(hash1).toBe(hash2);
  });
});

describe("Version Type Integrity", () => {
  it("ensures version numbers are sequential integers", async () => {
    const versions = [
      { versionNumber: 3 },
      { versionNumber: 2 },
      { versionNumber: 1 }
    ];

    mockSession.run.mockResolvedValue({
      records: versions.map(v => ({
        get: () => ({
          properties: {
            versionId: `ver-${v.versionNumber}`,
            requirementId: "req-1",
            versionNumber: v.versionNumber,
            timestamp: `2024-01-0${v.versionNumber}T00:00:00Z`,
            changedBy: "user1",
            changeType: v.versionNumber === 1 ? "created" : "updated",
            text: `Text v${v.versionNumber}`,
            contentHash: `hash${v.versionNumber}`
          }
        })
      }))
    });

    const history = await getRequirementHistory("tenant", "project", "req-1");

    expect(history[0].versionNumber).toBe(3);
    expect(history[1].versionNumber).toBe(2);
    expect(history[2].versionNumber).toBe(1);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it("validates changeType values", async () => {
    const version = {
      properties: {
        versionId: "ver-1",
        requirementId: "req-1",
        versionNumber: 1,
        timestamp: "2024-01-01T00:00:00Z",
        changedBy: "user1",
        changeType: "created",
        text: "Text",
        contentHash: "hash1"
      }
    };

    mockSession.run.mockResolvedValue({
      records: [{ get: () => version }]
    });

    const history = await getRequirementHistory("tenant", "project", "req-1");

    expect(["created", "updated", "archived", "restored", "deleted"]).toContain(history[0].changeType);
    expect(mockSession.close).toHaveBeenCalled();
  });
});
