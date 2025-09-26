import { resolve } from "path";

type Environment = "development" | "production" | "test";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = process.env;
const environment = (env.API_ENV ?? "development") as Environment;
const resolvedJwtSecret = env.API_JWT_SECRET ?? (environment === "production" ? undefined : "dev_secret");

if (!resolvedJwtSecret) {
  throw new Error("API_JWT_SECRET must be configured when running in production.");
}

export const config = {
  host: env.API_HOST ?? "0.0.0.0",
  port: parseNumber(env.API_PORT, 8787),
  jwtSecret: resolvedJwtSecret,
  environment,
  workspaceRoot: resolve(env.WORKSPACE_ROOT ?? "./workspace"),
  defaultTenant: env.API_DEFAULT_TENANT ?? "default",
  draftsCacheTtlSeconds: parseNumber(env.AI_DRAFT_CACHE_TTL, 900),
  draftsPerRequestLimit: parseNumber(env.AI_DRAFT_LIMIT, 5),
  graph: {
    url: env.GRAPH_URL ?? "bolt://localhost:7687",
    username: env.GRAPH_USERNAME ?? "neo4j",
    password: env.GRAPH_PASSWORD ?? "neo4j",
    database: env.GRAPH_DATABASE ?? "neo4j",
    encrypted: env.GRAPH_ENCRYPTED === "true" || env.GRAPH_ENCRYPTED === "1"
  },
  llm: {
    provider: env.LLM_PROVIDER ?? null,
    apiKey: env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? null,
    baseUrl: env.LLM_BASE_URL ?? null,
    model: env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: parseNumber(env.LLM_TEMPERATURE, 0.2)
  }
} as const;

export type AppConfig = typeof config;
