import type { FastifyInstance } from "fastify";
import type { AuthUser } from "../lib/authorization.js";
import { getErrorMessage } from "../lib/type-guards.js";
import {
  getProjectListForTenant,
  createProjectInTenant,
  deleteProjectFromTenant,
  isProjectOwner,
  validateProjectAccess
} from "../services/ProjectManagementService.js";
import {
  tenantParamSchema,
  projectParamSchema,
  createProjectSchema
} from "../validation/core-routes.schemas.js";
import {
  listProjectsResponseSchema,
  createProjectRequestSchema,
  createProjectResponseSchema,
  deleteProjectResponseSchema,
  errorResponseSchema
} from "../schemas/core-api.schemas.js";

/**
 * Project management routes
 *
 * Extracted from routes/core.ts for better organization
 */
export default async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  // List projects for a tenant
  app.get("/tenants/:tenant/projects", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["projects"],
      summary: "List projects for a tenant",
      description: "Retrieves all projects for a specific tenant with requirement counts",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: listProjectsResponseSchema,
        403: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser;
    const params = tenantParamSchema.parse(req.params);

    // Verify user has access to this tenant
    try {
      validateProjectAccess(user, params.tenant);
    } catch (error) {
      reply.status(403).send({ error: getErrorMessage(error) });
      return;
    }

    const projects = await getProjectListForTenant(params.tenant);
    return { projects };
  });

  // Create a new project
  app.post("/tenants/:tenant/projects", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["projects"],
      summary: "Create a new project",
      description: "Creates a new project within a tenant (owner only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      body: createProjectRequestSchema,
      response: {
        200: createProjectResponseSchema,
        401: errorResponseSchema,
        400: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const params = tenantParamSchema.parse(req.params);

    if (!isProjectOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can create projects" });
    }

    const body = createProjectSchema.parse(req.body);

    try {
      const project = await createProjectInTenant(params.tenant, body);
      return { project };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  // Delete a project
  app.delete("/tenants/:tenant/projects/:project", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["projects"],
      summary: "Delete a project",
      description: "Deletes a project and all associated data (owner only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      },
      response: {
        200: deleteProjectResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const params = projectParamSchema.parse(req.params);

    if (!isProjectOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can delete projects" });
    }

    const success = await deleteProjectFromTenant(params.tenant, params.project);
    if (!success) {
      return reply.status(404).send({ error: "Project not found" });
    }

    return { success: true };
  });
}
