import type { FastifyBaseLogger } from "fastify";
import type { UserPermissions } from "../../types/permissions.js";

export type AuthenticatedUser = {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  tenantSlugs?: string[];
  ownedTenantSlugs?: string[];
  permissions?: UserPermissions;
};

export type JwtPayload = {
  sub?: string;
  id?: string;
  email?: string;
  name?: string;
  roles?: string[];
  tenantSlugs?: string[];
  ownedTenantSlugs?: string[];
  permissions?: UserPermissions;
};

export interface CreateAuthPluginOptions {
  jwtSecret: string;
  logger?: FastifyBaseLogger;
}

export interface RegisterAuthOptions extends Partial<CreateAuthPluginOptions> {}
