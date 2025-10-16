import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { config } from "../config.js";
import type { UserPermissions } from "../types/permissions.js";

export type AuthenticatedUser = {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  tenantSlugs?: string[];
  ownedTenantSlugs?: string[];
  permissions?: UserPermissions;
};

type JwtPayload = {
  sub?: string;
  id?: string;
  email?: string;
  name?: string;
  roles?: string[];
  tenantSlugs?: string[];
  ownedTenantSlugs?: string[];
  permissions?: UserPermissions;
};

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    currentUser: AuthenticatedUser | null;
  }
}

function normalizeUser(payload: JwtPayload): AuthenticatedUser {
  if (!payload.sub) {
    throw new Error("JWT payload missing 'sub' claim");
  }

  const roles = Array.isArray(payload.roles) && payload.roles.length ? payload.roles : ["user"];
  const permissions = payload.permissions;

  const tenantSlugSet = new Set<string>();
  if (Array.isArray(payload.tenantSlugs)) {
    for (const slug of payload.tenantSlugs) {
      tenantSlugSet.add(slug);
    }
  }
  if (permissions?.tenantPermissions) {
    for (const slug of Object.keys(permissions.tenantPermissions)) {
      tenantSlugSet.add(slug);
    }
  }
  if (permissions?.projectPermissions) {
    for (const slug of Object.keys(permissions.projectPermissions)) {
      tenantSlugSet.add(slug);
    }
  }

  const ownedTenantSlugs = new Set<string>();
  if (Array.isArray(payload.ownedTenantSlugs)) {
    for (const slug of payload.ownedTenantSlugs) {
      ownedTenantSlugs.add(slug);
    }
  }
  if (permissions?.tenantPermissions) {
    for (const [slug, permission] of Object.entries(permissions.tenantPermissions)) {
      if (permission.isOwner) {
        ownedTenantSlugs.add(slug);
      }
    }
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles,
    tenantSlugs: Array.from(tenantSlugSet),
    ownedTenantSlugs: Array.from(ownedTenantSlugs),
    permissions
  };
}

export async function registerAuth(app: FastifyInstance<any, any, any, any, any>): Promise<void> {
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorateRequest("currentUser", null);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    request.currentUser = null;
    const payload = await request.jwtVerify<JwtPayload>();
    request.currentUser = normalizeUser(payload);
  });

  app.decorate("optionalAuthenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    request.currentUser = null;
    try {
      const payload = await request.jwtVerify<JwtPayload>();
      request.currentUser = normalizeUser(payload);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER") {
        request.currentUser = null;
        return;
      }
      throw error;
    }
  });
}
