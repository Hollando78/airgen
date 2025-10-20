import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getCacheStats } from "../lib/cache.js";
import { areMetricsAvailable } from "../lib/metrics.js";
import { getSentryStatus } from "../lib/sentry.js";
import {
  healthzResponseSchema,
  readyzResponseSchema,
  healthResponseSchema
} from "../schemas/core-api.schemas.js";

/**
 * Health check and system status routes
 *
 * Extracted from routes/core.ts for better organization
 */
export default async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe - simple check that the server is running
  app.get("/healthz", {
    schema: {
      tags: ["health"],
      summary: "Liveness check",
      description: "Simple liveness check for Kubernetes/Docker health probes",
      response: {
        200: healthzResponseSchema
      }
    }
  }, async () => {
    return { status: "ok" };
  });

  // Readiness probe - checks if the server can handle requests
  app.get("/readyz", {
    schema: {
      tags: ["health"],
      summary: "Readiness check",
      description: "Checks if the server is ready to accept traffic (database connectivity, etc.)",
      response: {
        200: readyzResponseSchema,
        503: readyzResponseSchema
      }
    }
  }, async (_req, reply) => {
    const checks: Record<string, string> = {};
    let isReady = true;

    // Check Neo4j connectivity
    try {
      const { getSession } = await import("../services/graph/driver.js");
      const session = getSession();
      await session.run("RETURN 1");
      await session.close();
      checks.database = "ready";
    } catch (error) {
      checks.database = "not_ready";
      isReady = false;
    }

    if (isReady) {
      return { status: "ready", checks };
    } else {
      reply.status(503);
      return { status: "not_ready", checks };
    }
  });

  // Comprehensive health check endpoint
  app.get("/health", {
    schema: {
      tags: ["health"],
      summary: "Health check endpoint",
      description: "Returns system health status and metrics",
      response: {
        200: healthResponseSchema
      }
    }
  }, async () => {
    const memUsage = process.memoryUsage();

    // Check Neo4j connectivity
    let dbStatus = "unknown";
    try {
      const { getSession } = await import("../services/graph/driver.js");
      const session = getSession();
      await session.run("RETURN 1");
      await session.close();
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }

    // Check cache status
    const cacheStats = await getCacheStats();
    const cacheStatus = cacheStats.available ? "connected" : "unavailable";

    // Get Sentry status
    const sentryStatus = getSentryStatus();

    const timestamp = new Date().toISOString();

    return {
      ok: true,
      timestamp,
      time: timestamp,  // Alias for frontend compatibility
      uptime: process.uptime(),
      environment: config.environment,
      env: config.environment,  // Alias for frontend compatibility
      workspace: config.workspaceRoot,  // Workspace root path
      version: "0.1.0",
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
      },
      services: {
        database: dbStatus,
        cache: cacheStatus,
        llm: (await import("../services/llm.js")).isLlmConfigured() ? "configured" : "not-configured"
      },
      observability: {
        metrics: areMetricsAvailable(),
        errorTracking: sentryStatus.enabled
      },
      ...(cacheStats.available && cacheStats.info && {
        cacheStats: {
          totalConnections: cacheStats.info.total_connections_received || '0',
          totalCommands: cacheStats.info.total_commands_processed || '0',
          keyspaceHits: cacheStats.info.keyspace_hits || '0',
          keyspaceMisses: cacheStats.info.keyspace_misses || '0'
        }
      })
    };
  });
}
