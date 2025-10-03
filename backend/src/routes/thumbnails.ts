import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { getDiagramThumbnail, getSurrogateThumbnail, invalidateThumbnail } from "../services/thumbnail-generator.js";
import { config } from "../config.js";

const getDiagramThumbnailParams = z.object({
  diagramId: z.string().min(1)
});

const getSurrogateThumbnailParams = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  surrogateId: z.string().min(1)
});

const regenerateDiagramThumbnailParams = z.object({
  diagramId: z.string().min(1)
});

const regenerateSurrogateThumbnailParams = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  surrogateId: z.string().min(1)
});

/**
 * Thumbnail generation routes
 */
export default async function thumbnailRoutes(app: FastifyInstance) {
  /**
   * GET /thumbnails/diagrams/:diagramId
   * Get diagram thumbnail (generates if doesn't exist)
   */
  app.get(
    "/thumbnails/diagrams/:diagramId",
    async (req, reply) => {
      const params = getDiagramThumbnailParams.parse(req.params);

      // For now, extract tenant/project from query params or use defaults
      // In production, you'd get this from the authenticated user context
      const tenant = (req.query as any).tenant || "hollando";
      const project = (req.query as any).project || "main-battle-tank";

      try {
        const thumbnailPath = await getDiagramThumbnail(tenant, project, params.diagramId);

        // Read and send thumbnail
        const thumbnail = await fs.readFile(thumbnailPath);
        reply.type("image/png");
        reply.header("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
        return thumbnail;
      } catch (error) {
        app.log.error({ error, diagramId: params.diagramId }, "Failed to generate diagram thumbnail");
        return reply.status(500).send({
          error: "Failed to generate thumbnail",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  /**
   * GET /thumbnails/surrogates/:tenant/:project/:surrogateId
   * Get surrogate thumbnail (generates if doesn't exist)
   */
  app.get(
    "/thumbnails/surrogates/:tenant/:project/:surrogateId",
    async (req, reply) => {
      const params = getSurrogateThumbnailParams.parse(req.params);

      try {
        // Find the surrogate file
        const surrogatesDir = join(
          config.workspaceRoot,
          params.tenant,
          params.project,
          "surrogates",
          params.surrogateId
        );

        // List files in surrogate directory
        const files = await fs.readdir(surrogatesDir);

        // Find the main file (not the -preview.pdf file)
        const mainFile = files.find(f => !f.includes("-preview") && !f.startsWith('.'));

        if (!mainFile) {
          return reply.status(404).send({ error: "Surrogate file not found" });
        }

        const filePath = join(surrogatesDir, mainFile);

        const thumbnailPath = await getSurrogateThumbnail(
          params.tenant,
          params.project,
          params.surrogateId,
          filePath
        );

        // Read and send thumbnail
        const thumbnail = await fs.readFile(thumbnailPath);
        reply.type("image/png");
        reply.header("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
        return thumbnail;
      } catch (error) {
        app.log.error(
          { error, surrogateId: params.surrogateId },
          "Failed to generate surrogate thumbnail"
        );
        return reply.status(500).send({
          error: "Failed to generate thumbnail",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  /**
   * POST /thumbnails/diagrams/:diagramId/regenerate
   * Force regenerate diagram thumbnail
   */
  app.post(
    "/thumbnails/diagrams/:diagramId/regenerate",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const params = regenerateDiagramThumbnailParams.parse(req.params);
      const tenant = (req.query as any).tenant || "hollando";
      const project = (req.query as any).project || "main-battle-tank";

      try {
        // Invalidate existing thumbnail
        await invalidateThumbnail(tenant, project, "diagram", params.diagramId);

        // Generate new thumbnail
        const thumbnailPath = await getDiagramThumbnail(tenant, project, params.diagramId);

        return { success: true, path: thumbnailPath };
      } catch (error) {
        app.log.error({ error, diagramId: params.diagramId }, "Failed to regenerate diagram thumbnail");
        return reply.status(500).send({
          error: "Failed to regenerate thumbnail",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  /**
   * POST /thumbnails/surrogates/:tenant/:project/:surrogateId/regenerate
   * Force regenerate surrogate thumbnail
   */
  app.post(
    "/thumbnails/surrogates/:tenant/:project/:surrogateId/regenerate",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const params = regenerateSurrogateThumbnailParams.parse(req.params);

      try {
        // Invalidate existing thumbnail
        await invalidateThumbnail(params.tenant, params.project, "surrogate", params.surrogateId);

        // Find the surrogate file
        const surrogatesDir = join(
          config.workspaceRoot,
          params.tenant,
          params.project,
          "surrogates",
          params.surrogateId
        );

        const files = await fs.readdir(surrogatesDir);
        const mainFile = files.find(f => !f.includes("-preview") && !f.startsWith('.'));

        if (!mainFile) {
          return reply.status(404).send({ error: "Surrogate file not found" });
        }

        const filePath = join(surrogatesDir, mainFile);

        // Generate new thumbnail
        const thumbnailPath = await getSurrogateThumbnail(
          params.tenant,
          params.project,
          params.surrogateId,
          filePath
        );

        return { success: true, path: thumbnailPath };
      } catch (error) {
        app.log.error(
          { error, surrogateId: params.surrogateId },
          "Failed to regenerate surrogate thumbnail"
        );
        return reply.status(500).send({
          error: "Failed to regenerate thumbnail",
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
}
