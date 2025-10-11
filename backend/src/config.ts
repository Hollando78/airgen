import { resolve } from "path";

type Environment = "development" | "staging" | "production" | "test";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === "true" || value === "1";
}

/**
 * Parse comma-separated list from environment variable
 */
function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map(s => s.trim()).filter(Boolean);
}

const env = process.env;
const environment = (env.API_ENV ?? env.NODE_ENV ?? "development") as Environment;

// Validate required secrets in production
const requiredProductionSecrets = [
  "API_JWT_SECRET",
  "GRAPH_PASSWORD"
];

if (environment === "production") {
  const missingSecrets = requiredProductionSecrets.filter(key => !env[key]);
  if (missingSecrets.length > 0) {
    throw new Error(
      `[SECURITY] Required secrets missing in production: ${missingSecrets.join(", ")}\n` +
      `Set these environment variables before starting the server.`
    );
  }
}

// JWT Secret (required in prod, default in dev)
const resolvedJwtSecret = env.API_JWT_SECRET ?? (environment === "production" ? undefined : "dev_secret_DO_NOT_USE_IN_PROD");

if (!resolvedJwtSecret) {
  throw new Error("API_JWT_SECRET must be configured when running in production.");
}

// App URL (for email links, etc.)
const resolvedAppUrl = env.APP_URL ?? (environment === "production" ? undefined : "http://localhost:5173");
if (environment === "production" && !resolvedAppUrl) {
  console.warn("[WARNING] APP_URL not set in production. Email links may not work correctly.");
}

// API URL (for CORS, frontend API calls)
const resolvedApiUrl = env.API_URL ?? (environment === "production" ? undefined : "http://localhost:8787");

// CORS Origins (comma-separated list)
const corsOrigins = parseList(
  env.CORS_ORIGINS,
  environment === "production" ? [] : ["http://localhost:5173", "http://localhost:3000"]
);

if (environment === "production" && corsOrigins.length === 0) {
  console.warn("[WARNING] CORS_ORIGINS not set in production. API will reject cross-origin requests.");
}

// Environment-specific cookie names (to prevent cookie conflicts)
const cookiePrefix = environment === "production" ? "" : `${environment}_`;

export const config = {
  host: env.API_HOST ?? "0.0.0.0",
  port: parseNumber(env.API_PORT, 8787),
  jwtSecret: resolvedJwtSecret,
  environment,
  appUrl: resolvedAppUrl ?? "http://localhost:5173",
  apiUrl: resolvedApiUrl ?? "http://localhost:8787",
  corsOrigins,
  workspaceRoot: resolve(env.WORKSPACE_ROOT ?? "./workspace"),
  defaultTenant: env.API_DEFAULT_TENANT ?? "default",
  draftsCacheTtlSeconds: parseNumber(env.AI_DRAFT_CACHE_TTL, 900),
  draftsPerRequestLimit: parseNumber(env.AI_DRAFT_LIMIT, 5),

  // Cookie configuration
  cookies: {
    refreshTokenName: `${cookiePrefix}refreshToken`,
    prefix: cookiePrefix
  },

  // Graph database (Neo4j)
  graph: {
    url: env.GRAPH_URL ?? "bolt://localhost:7687",
    username: env.GRAPH_USERNAME ?? "neo4j",
    password: env.GRAPH_PASSWORD ?? "neo4j",
    database: env.GRAPH_DATABASE ?? "neo4j",
    encrypted: parseBoolean(env.GRAPH_ENCRYPTED, false)
  },

  // LLM configuration
  llm: {
    provider: env.LLM_PROVIDER ?? null,
    apiKey: env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? null,
    baseUrl: env.LLM_BASE_URL ?? null,
    model: env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: parseNumber(env.LLM_TEMPERATURE, 0.2)
  },

  // Email configuration (for verification, password reset)
  email: {
    from: env.EMAIL_FROM ?? `noreply@${environment === "production" ? "example.com" : "localhost"}`,
    smtpHost: env.SMTP_HOST,
    smtpPort: parseNumber(env.SMTP_PORT, 587),
    smtpSecure: parseBoolean(env.SMTP_SECURE, false),
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    enabled: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD)
  },

  // Rate limiting configuration
  rateLimit: {
    global: {
      max: parseNumber(env.RATE_LIMIT_GLOBAL_MAX, environment === "production" ? 100 : 500),
      timeWindow: parseNumber(env.RATE_LIMIT_GLOBAL_WINDOW, 60000) // 1 minute
    },
    auth: {
      max: parseNumber(env.RATE_LIMIT_AUTH_MAX, environment === "production" ? 5 : 20),
      timeWindow: parseNumber(env.RATE_LIMIT_AUTH_WINDOW, 300000) // 5 minutes
    }
  },

  // 2FA configuration
  twoFactor: {
    // Encryption key for TOTP secrets at rest
    encryptionKey: env.TWOFA_ENCRYPTION_KEY ?? resolvedJwtSecret,
    issuer: env.TWOFA_ISSUER ?? "AIRGen"
  }
} as const;

export type AppConfig = typeof config;

// Log configuration summary on startup (without sensitive data)
if (environment !== "test") {
  console.log(`[CONFIG] Environment: ${environment}`);
  console.log(`[CONFIG] Host: ${config.host}:${config.port}`);
  console.log(`[CONFIG] App URL: ${config.appUrl}`);
  console.log(`[CONFIG] CORS Origins: ${corsOrigins.length > 0 ? corsOrigins.join(", ") : "none (allow all)"}`);
  console.log(`[CONFIG] Email: ${config.email.enabled ? "enabled" : "disabled (console mode)"}`);
  console.log(`[CONFIG] Graph: ${config.graph.url}`);
  console.log(`[CONFIG] Cookie Prefix: ${cookiePrefix || "(none)"}`);
}
