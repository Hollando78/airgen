import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  updateDocumentFolder,
  softDeleteDocument,
  createFolder,
  listFolders,
  updateFolder,
  softDeleteFolder,
  createDocumentSection,
  listDocumentSections,
  updateDocumentSection,
  deleteDocumentSection,
  listSectionRequirements
} from "../services/graph.js";

const documentSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  parentFolder: z.string().optional()
});

const folderSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

const documentSectionSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  shortCode: z.string().optional(),
  order: z.number().int().min(0)
});

export default async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/documents", async (req) => {
    const payload = documentSchema.parse(req.body);
    const document = await createDocument({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      parentFolder: payload.parentFolder
    });
    return { document };
  });

  app.get("/documents/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const documents = await listDocuments(params.tenant, params.project);
    return { documents };
  });

  app.get("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const document = await getDocument(params.tenant, params.project, params.documentSlug);
    if (!document) return reply.status(404).send({ error: "Document not found" });
    return { document };
  });

  app.patch("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      shortCode: z.string().optional(),
      parentFolder: z.string().optional().nullable()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    let document;
    if (body.parentFolder !== undefined) {
      document = await updateDocumentFolder(
        params.tenant,
        params.project,
        params.documentSlug,
        body.parentFolder
      );
    } else {
      const { name, description, shortCode } = body;
      document = await updateDocument(params.tenant, params.project, params.documentSlug, {
        name,
        description,
        shortCode
      });
    }

    if (!document) return reply.status(404).send({ error: "Document not found" });
    return { document };
  });

  app.delete("/documents/:tenant/:project/:documentSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const document = await softDeleteDocument(params.tenant, params.project, params.documentSlug);
    if (!document) return reply.status(404).send({ error: "Document not found" });
    return { document };
  });

  app.post("/folders", async (req) => {
    const payload = folderSchema.parse(req.body);
    const folder = await createFolder({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      name: payload.name,
      description: payload.description,
      parentFolder: payload.parentFolder
    });
    return { folder };
  });

  app.get("/folders/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const folders = await listFolders(params.tenant, params.project);
    return { folders };
  });

  app.patch("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      folderSlug: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const folder = await updateFolder(params.tenant, params.project, params.folderSlug, body);
    if (!folder) return reply.status(404).send({ error: "Folder not found" });
    return { folder };
  });

  app.delete("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      folderSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const folder = await softDeleteFolder(params.tenant, params.project, params.folderSlug);
    if (!folder) return reply.status(404).send({ error: "Folder not found" });
    return { folder };
  });

  app.post("/sections", async (req) => {
    const payload = documentSectionSchema.parse(req.body);
    const section = await createDocumentSection({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      name: payload.name,
      description: payload.description,
      shortCode: payload.shortCode,
      order: payload.order
    });
    return { section };
  });

  app.get("/sections/:tenant/:project/:documentSlug", async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      documentSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const sections = await listDocumentSections(params.tenant, params.project, params.documentSlug);
    return { sections };
  });

  app.patch("/sections/:sectionId", async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      order: z.number().int().min(0).optional(),
      shortCode: z.string().optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    try {
      const section = await updateDocumentSection(params.sectionId, body);
      return { section };
    } catch (error) {
      if ((error as Error).message === "Section not found") {
        return reply.status(404).send({ error: "Section not found" });
      }
      throw error;
    }
  });

  app.delete("/sections/:sectionId", async (req, reply) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      await deleteDocumentSection(params.sectionId);
      return { success: true };
    } catch (error) {
      return reply.status(404).send({ error: "Section not found" });
    }
  });

  app.get("/sections/:sectionId/requirements", async (req) => {
    const paramsSchema = z.object({
      sectionId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const requirements = await listSectionRequirements(params.sectionId);
    return { requirements };
  });
}
