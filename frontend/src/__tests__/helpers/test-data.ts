/**
 * Test data fixtures for frontend tests
 */

export const testUsers = {
  validUser: {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    roles: ["user"],
    tenantSlugs: ["test-tenant"]
  },
  adminUser: {
    id: "admin-123",
    email: "admin@example.com",
    name: "Admin User",
    roles: ["admin", "user"],
    tenantSlugs: ["test-tenant", "other-tenant"]
  }
};

export const testTokens = {
  validToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsIm5hbWUiOiJUZXN0IFVzZXIiLCJyb2xlcyI6WyJ1c2VyIl0sInRlbmFudFNsdWdzIjpbInRlc3QtdGVuYW50Il0sImV4cCI6OTk5OTk5OTk5OX0.xxx",
  expiredToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTAwMDAwMDAwMH0.xxx"
};

export const testLoginCredentials = {
  valid: {
    email: "test@example.com",
    password: "test-password-123"
  },
  invalid: {
    email: "wrong@example.com",
    password: "wrong-password"
  }
};

export const testTenantProjects = {
  singleTenant: {
    tenant: "test-tenant",
    project: "test-project"
  },
  multiTenant: {
    tenant: "tenant-one",
    project: "project-one"
  },
  anotherProject: {
    tenant: "test-tenant",
    project: "another-project"
  }
};

export const testRequirements = {
  basic: {
    id: "req-001",
    ref: "REQ-001",
    tenant: "test-tenant",
    projectKey: "test-project",
    text: "The system shall authenticate users",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  withQA: {
    id: "req-002",
    ref: "REQ-002",
    tenant: "test-tenant",
    projectKey: "test-project",
    text: "The system shall validate all inputs",
    qaScore: 85,
    qaVerdict: "PASS",
    suggestions: ["Consider adding specific validation rules"],
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z"
  }
};
