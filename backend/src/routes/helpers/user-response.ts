import { userRepository } from "../../repositories/UserRepository.js";
import type { UserPermissions } from "../../types/permissions.js";
import { buildJwtPayloadFromPostgres } from "../../services/auth-postgres.js";

export interface UserResponse {
  id: string;
  email: string;
  name?: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  roles: string[];
  tenantSlugs: string[];
  ownedTenantSlugs: string[];
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
}

export async function buildUserResponse(userId: string): Promise<UserResponse | null> {
  const user = await userRepository.findById(userId);
  if (!user) {
    return null;
  }

  const payload = await buildJwtPayloadFromPostgres(userId);

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    roles: payload.roles,
    tenantSlugs: payload.tenantSlugs,
    ownedTenantSlugs: payload.ownedTenantSlugs,
    permissions: payload.permissions,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}
