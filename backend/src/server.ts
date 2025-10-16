import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { ensureWorkspace } from "./services/workspace.js";
import { initGraph, closeGraph } from "./services/graph.js";
import { registerAuth } from "./plugins/auth.js";
import { serializeError } from "./lib/type-guards.js";
import { logger } from "./lib/logger.js";
import { initMetrics, metricsMiddleware, getMetrics, areMetricsAvailable } from "./lib/metrics.js";
import { initSentry, sentryErrorHandler, isSentryEnabled, flush as flushSentry } from "./lib/sentry.js";
import { closeCache } from "./lib/cache.js";
import { startTokenCleanup, stopTokenCleanup, closeRefreshTokenStore } from "./lib/refresh-tokens.js";
import { sanitizeNeo4jResponse } from "./lib/neo4j-utils.js";
import { setupRequestIdMiddleware } from "./lib/request-id.js";
import draftRoutes from "./routes/draft.js";
import airgenRoutes from "./routes/airgen.js";
import coreRoutes from "./routes/core.js";
import requirementsRoutes from "./routes/requirements-api.js";
import documentRoutes from "./routes/documents.js";
import architectureRoutes from "./routes/architecture.js";
import traceRoutes from "./routes/trace.js";
import { linksetRoutes } from "./routes/linksets.js";
import authRoutes from "./routes/auth.js";
import mfaRoutes from "./routes/mfa.js";
import markdownRoutes from "./routes/markdown-api.js";
import thumbnailRoutes from "./routes/thumbnails.js";
import graphRoutes from "./routes/graph.js";
import workersRoutes from "./routes/workers.js";
import { adminRequirementsRoutes } from "./routes/admin-requirements.js";
import adminRecoveryRoutes from "./routes/admin-recovery.js";
import projectBackupRoutes from "./routes/project-backup-routes.js";
import nlQueryRoutes from "./routes/nl-query.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize observability infrastructure
await initMetrics();
await initSentry();

await ensureWorkspace();
await initGraph();

let prettyTransport: { target: string; options: Record<string, unknown> } | undefined;
if (config.environment === "development") {
  try {
    await import("pino-pretty");
    prettyTransport = {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname"
      }
    };
  } catch {
    logger.warn("pino-pretty not installed, development logs will be JSON");
  }
}

const app = Fastify({
  trustProxy: config.trustProxy,
  logger: {
    level: config.environment === "production" ? "info" : "debug",
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket?.remotePort,
          headers: {
            host: request.headers.host,
            "user-agent": request.headers["user-agent"],
            "content-type": request.headers["content-type"],
            "x-forwarded-for": request.headers["x-forwarded-for"]
          }
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode
        };
      },
      err(error) {
        const serialized = serializeError(error);
        const { stack: _omitStack, ...rest } = serialized;
        const stackValue = config.environment === "production" ? "" : serialized.stack ?? "";
        return {
          ...rest,
          stack: stackValue
        };
      }
    },
    transport: prettyTransport
  }
});

// Add custom JSON serializer to handle Neo4j types
app.addHook("onSend", async (request, reply, payload) => {
  // Only process JSON responses
  const contentType = reply.getHeader("content-type");
  if (typeof contentType === "string" && contentType.includes("application/json")) {
    if (typeof payload === "string") {
      try {
        // Parse, sanitize, and re-stringify
        const parsed = JSON.parse(payload);
        const sanitized = sanitizeNeo4jResponse(parsed);
        return JSON.stringify(sanitized);
      } catch {
        // If parsing fails, return original payload
        return payload;
      }
    }
  }
  return payload;
});

// CORS configuration (strict allowlist in production, permissive in dev)
// Note: config.ts enforces CORS_ORIGINS must be set in production
await app.register(cors, {
  origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  credentials: true
});
await app.register(fastifyCookie, {
  secret: config.jwtSecret, // Use JWT secret for cookie signing
  hook: "onRequest"
});

// Helmet security headers (CSP enabled only in production)
await app.register(helmet, {
  // Enable full CSP only in production
  contentSecurityPolicy: config.environment === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  } : false, // Disabled in dev to avoid interfering with HMR
  // Always enable these headers
  hsts: config.environment === "production" ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  frameguard: { action: "deny" },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});
// Global rate limiting (higher limit in dev for React strict mode)
await app.register(rateLimit, {
  max: config.rateLimit.global.max,
  timeWindow: config.rateLimit.global.timeWindow
});

// Register Swagger for API documentation
await app.register(swagger, {
  openapi: {
    info: {
      title: "AIRGen API",
      description: "AI-assisted requirements generation and management API",
      version: "0.1.0"
    },
    servers: [
      { url: "http://localhost:8787", description: "Development server" },
      { url: "https://airgen.studio", description: "Production server" }
    ],
    tags: [
      { name: "authentication", description: "Authentication endpoints" },
      { name: "mfa", description: "Multi-factor authentication" },
      { name: "core", description: "Core system endpoints" },
      { name: "requirements", description: "Requirements management" },
      { name: "documents", description: "Document management" },
      { name: "architecture", description: "Architecture diagrams" },
      { name: "trace", description: "Traceability links" },
      { name: "linksets", description: "Document linksets" },
      { name: "draft", description: "Requirement drafting" },
      { name: "airgen", description: "AI-powered generation" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    }
  }
});

await app.register(swaggerUi, {
  routePrefix: "/api/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true
  },
  staticCSP: true
});

await app.register(fastifyStatic, {
  root: join(__dirname, "../public"),
  prefix: "/"
});
app.addContentTypeParser(/^multipart\//, { parseAs: "buffer", bodyLimit: 50 * 1024 * 1024 }, (_req, body, done) => {
  done(null, body);
});
await registerAuth(app);

// Setup request ID middleware for correlation tracking
setupRequestIdMiddleware(app);

app.addHook("onRequest", app.optionalAuthenticate);

// Register metrics middleware for all requests
if (areMetricsAvailable()) {
  app.addHook("onRequest", metricsMiddleware);
}

// Register error handler for Sentry
if (isSentryEnabled()) {
  app.setErrorHandler((error, request, reply) => {
    // Capture error in Sentry
    sentryErrorHandler(error, request);

    // Log the error
    app.log.error({ err: error }, 'Request error');

    // Send error response
    const serialized = serializeError(error);
    reply.status(error.statusCode || 500).send({
      error: serialized.message,
      ...(config.environment !== 'production' && { stack: serialized.stack })
    });
  });
}

// Start refresh token cleanup
startTokenCleanup();

app.addHook("onClose", async () => {
  // Stop refresh token cleanup
  stopTokenCleanup();

  await closeRefreshTokenStore();

  // Flush Sentry events before closing
  if (isSentryEnabled()) {
    await flushSentry(2000);
  }

  await closeGraph();
  await closeCache();
});

// Prometheus metrics endpoint (unauthenticated for scraping)
if (areMetricsAvailable()) {
  app.get("/metrics", {
    schema: {
      hide: true, // Hide from Swagger docs
    }
  }, async (_request, reply) => {
    const metrics = await getMetrics();
    reply.type('text/plain; version=0.0.4; charset=utf-8').send(metrics);
  });
}

await app.register(authRoutes, { prefix: "/api" });
await app.register(mfaRoutes, { prefix: "/api" });
await app.register(coreRoutes, { prefix: "/api" });
await app.register(requirementsRoutes, { prefix: "/api" });
await app.register(documentRoutes, { prefix: "/api" });
await app.register(markdownRoutes, { prefix: "/api" });
await app.register(thumbnailRoutes, { prefix: "/api" });
await app.register(architectureRoutes, { prefix: "/api" });
await app.register(traceRoutes, { prefix: "/api" });
await app.register(linksetRoutes, { prefix: "/api" });
await app.register(draftRoutes, { prefix: "/api" });
await app.register(airgenRoutes, { prefix: "/api" });
await app.register(nlQueryRoutes, { prefix: "/api" });
await app.register(graphRoutes, { prefix: "/api" });
await app.register(workersRoutes, { prefix: "/api" });

if (config.features.adminRoutesEnabled) {
  const adminRoutes = await import("./routes/admin-users.js");
  await app.register(adminRoutes.default, { prefix: "/api/dev" });
  await app.register(adminRequirementsRoutes, { prefix: "/api" });
  await app.register(adminRecoveryRoutes, { prefix: "/api" });
  await app.register(projectBackupRoutes, { prefix: "/api" });
}

const port = config.port;

// Initialize logger with Fastify's logger
logger.setFastifyLogger(app.log);

app.listen({ port, host: config.host }).catch((e) => {
  logger.error({ err: e }, 'Failed to start server');
  process.exit(1);
});
