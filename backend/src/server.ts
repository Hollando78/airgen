import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { ensureWorkspace } from "./services/workspace.js";
import { initGraph, closeGraph } from "./services/graph.js";
import { registerAuth } from "./plugins/auth.js";
import draftRoutes from "./routes/draft.js";
import airgenRoutes from "./routes/airgen.js";
import coreRoutes from "./routes/core.js";
import requirementsRoutes from "./routes/requirements-api.js";
import documentRoutes from "./routes/documents.js";
import architectureRoutes from "./routes/architecture.js";
import traceRoutes from "./routes/trace.js";
import { linksetRoutes } from "./routes/linksets.js";
import authRoutes from "./routes/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

await ensureWorkspace();
await initGraph();

const app = Fastify({
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
            "content-type": request.headers["content-type"]
          }
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode
        };
      },
      err(error) {
        return {
          type: error.constructor.name,
          message: error.message,
          stack: config.environment === "production" ? undefined : error.stack,
          code: (error as any).code,
          statusCode: (error as any).statusCode
        };
      }
    },
    ...(config.environment === "production" && {
      // Production: JSON logging for aggregation
      transport: undefined
    }),
    ...( config.environment === "development" && {
      // Development: Pretty printing
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname"
        }
      }
    })
  }
});

await app.register(cors, { origin: true });
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

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
      { name: "auth", description: "Authentication endpoints" },
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

app.addHook("onRequest", app.optionalAuthenticate);

app.addHook("onClose", async () => {
  await closeGraph();
});

await app.register(authRoutes, { prefix: "/api" });
await app.register(coreRoutes, { prefix: "/api" });
await app.register(requirementsRoutes, { prefix: "/api" });
await app.register(documentRoutes, { prefix: "/api" });
await app.register(architectureRoutes, { prefix: "/api" });
await app.register(traceRoutes, { prefix: "/api" });
await app.register(linksetRoutes, { prefix: "/api" });
await app.register(draftRoutes, { prefix: "/api" });
await app.register(airgenRoutes, { prefix: "/api" });

if (config.environment !== "production") {
  const adminRoutes = await import("./routes/admin-users.js");
  await app.register(adminRoutes.default, { prefix: "/api/dev" });
}

const port = config.port;
app.listen({ port, host: config.host }).catch((e) => {
  (app.log as any).error?.(e);
  process.exit(1);
});
