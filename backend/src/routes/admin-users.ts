import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  createDevUser,
  deleteDevUser,
  getDevUser,
  listDevUsers,
  updateDevUser,
  type DevUserRecord
} from "../services/dev-users.js";
import {
  sendAdminCreatedAccountEmail,
  sendTenantAccessChangedEmail,
  sendRoleChangedEmail
} from "../lib/email.js";

type SanitizedDevUser = Omit<DevUserRecord, "password" | "passwordHash" | "passwordSalt">;

function sanitizeUser(user: DevUserRecord): SanitizedDevUser {
  const { password, passwordHash, passwordSalt, ...sanitized } = user;
  return sanitized;
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  roles: z.array(z.string().min(1)).optional(),
  tenantSlugs: z.array(z.string().min(1)).optional()
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional().or(z.literal("")),
  password: z.string().min(1).optional(),
  roles: z.array(z.string().min(1)).optional(),
  tenantSlugs: z.array(z.string().min(1)).optional()
});

export default async function registerAdminUserRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.adminRoutesEnabled) {
    app.log.debug("Admin user routes disabled via configuration");
    return;
  }

  app.get("/admin/users", {
    schema: {
      tags: ["admin"],
      summary: "List all users",
      description: "Lists all admin-managed users",
      response: {
        200: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  name: { type: "string", nullable: true },
                  roles: { type: "array", items: { type: "string" } },
                  tenantSlugs: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const users = await listDevUsers();
    return { users: users.map(sanitizeUser) };
  });

  app.post("/admin/users", {
    schema: {
      tags: ["admin"],
      summary: "Create a new user",
      description: "Creates a new admin-managed user",
      body: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", description: "User email" },
          name: { type: "string", minLength: 1, description: "User name" },
          password: { type: "string", minLength: 1, description: "User password" },
          roles: { type: "array", items: { type: "string", minLength: 1 }, description: "User roles" },
          tenantSlugs: { type: "array", items: { type: "string", minLength: 1 }, description: "Tenant access" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string", nullable: true },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    try {
      const user = await createDevUser(body);
      sendAdminCreatedAccountEmail(
        user.email,
        user.name ?? undefined,
        Array.isArray(user.tenantSlugs) ? user.tenantSlugs : [],
        Array.isArray(user.roles) ? user.roles : []
      ).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send admin-created user emails");
      });
      return { user: sanitizeUser(user) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  app.patch("/admin/users/:id", {
    schema: {
      tags: ["admin"],
      summary: "Update a user",
      description: "Updates an admin-managed user",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "User ID" }
        }
      },
      body: {
        type: "object",
        properties: {
          email: { type: "string", format: "email", description: "User email" },
          name: { type: "string", description: "User name (empty string to clear)" },
          password: { type: "string", minLength: 1, description: "New password" },
          roles: { type: "array", items: { type: "string", minLength: 1 }, description: "User roles" },
          tenantSlugs: { type: "array", items: { type: "string", minLength: 1 }, description: "Tenant access" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                name: { type: "string", nullable: true },
                roles: { type: "array", items: { type: "string" } },
                tenantSlugs: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const body = updateSchema.parse(req.body);

    try {
      const existing = await getDevUser(params.id);
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const updated = await updateDevUser(params.id, {
        ...body,
        name: typeof body.name === "string" && body.name.trim() === "" ? null : body.name
      });
      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }

      const previousTenants = Array.isArray(existing.tenantSlugs) ? existing.tenantSlugs : [];
      const nextTenants = Array.isArray(updated.tenantSlugs) ? updated.tenantSlugs : [];
      const addedTenants = nextTenants.filter(tenant => !previousTenants.includes(tenant));
      const removedTenants = previousTenants.filter(tenant => !nextTenants.includes(tenant));

      const previousRoles = Array.isArray(existing.roles) ? existing.roles : [];
      const nextRoles = Array.isArray(updated.roles) ? updated.roles : [];
      const addedRoles = nextRoles.filter(role => !previousRoles.includes(role));
      const removedRoles = previousRoles.filter(role => !nextRoles.includes(role));

      Promise.all([
        sendTenantAccessChangedEmail(
          updated.email,
          updated.name ?? undefined,
          addedTenants,
          removedTenants
        ),
        sendRoleChangedEmail(
          updated.email,
          updated.name ?? undefined,
          addedRoles,
          removedRoles
        )
      ]).catch(emailError => {
        req.log.error({ err: emailError }, "Failed to send admin user update emails");
      });

      return { user: sanitizeUser(updated) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  app.delete("/admin/users/:id", {
    schema: {
      tags: ["admin"],
      summary: "Delete a user",
      description: "Deletes an admin-managed user",
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "User ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const removed = await deleteDevUser(params.id);
    if (!removed) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { success: true };
  });
}
