import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

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

/**
 * Read secret from Docker secret file or environment variable.
 * Checks /run/secrets/{secretName} first, then falls back to env var.
 * Strips trailing newlines from file contents.
 */
function getSecret(secretName: string, envVarName?: string): string | undefined {
  const secretPath = `/run/secrets/${secretName}`;

  // Try Docker secret file first
  if (existsSync(secretPath)) {
    try {
      const content = readFileSync(secretPath, 'utf8').trim();
      if (content) {
        return content;
      }
    } catch (error) {
      console.warn(`[CONFIG] Failed to read Docker secret ${secretName}:`, error);
    }
  }

  // Fallback to environment variable
  if (envVarName) {
    return process.env[envVarName];
  }

  return undefined;
}

const env = process.env;
const environment = (env.API_ENV ?? env.NODE_ENV ?? "development") as Environment;

// Read secrets from Docker secrets or environment variables
const jwtSecret = getSecret('api_jwt_secret', 'API_JWT_SECRET');
const graphPassword = getSecret('neo4j_password', 'GRAPH_PASSWORD');
const llmApiKey = getSecret('llm_api_key', 'LLM_API_KEY') || getSecret('llm_api_key', 'OPENAI_API_KEY');
const geminiApiKey = getSecret('gemini_api_key', 'GEMINI_API_KEY');
const smtpPassword = getSecret('smtp_password', 'SMTP_PASSWORD');
const postgresPassword = getSecret('postgres_password', 'POSTGRES_PASSWORD');
const resticPassword = getSecret('restic_password', 'RESTIC_PASSWORD');
const awsSecretAccessKey = getSecret('aws_secret_access_key', 'AWS_SECRET_ACCESS_KEY');

// Set LLM_API_KEY in process.env if loaded from secret (for openai.ts to use)
if (llmApiKey && !process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) {
  process.env.LLM_API_KEY = llmApiKey;
}

// Build DATABASE_URL from template or use env var directly
let databaseUrl = env.DATABASE_URL;
if (!databaseUrl && env.DATABASE_URL_TEMPLATE && postgresPassword) {
  databaseUrl = env.DATABASE_URL_TEMPLATE.replace('__PASSWORD__', postgresPassword);
}

// Validate required secrets in production
const requiredSecrets = [
  { name: 'API_JWT_SECRET', value: jwtSecret },
  { name: 'GRAPH_PASSWORD', value: graphPassword }
];

if (environment === "production") {
  const missingSecrets = requiredSecrets
    .filter(({ value }) => !value)
    .map(({ name }) => name);

  if (missingSecrets.length > 0) {
    throw new Error(
      `[SECURITY] Required secrets missing in production: ${missingSecrets.join(", ")}\n` +
      `Ensure Docker secrets are mounted or environment variables are set.`
    );
  }
}

// JWT Secret (required in prod, default in dev)
const resolvedJwtSecret = jwtSecret ?? (environment === "production" ? undefined : "dev_secret_DO_NOT_USE_IN_PROD");

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
  throw new Error(
    "[SECURITY] CORS_ORIGINS must be set in production.\n" +
    "Set the CORS_ORIGINS environment variable to a comma-separated list of allowed origins.\n" +
    "Example: CORS_ORIGINS=\"https://airgen.studio,https://www.airgen.studio\""
  );
}

// Environment-specific cookie names (to prevent cookie conflicts)
const cookiePrefix = environment === "production" ? "" : `${environment}_`;

export const config = {
  host: env.API_HOST ?? "0.0.0.0",
  port: parseNumber(env.API_PORT, 8787),
  jwtSecret: resolvedJwtSecret,
  environment,
  trustProxy: parseBoolean(env.API_TRUST_PROXY, environment === "production"),
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

  // JWT token configuration
  jwt: {
    accessTokenExpiry: '15m',
    refreshTokenMaxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },

  // Database URL (with secret password)
  databaseUrl: databaseUrl,

  // Graph database (Neo4j)
  graph: {
    url: env.GRAPH_URL ?? "bolt://localhost:7687",
    username: env.GRAPH_USERNAME ?? "neo4j",
    password: graphPassword ?? "neo4j",
    database: env.GRAPH_DATABASE ?? "neo4j",
    encrypted: parseBoolean(env.GRAPH_ENCRYPTED, false)
  },

  // LLM configuration
  llm: {
    provider: env.LLM_PROVIDER ?? null,
    apiKey: llmApiKey ?? null,
    baseUrl: env.LLM_BASE_URL ?? null,
    model: env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: parseNumber(env.LLM_TEMPERATURE, 0.2)
  },

  // Imagine visualization configuration
  imagine: {
    geminiApiKey: geminiApiKey ?? null,
    model: env.IMAGINE_MODEL ?? "gemini-2.5-flash-image",
    aspectRatio: env.IMAGINE_ASPECT_RATIO ?? "16:9"
  },

  // Email configuration (for verification, password reset)
  email: {
    from: env.EMAIL_FROM ?? `noreply@${environment === "production" ? "example.com" : "localhost"}`,
    smtpHost: env.SMTP_HOST,
    smtpPort: parseNumber(env.SMTP_PORT, 587),
    smtpSecure: parseBoolean(env.SMTP_SECURE, false),
    smtpUser: env.SMTP_USER,
    smtpPassword: smtpPassword,
    enabled: Boolean(env.SMTP_HOST && env.SMTP_USER && smtpPassword),
    systemBcc: env.EMAIL_SYSTEM_BCC === "" ? null : (env.EMAIL_SYSTEM_BCC ?? "info@airgen.studio")
  },

  // Backup configuration (with secrets)
  backup: {
    resticPassword: resticPassword,
    awsSecretAccessKey: awsSecretAccessKey
  },

  // Rate limiting configuration
  rateLimit: {
    global: {
      max: parseNumber(env.RATE_LIMIT_GLOBAL_MAX, environment === "production" ? 1000 : 2000),
      timeWindow: parseNumber(env.RATE_LIMIT_GLOBAL_WINDOW, 60000) // 1 minute
    },
    auth: {
      max: parseNumber(env.RATE_LIMIT_AUTH_MAX, environment === "production" ? 5 : 20),
      timeWindow: parseNumber(env.RATE_LIMIT_AUTH_WINDOW, 300000) // 5 minutes
    },
    llm: {
      max: parseNumber(env.RATE_LIMIT_LLM_MAX, environment === "production" ? 20 : 100),
      timeWindow: parseNumber(env.RATE_LIMIT_LLM_WINDOW, 3600000) // 1 hour
    }
  },

  // 2FA configuration
  twoFactor: {
    // Encryption key for TOTP secrets at rest
    encryptionKey: env.TWOFA_ENCRYPTION_KEY ?? resolvedJwtSecret,
    issuer: env.TWOFA_ISSUER ?? "AIRGen"
  },

  // Feature flags
  features: {
    adminRoutesEnabled: parseBoolean(env.ENABLE_ADMIN_ROUTES, true)

    // ARCHIVED: SnapDraft feature flags (2025-10-22)
    // Replaced by Imagine visualization feature
    // snapdraft: {
    //   semanticFilteringEnabled: parseBoolean(env.SNAPDRAFT_ENABLE_SEMANTIC_FILTERING, false),
    //   factExtractionEnabled: parseBoolean(env.SNAPDRAFT_ENABLE_FACT_EXTRACTION, false),
    //   semanticSimilarityThreshold: parseNumber(env.SNAPDRAFT_SEMANTIC_SIMILARITY_THRESHOLD, 0.7),
    //   semanticResultLimit: parseNumber(env.SNAPDRAFT_SEMANTIC_RESULT_LIMIT, 10)
    // }
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
  console.log(`[CONFIG] Trust Proxy: ${config.trustProxy ? "enabled" : "disabled"}`);
}
