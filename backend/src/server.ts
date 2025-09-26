import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
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
import authRoutes from "./routes/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

await ensureWorkspace();
await initGraph();

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(fastifyStatic, {
  root: join(__dirname, "../public"),
  prefix: "/"
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
