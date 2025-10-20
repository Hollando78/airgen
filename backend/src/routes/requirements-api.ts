/**
 * Requirements API Routes - Main Orchestrator
 *
 * This file registers all requirement-related routes by composing
 * focused domain-specific route modules:
 * - CRUD operations
 * - Duplicate management
 * - Baseline snapshots
 * - Link suggestions
 * - Version history
 */

import type { FastifyInstance } from "fastify";
import { registerCrudRoutes } from "./requirements-crud-routes.js";
import { registerDuplicateRoutes } from "./requirements-duplicate-routes.js";
import { registerBaselineRoutes } from "./requirements-baseline-routes.js";
import { registerLinkRoutes } from "./requirements-link-routes.js";
import { registerVersionRoutes } from "./requirements-version-routes.js";

/**
 * Register all requirement routes
 *
 * Composes 5 focused route modules:
 * 1. CRUD routes - Create, read, update, delete, archive, unarchive
 * 2. Duplicate routes - Find and fix duplicate refs
 * 3. Baseline routes - Create, list, compare baselines
 * 4. Link routes - Suggest related requirements
 * 5. Version routes - History, diff, restore
 */
export default async function registerRequirementRoutes(app: FastifyInstance): Promise<void> {
  await registerCrudRoutes(app);
  await registerDuplicateRoutes(app);
  await registerBaselineRoutes(app);
  await registerLinkRoutes(app);
  await registerVersionRoutes(app);
}
