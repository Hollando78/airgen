import type { AuthenticatedUser, JwtPayload } from "./types.js";

export class MissingSubClaimError extends Error {
  constructor() {
    super("JWT payload missing 'sub' claim");
    this.name = "MissingSubClaimError";
  }
}

const DEFAULT_ROLE = "user";

export function normalizeUser(payload: JwtPayload): AuthenticatedUser {
  if (!payload.sub) {
    throw new MissingSubClaimError();
  }

  const roles = extractRoles(payload);
  const permissions = payload.permissions;

  const tenantSlugs = collectTenantSlugs(payload, permissions);
  const ownedTenantSlugs = collectOwnedTenantSlugs(payload, permissions);

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles,
    tenantSlugs,
    ownedTenantSlugs,
    permissions
  };
}

function extractRoles(payload: JwtPayload): string[] {
  if (Array.isArray(payload.roles) && payload.roles.length > 0) {
    return payload.roles;
  }
  return [DEFAULT_ROLE];
}

function collectTenantSlugs(
  payload: JwtPayload,
  permissions: AuthenticatedUser["permissions"]
): string[] {
  const tenantSlugSet = new Set<string>();

  if (Array.isArray(payload.tenantSlugs)) {
    for (const slug of payload.tenantSlugs) {
      tenantSlugSet.add(slug);
    }
  }

  const tenantPermissions = permissions?.tenantPermissions;
  if (tenantPermissions) {
    for (const slug of Object.keys(tenantPermissions)) {
      tenantSlugSet.add(slug);
    }
  }

  const projectPermissions = permissions?.projectPermissions;
  if (projectPermissions) {
    for (const slug of Object.keys(projectPermissions)) {
      tenantSlugSet.add(slug);
    }
  }

  return Array.from(tenantSlugSet);
}

function collectOwnedTenantSlugs(
  payload: JwtPayload,
  permissions: AuthenticatedUser["permissions"]
): string[] {
  const ownedTenantSet = new Set<string>();

  if (Array.isArray(payload.ownedTenantSlugs)) {
    for (const slug of payload.ownedTenantSlugs) {
      ownedTenantSet.add(slug);
    }
  }

  const tenantPermissions = permissions?.tenantPermissions;
  if (tenantPermissions) {
    for (const [slug, permission] of Object.entries(tenantPermissions)) {
      if (permission.isOwner) {
        ownedTenantSet.add(slug);
      }
    }
  }

  return Array.from(ownedTenantSet);
}
