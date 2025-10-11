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
  reorderInfos,
  reorderInfosWithOrder
} from "../../../services/graph/infos.js";
import {
  listSectionSurrogateReferences,
  createSurrogateReference,
  reorderSurrogateReferences,
  reorderSurrogateReferencesWithOrder
} from "../../../services/graph/surrogates.js";

/**
 * Register all section content routes (requirements, infos, surrogates)
 * Includes listing, creation, and reordering operations
 */
export async function registerSectionContentRoutes(app: FastifyInstance): Promise<void> {
  // ============================
  // Content Listing Routes
  // ============================

  // List requirements in a section
  app.get("/sections/:sectionId/requirements", async (req) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const requirements = await listSectionRequirements(params.sectionId);
    return { requirements };
  });

  // List infos in a section
  app.get("/sections/:sectionId/infos", async (req) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const infos = await listSectionInfos(params.sectionId);
    return { infos };
  });

  // List surrogate references in a section
  app.get("/sections/:sectionId/surrogates", async (req) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const surrogates = await listSectionSurrogateReferences(params.sectionId);
    return { surrogates };
  });

  // ============================
  // Content Creation Routes
  // ============================

  // Create a new info
  app.post("/infos", {
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
  }, async (req) => {
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
      sectionId: payload.sectionId
    });

    return { info: record };
  });

  // Create a new surrogate reference
  app.post("/surrogates", {
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
  }, async (req) => {
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
      sectionId: payload.sectionId
    });

    return { surrogate: record };
  });

  // ============================
  // Content Reordering Routes
  // ============================

  // Reorder infos in a section
  app.post("/sections/:sectionId/reorder-infos", {
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
        required: ["infoIds"],
        properties: {
          infoIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      infoIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderInfos(sectionId, payload.infoIds);

    return { success: true };
  });

  // Reorder surrogate references in a section
  app.post("/sections/:sectionId/reorder-surrogates", {
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
        required: ["surrogateIds"],
        properties: {
          surrogateIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      surrogateIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderSurrogateReferences(sectionId, payload.surrogateIds);

    return { success: true };
  });

  // Reorder requirements in a section
  app.post("/sections/:sectionId/reorder-requirements", {
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
        required: ["requirementIds"],
        properties: {
          requirementIds: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }, async (req) => {
    const { sectionId } = req.params as { sectionId: string };
    const bodySchema = z.object({
      requirementIds: z.array(z.string())
    });
    const payload = bodySchema.parse(req.body);

    await reorderRequirements(sectionId, payload.requirementIds);

    return { success: true };
  });

  // Unified reorder endpoint with explicit order values
  // Reorders requirements, infos, and surrogates with explicit order values for each item
  app.post("/sections/:sectionId/reorder-with-order", {
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
        properties: {
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
  }, async (req) => {
    const { sectionId } = req.params as { sectionId: string };

    const bodySchema = z.object({
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
