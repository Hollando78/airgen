import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createFolder,
  listFolders,
  updateFolder,
  softDeleteFolder
} from "../../../services/graph.js";

const folderSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  parentFolder: z.string().optional()
});

/**
 * Register all folder-related routes
 */
export async function registerFolderRoutes(app: FastifyInstance): Promise<void> {
  // Create folder
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

  // List folders
  app.get("/folders/:tenant/:project", async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const folders = await listFolders(params.tenant, params.project);
    return { folders };
  });

  // Update folder
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
    if (!folder) {return reply.status(404).send({ error: "Folder not found" });}
    return { folder };
  });

  // Delete folder
  app.delete("/folders/:tenant/:project/:folderSlug", async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      folderSlug: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const folder = await softDeleteFolder(params.tenant, params.project, params.folderSlug);
    if (!folder) {return reply.status(404).send({ error: "Folder not found" });}
    return { folder };
  });
}
