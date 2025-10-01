/**
 * Test data fixtures for consistent testing
 */

export const testUsers = {
  admin: {
    id: "test-admin-id",
    email: "admin@test.com",
    name: "Test Admin",
    roles: ["admin", "user"],
    tenantSlugs: ["test-tenant"]
  },
  regularUser: {
    id: "test-user-id",
    email: "user@test.com",
    name: "Test User",
    roles: ["user"],
    tenantSlugs: ["test-tenant"]
  },
  multiTenantUser: {
    id: "test-multi-id",
    email: "multi@test.com",
    name: "Multi Tenant User",
    roles: ["user"],
    tenantSlugs: ["tenant-one", "tenant-two"]
  }
};

export const testRequirements = {
  valid: {
    tenant: "test-tenant",
    projectKey: "test-project",
    text: "The system shall authenticate users using email and password",
    pattern: "ubiquitous" as const,
    verification: "Test" as const
  },
  minimal: {
    tenant: "test-tenant",
    projectKey: "test-project",
    text: "The system shall log all authentication attempts"
  },
  withDocument: {
    tenant: "test-tenant",
    projectKey: "test-project",
    documentSlug: "srd",
    sectionId: "SEC-001",
    text: "The system shall provide real-time monitoring capabilities"
  }
};

export const testCandidates = {
  chat: {
    tenant: "test-tenant",
    projectKey: "test-project",
    user_input: "Generate requirements for user authentication",
    n: 3
  },
  withContext: {
    tenant: "test-tenant",
    projectKey: "test-project",
    user_input: "Generate requirements based on the attached document",
    glossary: "Authentication: The process of verifying user identity",
    constraints: "Must comply with GDPR and SOC2",
    attachedDocuments: [
      {
        type: "native" as const,
        documentSlug: "srd"
      }
    ]
  }
};
