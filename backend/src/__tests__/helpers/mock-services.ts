import { vi } from "vitest";

/**
 * Mock implementations for external services and database operations
 */

// Mock Neo4j operations
export const mockGraphOperations = {
  createRequirement: vi.fn(),
  listRequirements: vi.fn(),
  getRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  softDeleteRequirement: vi.fn(),
  createRequirementCandidates: vi.fn(),
  listRequirementCandidates: vi.fn(),
  getRequirementCandidate: vi.fn(),
  updateRequirementCandidate: vi.fn()
};

// Mock workspace operations
export const mockWorkspaceOperations = {
  readRequirementMarkdown: vi.fn(),
  writeRequirementMarkdown: vi.fn(),
  ensureWorkspace: vi.fn()
};

// Mock dev users operations
export const mockDevUsersOperations = {
  listDevUsers: vi.fn(),
  verifyDevUserPassword: vi.fn(),
  ensureLegacyPasswordUpgrade: vi.fn()
};

// Mock OpenAI operations
export const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn()
    }
  }
};

/**
 * Reset all mocks - call this in afterEach hooks
 */
export function resetAllMocks() {
  Object.values(mockGraphOperations).forEach(mock => mock.mockReset());
  Object.values(mockWorkspaceOperations).forEach(mock => mock.mockReset());
  Object.values(mockDevUsersOperations).forEach(mock => mock.mockReset());
  vi.clearAllMocks();
}

/**
 * Setup default mock implementations for successful operations
 */
export function setupSuccessfulMocks() {
  // Default requirement responses
  mockGraphOperations.createRequirement.mockResolvedValue({
    id: "req-001",
    ref: "REQ-001",
    tenant: "test-tenant",
    projectKey: "test-project",
    text: "Test requirement",
    createdAt: new Date().toISOString()
  });

  mockGraphOperations.listRequirements.mockResolvedValue([]);
  mockGraphOperations.getRequirement.mockResolvedValue(null);

  // Default user responses
  mockDevUsersOperations.listDevUsers.mockResolvedValue([]);
  mockDevUsersOperations.verifyDevUserPassword.mockReturnValue(false);
  mockDevUsersOperations.ensureLegacyPasswordUpgrade.mockResolvedValue(undefined);

  // Default workspace responses
  mockWorkspaceOperations.readRequirementMarkdown.mockResolvedValue("# Test Requirement");
  mockWorkspaceOperations.writeRequirementMarkdown.mockResolvedValue(undefined);
  mockWorkspaceOperations.ensureWorkspace.mockResolvedValue(undefined);
}
