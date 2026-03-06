import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listSectionRequirements,
  reorderRequirements,
  reorderRequirementsWithOrder
} from "../../../services/graph.js";
import {
  listSectionInfos,
  createInfo,
  updateInfo,
  deleteInfo,
  reorderInfos,
  reorderInfosWithOrder
} from "../../../services/graph/infos.js";
import {
  listSectionSurrogateReferences,
  createSurrogateReference,
  deleteSurrogateReference,
  reorderSurrogateReferences,
  reorderSurrogateReferencesWithOrder
} from "../../../services/graph/surrogates.js";
import { requireTenantAccess, verifyTenantAccessFromBodyHook, type AuthUser } from "../../../lib/authorization.js";

/**
 * Register all section content routes (requirements, infos, surrogates)
 * Includes listing, creation, and reordering operations
 */
export async function registerSectionContentRoutes(app: FastifyInstance): Promise<void> {
  // ============================
  // Content Listing Routes
  // ============================

  // List requirements in a section
  app.get("/sections/:sectionId/requirements", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const querySchema = z.object({
      tenant: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, query.tenant, reply);

    const requirements = await listSectionRequirements(params.sectionId);
    return { requirements };
  });

  // List infos in a section
  app.get("/sections/:sectionId/infos", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const querySchema = z.object({
      tenant: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, query.tenant, reply);

    const infos = await listSectionInfos(params.sectionId);
    return { infos };
  });

  // List surrogate references in a section
  app.get("/sections/:sectionId/surrogates", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const querySchema = z.object({
      tenant: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, query.tenant, reply);

    const surrogates = await listSectionSurrogateReferences(params.sectionId);
    return { surrogates };
  });

  // ============================
  // Content Creation Routes
  // ============================

  // Create a new info
  app.post("/infos", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["infos"],
      summary: "Create a new info",
      description: "Creates a new info item and writes it to markdown file",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "documentSlug", "text"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          documentSlug: { type: "string", minLength: 1, description: "Document slug" },
          sectionId: { type: "string", minLength: 1, description: "Section identifier" },
          text: { type: "string", minLength: 1, description: "Info text content" },
          title: { type: "string", description: "Info title (optional)" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            info: { type: "object" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const bodySchema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      documentSlug: z.string().min(1),
      text: z.string().min(1),
      title: z.string().optional(),
      sectionId: z.string().min(1).optional()
    });
    const payload = bodySchema.parse(req.body);

    // Generate ref for the info
    const ref = `INFO-${Date.now()}`;

    const record = await createInfo({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      ref,
      text: payload.text,
      title: payload.title,
      sectionId: payload.sectionId,
      userId: req.currentUser!.sub
    });

    return { info: record };
  });

  // Create a new surrogate reference
  app.post("/surrogates", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["surrogates"],
      summary: "Create a new surrogate reference",
      description: "Creates a new surrogate reference and writes it to markdown file",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "documentSlug", "slug"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          documentSlug: { type: "string", minLength: 1, description: "Document slug" },
          slug: { type: "string", minLength: 1, description: "Surrogate document slug" },
          caption: { type: "string", description: "Surrogate caption (optional)" },
          sectionId: { type: "string", minLength: 1, description: "Section identifier" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            surrogate: { type: "object" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const bodySchema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      documentSlug: z.string().min(1),
      slug: z.string().min(1),
      caption: z.string().optional(),
      sectionId: z.string().min(1).optional()
    });
    const payload = bodySchema.parse(req.body);

    const record = await createSurrogateReference({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      slug: payload.slug,
      caption: payload.caption,
      sectionId: payload.sectionId,
      userId: req.currentUser!.sub
    });

    return { surrogate: record };
  });

  // ============================
  // Content Update/Delete Routes
  // ============================

  // Update an info
  app.patch("/infos/:tenant/:project/:infoRef", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["infos"],
      summary: "Update an info",
      description: "Updates an info item's text or title",
      params: {
        type: "object",
        required: ["tenant", "project", "infoRef"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          infoRef: { type: "string", description: "Info ref (e.g. INFO-1708999123)" }
        }
      },
      body: {
        type: "object",
        properties: {
          text: { type: "string", description: "New text content" },
          title: { type: "string", description: "New title" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            info: { type: "object", additionalProperties: true }
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
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      infoRef: z.string().min(1)
    });
    const bodySchema = z.object({
      text: z.string().optional(),
      title: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const info = await updateInfo(params.tenant, params.project, params.infoRef, body, req.currentUser!.sub);
      return { info };
    } catch (err) {
      if (err instanceof Error && err.message === "Info not found") {
        return reply.status(404).send({ error: "Info not found" });
      }
      throw err;
    }
  });

  // Delete an info
  app.delete("/infos/:tenant/:project/:infoRef", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["infos"],
      summary: "Delete an info",
      description: "Permanently deletes an info item",
      params: {
        type: "object",
        required: ["tenant", "project", "infoRef"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          infoRef: { type: "string", description: "Info ref (e.g. INFO-1708999123)" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      infoRef: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    await deleteInfo(params.tenant, params.project, params.infoRef, req.currentUser!.sub);
    return { success: true };
  });

  // Delete a surrogate reference
  app.delete("/surrogates/:tenant/:project/:surrogateId", {
    onRequest: [app.authenticate],
    schema: {
      tags: ["surrogates"],
      summary: "Delete a surrogate reference",
      description: "Permanently deletes a surrogate reference",
      params: {
        type: "object",
        required: ["tenant", "project", "surrogateId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          surrogateId: { type: "string", description: "Surrogate reference ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      surrogateId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    await deleteSurrogateReference(params.tenant, params.project, params.surrogateId, req.currentUser!.sub);
    return { success: true };
  });

  // ============================
  // Content Reordering Routes
  // ============================

  // Reorder infos in a section
  app.post("/sections/:sectionId/reorder-infos", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["sections"],
      summary: "Reorder infos in a section",
      params: {
        type: "object",
        required: ["sectionId"],
        properties: {
          sectionId: { type: "string" }
        }
      },
      body: {
        type: "object",
        required: ["tenant", "infoIds"],
        properties: {
          tenant: { type: "string" },
          infoIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      tenant: z.string().min(1),
      infoIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderInfos(sectionId, payload.infoIds);

    return { success: true };
  });

  // Reorder surrogate references in a section
  app.post("/sections/:sectionId/reorder-surrogates", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["sections"],
      summary: "Reorder surrogate references in a section",
      params: {
        type: "object",
        required: ["sectionId"],
        properties: {
          sectionId: { type: "string" }
        }
      },
      body: {
        type: "object",
        required: ["tenant", "surrogateIds"],
        properties: {
          tenant: { type: "string" },
          surrogateIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      tenant: z.string().min(1),
      surrogateIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderSurrogateReferences(sectionId, payload.surrogateIds);

    return { success: true };
  });

  // Reorder requirements in a section
  app.post("/sections/:sectionId/reorder-requirements", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["sections"],
      summary: "Reorder requirements in a section",
      params: {
        type: "object",
        required: ["sectionId"],
        properties: {
          sectionId: { type: "string" }
        }
      },
      body: {
        type: "object",
        required: ["tenant", "requirementIds"],
        properties: {
          tenant: { type: "string" },
          requirementIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      tenant: z.string().min(1),
      requirementIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderRequirements(sectionId, payload.requirementIds);

    return { success: true };
  });

  // Unified reorder endpoint with explicit order values
  // Reorders requirements, infos, and surrogates with explicit order values for each item
  app.post("/sections/:sectionId/reorder-with-order", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["sections"],
      summary: "Reorder requirements, infos, and surrogates with explicit order values",
      params: {
        type: "object",
        properties: {
          sectionId: { type: "string", description: "Section ID" }
        },
        required: ["sectionId"]
      },
      body: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string" },
          requirements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                order: { type: "number" }
              },
              required: ["id", "order"]
            }
          },
          infos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                order: { type: "number" }
              },
              required: ["id", "order"]
            }
          },
          surrogates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                order: { type: "number" }
              },
              required: ["id", "order"]
            }
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const { sectionId } = req.params as { sectionId: string };

    const bodySchema = z.object({
      tenant: z.string().min(1),
      requirements: z.array(z.object({ id: z.string(), order: z.number() })).optional(),
      infos: z.array(z.object({ id: z.string(), order: z.number() })).optional(),
      surrogates: z.array(z.object({ id: z.string(), order: z.number() })).optional()
    });
    const payload = bodySchema.parse(req.body);

    await Promise.all([
      payload.requirements && payload.requirements.length > 0
        ? reorderRequirementsWithOrder(sectionId, payload.requirements)
        : Promise.resolve(),
      payload.infos && payload.infos.length > 0
        ? reorderInfosWithOrder(sectionId, payload.infos)
        : Promise.resolve(),
      payload.surrogates && payload.surrogates.length > 0
        ? reorderSurrogateReferencesWithOrder(sectionId, payload.surrogates)
        : Promise.resolve()
    ]);

    return { success: true };
  });
}
