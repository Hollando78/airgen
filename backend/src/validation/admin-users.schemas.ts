/**
 * Validation schemas for admin user management
 */

import { z } from "zod";
import { UserRole } from "../types/roles.js";

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  permissions: z.object({
    globalRole: z.nativeEnum(UserRole).optional(),
    tenantPermissions: z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      isOwner: z.boolean().optional()
    })).optional(),
    projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole)
    }))).optional()
  }).optional()
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().optional().nullable(),
  password: z.string().min(8).optional(),
  emailVerified: z.boolean().optional()
});

export const updatePermissionsSchema = z.object({
  permissions: z.object({
    globalRole: z.nativeEnum(UserRole).optional(),
    tenantPermissions: z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole),
      isOwner: z.boolean().optional()
    })).optional(),
    projectPermissions: z.record(z.string(), z.record(z.string(), z.object({
      role: z.nativeEnum(UserRole)
    }))).optional()
  })
});

export const grantPermissionSchema = z.object({
  role: z.nativeEnum(UserRole),
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional(),
  isOwner: z.boolean().optional()
});

export const revokePermissionSchema = z.object({
  tenantSlug: z.string().optional(),
  projectKey: z.string().optional()
});

export const userIdParamSchema = z.object({
  id: z.string().uuid()
});
