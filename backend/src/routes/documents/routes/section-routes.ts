import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDocumentSection,
  listDocumentSections,
  listDocumentSectionsWithRelations,
  updateDocumentSection,
  deleteDocumentSection
} from "../../../services/graph.js";
import { verifyTenantAccessHook, verifyTenantAccessFromBodyHook } from "../../../lib/authorization.js";

const documentSectionSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  order: z.number().int().min(0)
});

/**
 * Register all section CRUD routes
 */
export async function registerSectionRoutes(app: FastifyInstance): Promise<void> {
  // Create section
  app.post("/sections", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook]
  }, async (req, reply) => {
    const payload = documentSectionSchema.parse(req.body);

    const section = await createDocumentSection({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      order: payload.order,
      userId: req.currentUser!.sub
    });
    return { section };
  });

  // List sections
  app.get("/sections/:tenant/:project/:documentSlug", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const sections = await listDocumentSections(params.tenant, params.project, params.documentSlug);
    return { sections };
  });

  // List sections with full relations (optimized endpoint)
  // Reduces N+1 queries: 30 API calls → 1 API call for 10 sections (~97% reduction)
  app.get("/sections/:tenant/:project/:documentSlug/full", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const sections = await listDocumentSectionsWithRelations(params.tenant, params.project, params.documentSlug);
    return { sections };
  });

  // Update section
  app.patch("/sections/:sectionId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const bodySchema = z.object({
      tenant: z.string().min(1),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      order: z.number().int().min(0).optional(),
      shortCode: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    try {
      const section = await updateDocumentSection(params.sectionId, body, req.currentUser!.sub);
      return { section };
    } catch (error) {
      if ((error as Error).message === "Section not found") {
        return reply.status(404).send({ error: "Section not found" });
      }
      throw error;
    }
  });

  // Delete section
  app.delete("/sections/:sectionId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const bodySchema = z.object({
      tenant: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    try {
      await deleteDocumentSection(params.sectionId, req.currentUser!.sub);
      return { success: true };
    } catch (error) {
      return reply.status(404).send({ error: "Section not found" });
    }
  });
}
