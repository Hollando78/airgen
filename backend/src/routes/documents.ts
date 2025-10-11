import type { FastifyInstance } from "fastify";
import { registerDocumentRoutes as setupDocumentCrudRoutes } from "./documents/routes/document-routes.js";
import { registerFolderRoutes } from "./documents/routes/folder-routes.js";
import { registerSectionRoutes } from "./documents/routes/section-routes.js";
import { registerSectionContentRoutes } from "./documents/routes/section-content-routes.js";

export default async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  // Register document CRUD routes
  await setupDocumentCrudRoutes(app);

  // Register folder routes
  await registerFolderRoutes(app);

  // Register section CRUD routes
  await registerSectionRoutes(app);

  // Register section content routes (listings, creation, reordering)
  await registerSectionContentRoutes(app);
}
