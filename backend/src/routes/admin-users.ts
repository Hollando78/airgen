import { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import {
  createDevUser,
  deleteDevUser,
  listDevUsers,
  updateDevUser,
  type DevUserRecord
} from "../services/dev-users.js";

function sanitizeUser(user: DevUserRecord): Omit<DevUserRecord, 'password'> {
  const { password, ...sanitized } = user;
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
  if (config.environment === "production") {
    app.log.debug("Admin user routes skipped in production mode");
    return;
  }

  app.get("/admin/users", async () => {
    const users = await listDevUsers();
    return { users: users.map(sanitizeUser) };
  });

  app.post("/admin/users", async (req, reply) => {
    const body = createSchema.parse(req.body);
    try {
      const user = await createDevUser(body);
      return { user: sanitizeUser(user) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  app.patch("/admin/users/:id", async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const body = updateSchema.parse(req.body);

    try {
      const updated = await updateDevUser(params.id, {
        ...body,
        name: typeof body.name === "string" && body.name.trim() === "" ? null : body.name
      });
      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }
      return { user: sanitizeUser(updated) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EUSER_EXISTS") {
        return reply.status(409).send({ error: "User with this email already exists" });
      }
      throw error;
    }
  });

  app.delete("/admin/users/:id", async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const removed = await deleteDevUser(params.id);
    if (!removed) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { success: true };
  });
}
