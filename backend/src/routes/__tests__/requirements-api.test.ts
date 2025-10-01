import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestApp, createTestToken, authenticatedInject } from "../../__tests__/helpers/test-app.js";
import { testUsers, testRequirements } from "../../__tests__/helpers/test-data.js";
import { resetAllMocks, setupSuccessfulMocks } from "../../__tests__/helpers/mock-services.js";
import requirementsRoutes from "../requirements-api.js";

// Mock the graph and workspace services
vi.mock("../../services/graph.js", () => ({
  createRequirement: vi.fn(),
  listRequirements: vi.fn(),
  getRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  softDeleteRequirement: vi.fn(),
  findDuplicateRequirementRefs: vi.fn(),
  fixDuplicateRequirementRefs: vi.fn(),
  createBaseline: vi.fn(),
  listBaselines: vi.fn(),
  suggestLinks: vi.fn()
}));

vi.mock("../../services/workspace.js", () => ({
  readRequirementMarkdown: vi.fn(),
  writeRequirementMarkdown: vi.fn()
}));

import {
  createRequirement,
  listRequirements,
  getRequirement,
  updateRequirement,
  softDeleteRequirement,
  findDuplicateRequirementRefs,
  createBaseline,
  listBaselines
} from "../../services/graph.js";
import { readRequirementMarkdown, writeRequirementMarkdown } from "../../services/workspace.js";

describe("Requirements API Routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let authToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    await app.register(requirementsRoutes, { prefix: "/api" });
    await app.ready();
    setupSuccessfulMocks();
    authToken = await createTestToken(app, testUsers.regularUser);
  });

  afterEach(async () => {
    await app.close();
    resetAllMocks();
  });

  describe("POST /api/requirements", () => {
    it("should create a new requirement with valid data", async () => {
      const mockRequirement = {
        id: "req-001",
        ref: "REQ-001",
        ...testRequirements.valid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(createRequirement).mockResolvedValue(mockRequirement);
      vi.mocked(writeRequirementMarkdown).mockResolvedValue(undefined);

      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: testRequirements.valid
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requirement).toBeDefined();
      expect(body.requirement.id).toBe("req-001");
      expect(body.requirement.ref).toBe("REQ-001");
      expect(body.requirement.text).toBe(testRequirements.valid.text);

      expect(createRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant: testRequirements.valid.tenant,
          projectKey: testRequirements.valid.projectKey,
          text: testRequirements.valid.text
        })
      );
      expect(writeRequirementMarkdown).toHaveBeenCalledWith(mockRequirement);
    });

    it("should create requirement with minimal data", async () => {
      const mockRequirement = {
        id: "req-002",
        ref: "REQ-002",
        ...testRequirements.minimal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(createRequirement).mockResolvedValue(mockRequirement);

      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: testRequirements.minimal
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.requirement.text).toBe(testRequirements.minimal.text);
    });

    it("should validate required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: {
          tenant: "test-tenant"
          // Missing projectKey and text
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate minimum text length", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "short" // Less than 10 characters
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate pattern enum values", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "The system shall do something",
          pattern: "invalid-pattern"
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept optional QA metadata", async () => {
      const mockRequirement = {
        id: "req-003",
        ref: "REQ-003",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "The system shall validate inputs",
        qaScore: 85,
        qaVerdict: "PASS",
        suggestions: ["Consider adding error handling"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(createRequirement).mockResolvedValue(mockRequirement);

      const response = await app.inject({
        method: "POST",
        url: "/api/requirements",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "The system shall validate inputs",
          qaScore: 85,
          qaVerdict: "PASS",
          suggestions: ["Consider adding error handling"]
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.requirement.qaScore).toBe(85);
    });
  });

  describe("GET /api/requirements/:tenant/:project", () => {
    it("should list requirements for a project", async () => {
      const mockRequirements = [
        {
          id: "req-001",
          ref: "REQ-001",
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "Requirement 1",
          createdAt: new Date().toISOString()
        },
        {
          id: "req-002",
          ref: "REQ-002",
          tenant: "test-tenant",
          projectKey: "test-project",
          text: "Requirement 2",
          createdAt: new Date().toISOString()
        }
      ];

      vi.mocked(listRequirements).mockResolvedValue(mockRequirements);

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toHaveLength(2);
      expect(body.meta).toBeDefined();
      expect(body.meta.totalItems).toBe(2);
      expect(body.meta.currentPage).toBe(1);
    });

    it("should support pagination", async () => {
      const mockRequirements = Array.from({ length: 25 }, (_, i) => ({
        id: `req-${i + 1}`,
        ref: `REQ-${String(i + 1).padStart(3, "0")}`,
        tenant: "test-tenant",
        projectKey: "test-project",
        text: `Requirement ${i + 1}`,
        createdAt: new Date().toISOString()
      }));

      vi.mocked(listRequirements).mockResolvedValue(mockRequirements);

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project?page=2&limit=10"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toHaveLength(10);
      expect(body.meta.currentPage).toBe(2);
      expect(body.meta.totalPages).toBe(3);
      expect(body.meta.hasNextPage).toBe(true);
      expect(body.meta.hasPrevPage).toBe(true);
    });

    it("should support sorting by different fields", async () => {
      const mockRequirements = [
        { id: "1", ref: "REQ-003", qaScore: 70, createdAt: "2024-01-03T00:00:00Z" },
        { id: "2", ref: "REQ-001", qaScore: 90, createdAt: "2024-01-01T00:00:00Z" },
        { id: "3", ref: "REQ-002", qaScore: 80, createdAt: "2024-01-02T00:00:00Z" }
      ];

      vi.mocked(listRequirements).mockResolvedValue(mockRequirements as any);

      // Sort by QA score descending
      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project?sortBy=qaScore&sortOrder=desc"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data[0].qaScore).toBe(90);
      expect(body.data[1].qaScore).toBe(80);
      expect(body.data[2].qaScore).toBe(70);
    });

    it("should return empty array for project with no requirements", async () => {
      vi.mocked(listRequirements).mockResolvedValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/empty-project"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data).toEqual([]);
      expect(body.meta.totalItems).toBe(0);
    });
  });

  describe("GET /api/requirements/:tenant/:project/:ref", () => {
    it("should retrieve a specific requirement", async () => {
      const mockRequirement = {
        id: "req-001",
        ref: "REQ-001",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "The system shall authenticate users"
      };

      vi.mocked(getRequirement).mockResolvedValue(mockRequirement as any);
      vi.mocked(readRequirementMarkdown).mockResolvedValue("# REQ-001\n\nThe system shall authenticate users");

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project/REQ-001"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.record.ref).toBe("REQ-001");
      expect(body.markdown).toContain("REQ-001");
      expect(getRequirement).toHaveBeenCalledWith("test-tenant", "test-project", "REQ-001");
    });

    it("should return 404 when requirement not found", async () => {
      vi.mocked(getRequirement).mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project/REQ-999"
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Requirement not found");
    });

    it("should fallback to requirement text if markdown file is missing", async () => {
      const mockRequirement = {
        id: "req-001",
        ref: "REQ-001",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "The system shall authenticate users"
      };

      vi.mocked(getRequirement).mockResolvedValue(mockRequirement as any);
      vi.mocked(readRequirementMarkdown).mockRejectedValue(new Error("File not found"));

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project/REQ-001"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.markdown).toBe(mockRequirement.text);
    });
  });

  describe("PATCH /api/requirements/:tenant/:project/:requirementId", () => {
    it("should update requirement text", async () => {
      const updatedRequirement = {
        id: "req-001",
        ref: "REQ-001",
        tenant: "test-tenant",
        projectKey: "test-project",
        text: "Updated requirement text"
      };

      vi.mocked(updateRequirement).mockResolvedValue(updatedRequirement as any);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/requirements/test-tenant/test-project/req-001",
        payload: {
          text: "Updated requirement text"
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requirement.text).toBe("Updated requirement text");
      expect(updateRequirement).toHaveBeenCalledWith(
        "test-tenant",
        "test-project",
        "req-001",
        { text: "Updated requirement text" }
      );
    });

    it("should update pattern and verification", async () => {
      const updatedRequirement = {
        id: "req-001",
        ref: "REQ-001",
        pattern: "event",
        verification: "Analysis"
      };

      vi.mocked(updateRequirement).mockResolvedValue(updatedRequirement as any);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/requirements/test-tenant/test-project/req-001",
        payload: {
          pattern: "event",
          verification: "Analysis"
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.requirement.pattern).toBe("event");
      expect(body.requirement.verification).toBe("Analysis");
    });

    it("should return 404 when requirement not found", async () => {
      vi.mocked(updateRequirement).mockResolvedValue(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/requirements/test-tenant/test-project/req-999",
        payload: {
          text: "Updated text"
        }
      });

      expect(response.statusCode).toBe(404);
    });

    it("should validate text minimum length", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/requirements/test-tenant/test-project/req-001",
        payload: {
          text: "short"
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/requirements/:tenant/:project/:requirementId", () => {
    it("should soft delete a requirement", async () => {
      const deletedRequirement = {
        id: "req-001",
        ref: "REQ-001",
        deleted: true
      };

      vi.mocked(softDeleteRequirement).mockResolvedValue(deletedRequirement as any);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/requirements/test-tenant/test-project/req-001"
      });

      expect(response.statusCode).toBe(200);
      expect(softDeleteRequirement).toHaveBeenCalledWith("test-tenant", "test-project", "req-001");
    });

    it("should return 404 when requirement not found", async () => {
      vi.mocked(softDeleteRequirement).mockResolvedValue(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/requirements/test-tenant/test-project/req-999"
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/requirements/:tenant/:project/duplicates", () => {
    it("should find duplicate requirement references", async () => {
      const duplicates = [
        {
          ref: "REQ-001",
          count: 2,
          requirements: [
            { id: "req-001-a", ref: "REQ-001" },
            { id: "req-001-b", ref: "REQ-001" }
          ]
        }
      ];

      vi.mocked(findDuplicateRequirementRefs).mockResolvedValue(duplicates as any);

      const response = await app.inject({
        method: "GET",
        url: "/api/requirements/test-tenant/test-project/duplicates"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.duplicates).toHaveLength(1);
      expect(body.duplicates[0].ref).toBe("REQ-001");
      expect(body.duplicates[0].count).toBe(2);
    });
  });

  describe("POST /api/baseline", () => {
    it("should create a baseline", async () => {
      const mockBaseline = {
        id: "baseline-001",
        tenant: "test-tenant",
        projectKey: "test-project",
        label: "Release 1.0",
        author: "test-user",
        createdAt: new Date().toISOString()
      };

      vi.mocked(createBaseline).mockResolvedValue(mockBaseline as any);

      const response = await app.inject({
        method: "POST",
        url: "/api/baseline",
        payload: {
          tenant: "test-tenant",
          projectKey: "test-project",
          label: "Release 1.0",
          author: "test-user"
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.baseline.label).toBe("Release 1.0");
      expect(createBaseline).toHaveBeenCalledWith({
        tenant: "test-tenant",
        projectKey: "test-project",
        label: "Release 1.0",
        author: "test-user"
      });
    });
  });

  describe("GET /api/baselines/:tenant/:project", () => {
    it("should list baselines for a project", async () => {
      const mockBaselines = [
        {
          id: "baseline-001",
          label: "Release 1.0",
          createdAt: "2024-01-01T00:00:00Z"
        },
        {
          id: "baseline-002",
          label: "Release 2.0",
          createdAt: "2024-02-01T00:00:00Z"
        }
      ];

      vi.mocked(listBaselines).mockResolvedValue(mockBaselines as any);

      const response = await app.inject({
        method: "GET",
        url: "/api/baselines/test-tenant/test-project"
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.items).toHaveLength(2);
      expect(body.items[0].label).toBe("Release 1.0");
    });
  });
});
