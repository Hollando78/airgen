import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestApp, createTestToken, authenticatedInject } from "../../__tests__/helpers/test-app.js";
import { testUsers } from "../../__tests__/helpers/test-data.js";
import { resetAllMocks, setupSuccessfulMocks } from "../../__tests__/helpers/mock-services.js";
import authRoutes from "../auth.js";

// Mock the dev-users service
vi.mock("../../services/dev-users.js", () => ({
  listDevUsers: vi.fn(),
  verifyDevUserPassword: vi.fn(),
  ensureLegacyPasswordUpgrade: vi.fn()
}));

import { listDevUsers, verifyDevUserPassword, ensureLegacyPasswordUpgrade } from "../../services/dev-users.js";

describe("Auth Routes", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
    await app.register(authRoutes, { prefix: "/api" });
    await app.ready();
    setupSuccessfulMocks();
  });

  afterEach(async () => {
    await app.close();
    resetAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("should successfully login with valid credentials", async () => {
      const mockUser = {
        id: testUsers.regularUser.id,
        email: testUsers.regularUser.email,
        name: testUsers.regularUser.name,
        roles: testUsers.regularUser.roles,
        tenantSlugs: testUsers.regularUser.tenantSlugs,
        passwordHash: "hashed",
        passwordSalt: "salt"
      };

      vi.mocked(listDevUsers).mockResolvedValue([mockUser]);
      vi.mocked(verifyDevUserPassword).mockReturnValue(true);
      vi.mocked(ensureLegacyPasswordUpgrade).mockResolvedValue(undefined);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testUsers.regularUser.email,
          password: "test-password"
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty("token");
      expect(body).toHaveProperty("user");
      expect(body.user.email).toBe(testUsers.regularUser.email);
      expect(body.user.id).toBe(testUsers.regularUser.id);
      expect(body.user).not.toHaveProperty("password");
      expect(body.user).not.toHaveProperty("passwordHash");
      expect(body.user).not.toHaveProperty("passwordSalt");
    });

    it("should return 401 with invalid credentials", async () => {
      const mockUser = {
        id: testUsers.regularUser.id,
        email: testUsers.regularUser.email,
        name: testUsers.regularUser.name,
        roles: testUsers.regularUser.roles,
        tenantSlugs: testUsers.regularUser.tenantSlugs,
        passwordHash: "hashed",
        passwordSalt: "salt"
      };

      vi.mocked(listDevUsers).mockResolvedValue([mockUser]);
      vi.mocked(verifyDevUserPassword).mockReturnValue(false);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testUsers.regularUser.email,
          password: "wrong-password"
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid credentials");
    });

    it("should return 401 when user not found", async () => {
      vi.mocked(listDevUsers).mockResolvedValue([]);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nonexistent@test.com",
          password: "password"
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Invalid credentials");
    });

    it("should validate email format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "invalid-email",
          password: "password"
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it("should require password field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "user@test.com"
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it("should handle case-insensitive email matching", async () => {
      const mockUser = {
        id: testUsers.regularUser.id,
        email: "User@Test.Com",
        name: testUsers.regularUser.name,
        roles: testUsers.regularUser.roles,
        tenantSlugs: testUsers.regularUser.tenantSlugs,
        passwordHash: "hashed",
        passwordSalt: "salt"
      };

      vi.mocked(listDevUsers).mockResolvedValue([mockUser]);
      vi.mocked(verifyDevUserPassword).mockReturnValue(true);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "user@test.com",
          password: "test-password"
        }
      });

      expect(response.statusCode).toBe(200);
    });

    it("should upgrade legacy password on successful login", async () => {
      const mockUser = {
        id: testUsers.regularUser.id,
        email: testUsers.regularUser.email,
        name: testUsers.regularUser.name,
        roles: testUsers.regularUser.roles,
        tenantSlugs: testUsers.regularUser.tenantSlugs,
        password: "legacy-sha256-hash" // Legacy password field
      };

      vi.mocked(listDevUsers).mockResolvedValue([mockUser]);
      vi.mocked(verifyDevUserPassword).mockReturnValue(true);
      vi.mocked(ensureLegacyPasswordUpgrade).mockResolvedValue(undefined);

      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: testUsers.regularUser.email,
          password: "test-password"
        }
      });

      expect(ensureLegacyPasswordUpgrade).toHaveBeenCalledWith(mockUser, "test-password");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return current user with valid token", async () => {
      const token = await createTestToken(app, testUsers.regularUser);

      const response = await authenticatedInject(app, {
        method: "GET",
        url: "/api/auth/me",
        token
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty("user");
      expect(body.user.id).toBe(testUsers.regularUser.id);
      expect(body.user.email).toBe(testUsers.regularUser.email);
      expect(body.user.roles).toEqual(testUsers.regularUser.roles);
    });

    it("should return 401 without authentication token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me"
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 401 with invalid token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          Authorization: "Bearer invalid-token"
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return user with multiple tenant access", async () => {
      const token = await createTestToken(app, testUsers.multiTenantUser);

      const response = await authenticatedInject(app, {
        method: "GET",
        url: "/api/auth/me",
        token
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.user.tenantSlugs).toEqual(testUsers.multiTenantUser.tenantSlugs);
      expect(body.user.tenantSlugs).toHaveLength(2);
    });
  });
});
