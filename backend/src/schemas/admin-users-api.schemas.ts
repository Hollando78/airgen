/**
 * OpenAPI/Swagger schema definitions for admin user management routes
 */

import { UserRole } from "../types/roles.js";

const userResponseSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    name: { type: "string", nullable: true },
    emailVerified: { type: "boolean" },
    mfaEnabled: { type: "boolean" },
    permissions: {
      type: "object",
      additionalProperties: true
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" }
  }
};

const errorResponseSchema = {
  type: "object" as const,
  properties: {
    error: { type: "string" }
  }
};

const successResponseSchema = {
  type: "object" as const,
  properties: {
    success: { type: "boolean" }
  }
};

const userIdParamSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "string", description: "User ID" }
  }
};

export const listUsersSchema = {
  tags: ["admin"],
  summary: "List all users",
  description: "Lists all users with detailed permission information (filtered by tenant access)",
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: "object",
      properties: {
        users: {
          type: "array",
          items: userResponseSchema
        }
      }
    },
    401: errorResponseSchema,
    403: errorResponseSchema
  }
};

export const getUserByIdSchema = {
  tags: ["admin"],
  summary: "Get user details",
  description: "Get detailed information about a specific user",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema
  }
};

export const createUserSchema = {
  tags: ["admin"],
  summary: "Create a new user",
  description: "Creates a new user with specified permissions",
  security: [{ bearerAuth: [] }],
  body: {
    type: "object",
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
      name: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 8 },
      permissions: {
        type: "object",
        properties: {
          globalRole: { type: "string", enum: Object.values(UserRole) },
          tenantPermissions: { type: "object" },
          projectPermissions: { type: "object" }
        }
      }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    409: errorResponseSchema
  }
};

export const updateUserSchema = {
  tags: ["admin"],
  summary: "Update user information",
  description: "Updates user's basic information (email, name, password)",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  body: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      name: { type: "string", nullable: true },
      password: { type: "string", minLength: 8 },
      emailVerified: { type: "boolean" }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema
  }
};

export const updatePermissionsSchema = {
  tags: ["admin"],
  summary: "Update user permissions",
  description: "Updates a user's complete permission structure",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  body: {
    type: "object",
    required: ["permissions"],
    properties: {
      permissions: {
        type: "object",
        properties: {
          globalRole: { type: "string", enum: Object.values(UserRole) },
          tenantPermissions: { type: "object" },
          projectPermissions: { type: "object" }
        }
      }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema
  }
};

export const grantPermissionSchema = {
  tags: ["admin"],
  summary: "Grant permission",
  description: "Grants a specific permission to a user",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  body: {
    type: "object",
    required: ["role"],
    properties: {
      role: { type: "string", enum: Object.values(UserRole) },
      tenantSlug: { type: "string" },
      projectKey: { type: "string" },
      isOwner: { type: "boolean" }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema
  }
};

export const revokePermissionSchema = {
  tags: ["admin"],
  summary: "Revoke permission",
  description: "Revokes a specific permission from a user",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  body: {
    type: "object",
    properties: {
      tenantSlug: { type: "string" },
      projectKey: { type: "string" }
    }
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: userResponseSchema
      }
    },
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema
  }
};

export const deleteUserSchema = {
  tags: ["admin"],
  summary: "Delete a user",
  description: "Deletes a user from the system (soft delete)",
  security: [{ bearerAuth: [] }],
  params: userIdParamSchema,
  response: {
    200: successResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema
  }
};
