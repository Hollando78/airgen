import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestApp, createTestToken, authenticatedInject } from "../../__tests__/helpers/test-app.js";
import { testUsers, testCandidates } from "../../__tests__/helpers/test-data.js";
import { resetAllMocks, setupSuccessfulMocks } from "../../__tests__/helpers/mock-services.js";
import airgenRoutes from "../airgen.js";

// Mock the required services
vi.mock("../../services/graph.js", () => ({
  createRequirementCandidates: vi.fn(),
  listRequirementCandidates: vi.fn(),
  getRequirementCandidate: vi.fn(),
  updateRequirementCandidate: vi.fn(),
  createRequirement: vi.fn(),
  createArchitectureDiagram: vi.fn(),
  createArchitectureBlock: vi.fn(),
  createArchitectureConnector: vi.fn()
}));

vi.mock("../../services/graph/diagram-candidates.js", () => ({
  createDiagramCandidate: vi.fn(),
  listDiagramCandidates: vi.fn(),
  getDiagramCandidate: vi.fn(),
  updateDiagramCandidate: vi.fn(),
  mapDiagramCandidate: vi.fn()
}));

vi.mock("../../services/drafting.js", () => ({
  draftCandidates: vi.fn()
}));

vi.mock("../../services/diagram-generation.js", () => ({
  generateDiagram: vi.fn()
}));

vi.mock("../../services/workspace.js", () => ({
  writeRequirementMarkdown: vi.fn(),
  slugify: (str: string) => str.toLowerCase().replace(/\s+/g, "-")
}));

vi.mock("../../services/document-content.js", () => ({
  extractDocumentContent: vi.fn()
}));

vi.mock("../../services/diagram-content.js", () => ({
  extractDiagramContent: vi.fn()
}));

import {
  createRequirementCandidates,
  listRequirementCandidates,
  getRequirementCandidate,
  updateRequirementCandidate,
  createRequirement
} from "../../services/graph.js";
import { draftCandidates } from "../../services/drafting.js";
import { generateDiagram } from "../../services/diagram-generation.js";
import { createDiagramCandidate, getDiagramCandidate } from "../../services/graph/diagram-candidates.js";
import { extractDocumentContent } from "../../services/document-content.js";

describe("AIRGen Routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let authToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    await app.register(airgenRoutes, { prefix: "/api" });
    await app.ready();
    setupSuccessfulMocks();
    authToken = await createTestToken(app, testUsers.regularUser);
  });

  afterEach(async () => {
    await app.close();
    resetAllMocks();
  });

  describe("POST /api/airgen/chat", () => {
    it("should generate requirement candidates from user input", async () => {
      const mockDrafts = [
        "The system shall authenticate users using email and password",
        "The system shall enforce strong password policies",
        "The system shall lock accounts after 5 failed login attempts"
      ];

      const mockCandidates = mockDrafts.map((text, i) => ({
        id: `candidate-${i + 1}`,
        tenant: "test-tenant",
        projectKey: "test-project",
        text,
        status: "pending",
        qaScore: 85,
        qaVerdict: "PASS",
        suggestions: [],
        prompt: testCandidates.chat.user_input,
        querySessionId: "session-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      vi.mocked(draftCandidates).mockResolvedValue(mockDrafts);
      vi.mocked(createRequirementCandidates).mockResolvedValue(mockCandidates as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: testCandidates.chat,
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.items).toHaveLength(3);
      expect(body.prompt).toBe(testCandidates.chat.user_input);
      expect(body.items[0].qa).toEqual({
        score: 85,
        verdict: "PASS",
        suggestions: []
      });
      expect(draftCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          user_input: testCandidates.chat.user_input,
          n: 3
        })
      );
    });

    it("should require authentication", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/airgen/chat",
        payload: testCandidates.chat
      });

      expect(response.statusCode).toBe(401);
    });

    it("should validate required fields", async () => {
      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: {
          tenant: "test-tenant"
          // Missing projectKey and user_input
        },
        token: authToken
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept glossary and constraints", async () => {
      const mockDrafts = ["Generated requirement with context"];
      const mockCandidates = [{
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: mockDrafts[0],
        status: "pending",
        qaScore: 90,
        qaVerdict: "PASS",
        suggestions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];

      vi.mocked(draftCandidates).mockResolvedValue(mockDrafts);
      vi.mocked(createRequirementCandidates).mockResolvedValue(mockCandidates as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          user_input: "Generate authentication requirements",
          glossary: "Auth: Authentication and authorization",
          constraints: "Must comply with GDPR"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      expect(draftCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          glossary: "Auth: Authentication and authorization",
          constraints: "Must comply with GDPR"
        })
      );
      const body = JSON.parse(response.body);
      expect(body.items[0].qa).toEqual({
        score: 90,
        verdict: "PASS",
        suggestions: []
      });
    });

    it("should handle attached documents", async () => {
      const mockDrafts = ["Requirement based on attached document"];
      const mockCandidates = [{
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: mockDrafts[0],
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }];

      vi.mocked(extractDocumentContent).mockResolvedValue("Document context content");
      vi.mocked(draftCandidates).mockResolvedValue(mockDrafts);
      vi.mocked(createRequirementCandidates).mockResolvedValue(mockCandidates as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          user_input: "Generate requirements from this document",
          attachedDocuments: [
            {
              type: "native",
              documentSlug: "srd",
              sectionIds: ["SEC-001"]
            }
          ]
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      expect(extractDocumentContent).toHaveBeenCalledWith(
        "test-tenant",
        "test-project",
        expect.objectContaining({
          type: "native",
          documentSlug: "srd"
        })
      );
    });

    it("should handle diagram mode", async () => {
      const mockDiagramResponse = {
        action: "create",
        diagramName: "System Architecture",
        diagramDescription: "High-level system architecture",
        diagramView: "block",
        blocks: [
          {
            name: "Authentication Service",
            kind: "subsystem",
            positionX: 100,
            positionY: 100
          }
        ],
        connectors: [],
        reasoning: "Created architecture based on requirements"
      };

      const mockDiagramCandidate = {
        id: "diagram-candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        status: "pending",
        ...mockDiagramResponse,
        createdAt: new Date().toISOString()
      };

      vi.mocked(generateDiagram).mockResolvedValue(mockDiagramResponse as any);
      vi.mocked(createDiagramCandidate).mockResolvedValue(mockDiagramCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          user_input: "Create a system architecture diagram",
          mode: "diagram"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.candidate).toBeDefined();
      expect(body.candidate.diagramName).toBe("System Architecture");
      expect(generateDiagram).toHaveBeenCalled();
    });

    it("should handle errors in draft generation", async () => {
      vi.mocked(draftCandidates).mockRejectedValue(new Error("OpenAI API error"));

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/chat",
        payload: testCandidates.chat,
        token: authToken
      });

      expect(response.statusCode).toBe(502);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Bad Gateway");
    });
  });

  describe("GET /api/airgen/candidates/:tenant/:project", () => {
    it("should list all candidates for a project", async () => {
      const mockCandidates = [
        {
          id: "candidate-1",
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "Candidate 1",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "candidate-2",
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "Candidate 2",
          status: "accepted",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      vi.mocked(listRequirementCandidates).mockResolvedValue(mockCandidates as any);

      const response = await authenticatedInject(app, {
        method: "GET",
        url: "/api/airgen/candidates/test-tenant/test-project",
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.items).toHaveLength(2);
      expect(listRequirementCandidates).toHaveBeenCalledWith("test-tenant", "test-project");
    });

    it("should require authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/airgen/candidates/test-tenant/test-project"
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /api/airgen/candidates/:id/accept", () => {
    it("should accept a candidate and create a requirement", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "The system shall authenticate users",
        status: "pending",
        qaScore: 85,
        qaVerdict: "PASS",
        suggestions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const mockRequirement = {
        id: "req-001",
        ref: "REQ-001",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: mockCandidate.text,
        createdAt: new Date().toISOString()
      };

      const updatedCandidate = {
        ...mockCandidate,
        status: "accepted",
        requirementId: mockRequirement.id,
        requirementRef: mockRequirement.ref
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);
      vi.mocked(createRequirement).mockResolvedValue(mockRequirement as any);
      vi.mocked(updateRequirementCandidate).mockResolvedValue(updatedCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/accept",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          pattern: "ubiquitous",
          verification: "Test"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.candidate.status).toBe("accepted");
      expect(body.requirement.ref).toBe("REQ-001");
      expect(createRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: mockCandidate.text,
          pattern: "ubiquitous",
          verification: "Test"
        })
      );
    });

    it("should return 404 when candidate not found", async () => {
      vi.mocked(getRequirementCandidate).mockResolvedValue(null);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/nonexistent/accept",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(404);
    });

    it("should reject if candidate already processed", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Already accepted candidate",
        status: "accepted",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/accept",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Candidate already processed");
    });

    it("should validate tenant/project ownership", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "other-tenant",
        projectKey: "other-project",
        text: "Candidate from different tenant",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/accept",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("does not belong");
    });
  });

  describe("POST /api/airgen/candidates/:id/reject", () => {
    it("should reject a pending candidate", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Candidate to reject",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const rejectedCandidate = {
        ...mockCandidate,
        status: "rejected"
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);
      vi.mocked(updateRequirementCandidate).mockResolvedValue(rejectedCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/reject",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.candidate.status).toBe("rejected");
      expect(updateRequirementCandidate).toHaveBeenCalledWith("candidate-1", { status: "rejected" });
    });

    it("should not reject already rejected candidate", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Already rejected",
        status: "rejected",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/reject",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/airgen/candidates/:id/return", () => {
    it("should return a rejected candidate to pending", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Rejected candidate",
        status: "rejected",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const returnedCandidate = {
        ...mockCandidate,
        status: "pending"
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);
      vi.mocked(updateRequirementCandidate).mockResolvedValue(returnedCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/return",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.candidate.status).toBe("pending");
    });

    it("should only return rejected candidates", async () => {
      const mockCandidate = {
        id: "candidate-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Pending candidate",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(getRequirementCandidate).mockResolvedValue(mockCandidate as any);

      const response = await authenticatedInject(app, {
        method: "POST",
        url: "/api/airgen/candidates/candidate-1/return",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project"
        },
        token: authToken
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Only rejected candidates");
    });
  });
});
