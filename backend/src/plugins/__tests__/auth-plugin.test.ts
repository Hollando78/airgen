import { describe, expect, it, vi } from "vitest";
import { MissingSubClaimError, normalizeUser } from "../auth/normalize-user.js";
import { verifyAndAttachUser } from "../auth/verify-user.js";
import type { JwtPayload } from "../auth/types.js";
import type { FastifyRequest } from "fastify";
import { UserRole } from "../../types/roles.js";

describe("normalizeUser", () => {
  it("throws when sub claim is missing", () => {
    const payload: JwtPayload = {};
    expect(() => normalizeUser(payload)).toThrowError(MissingSubClaimError);
  });

  it("maps payload into authenticated user structure", () => {
    const payload: JwtPayload = {
      sub: "user-123",
      email: "test@example.com",
      name: "Test User",
      roles: ["admin"],
      tenantSlugs: ["tenant-a"],
      ownedTenantSlugs: ["tenant-b"],
      permissions: {
        tenantPermissions: {
          "tenant-c": { role: UserRole.ADMIN, isOwner: true }
        },
        projectPermissions: {
          "tenant-d": {
            "proj-1": { role: UserRole.VIEWER }
          }
        }
      }
    };

    const normalized = normalizeUser(payload);

    expect(normalized.sub).toBe("user-123");
    expect(normalized.roles).toEqual(["admin"]);
    expect(normalized.email).toBe("test@example.com");
    expect(normalized.name).toBe("Test User");
    expect(normalized.tenantSlugs).toEqual(
      expect.arrayContaining(["tenant-a", "tenant-c", "tenant-d"])
    );
    expect(normalized.ownedTenantSlugs).toEqual(
      expect.arrayContaining(["tenant-b", "tenant-c"])
    );
  });

  it("falls back to default role when roles missing", () => {
    const payload: JwtPayload = {
      sub: "user-123"
    };

    const normalized = normalizeUser(payload);

    expect(normalized.roles).toEqual(["user"]);
  });
});

describe("verifyAndAttachUser", () => {
  it("attaches normalized user to request", async () => {
    const payload: JwtPayload = {
      sub: "user-456",
      roles: ["manager"]
    };
    const request = {
      currentUser: "placeholder",
      jwtVerify: vi.fn().mockResolvedValue(payload)
    } as unknown as FastifyRequest;

    const user = await verifyAndAttachUser(request, {});

    expect(user).not.toBeNull();
    expect(user?.sub).toBe("user-456");
    expect(user?.roles).toEqual(["manager"]);
    expect(request.currentUser).toEqual(user);
  });

  it("returns null when optional and authorization header missing", async () => {
    const error = { code: "FST_JWT_NO_AUTHORIZATION_IN_HEADER" };
    const request = {
      currentUser: "placeholder",
      jwtVerify: vi.fn().mockRejectedValue(error)
    } as unknown as FastifyRequest;

    const user = await verifyAndAttachUser(request, { optional: true });

    expect(user).toBeNull();
    expect(request.currentUser).toBeNull();
  });

  it("propagates errors and invokes onError callback", async () => {
    const error = new Error("invalid token");
    const onError = vi.fn();
    const request = {
      currentUser: "placeholder",
      jwtVerify: vi.fn().mockRejectedValue(error)
    } as unknown as FastifyRequest;

    await expect(verifyAndAttachUser(request, { onError })).rejects.toThrow(error);
    expect(onError).toHaveBeenCalledWith(error);
    expect(request.currentUser).toBeNull();
  });
});
