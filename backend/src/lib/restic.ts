import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RESTIC_ENV_KEYS = [
  "RESTIC_REPOSITORY",
  "RESTIC_PASSWORD",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_DEFAULT_REGION",
  "AWS_ENDPOINT",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "..");
const repoRoot = resolve(backendRoot, "..");

function mergeResticEnv(
  baseEnv: NodeJS.ProcessEnv,
  source: Record<string, string>
): NodeJS.ProcessEnv {
  const merged = { ...baseEnv };
  for (const key of RESTIC_ENV_KEYS) {
    if (!merged[key] && source[key]) {
      merged[key] = source[key];
    }
  }
  return merged;
}

async function readEnvFile(envFile: string): Promise<Record<string, string>> {
  const contents = await readFile(envFile, "utf-8");
  const result: Record<string, string> = {};

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match =
      line.match(
        /^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))\s*$/
      );
    if (!match) continue;

    const [, key, doubleQuoted, singleQuoted, bare] = match;
    const value = doubleQuoted ?? singleQuoted ?? bare ?? "";
    result[key] = value;
  }

  return result;
}

async function readSecretFile(path: string): Promise<string | undefined> {
  try {
    if (!existsSync(path)) {
      return undefined;
    }
    const value = await readFile(path, "utf-8");
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export interface ResticEnvResult {
  env: NodeJS.ProcessEnv;
  configured: boolean;
}

function getCandidateEnvFiles(): string[] {
  const runtimeEnv = (process.env.API_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();

  const candidates: Array<string | null> = [
    resolve(backendRoot, `.env.${runtimeEnv}.local`),
    resolve(backendRoot, `.env.${runtimeEnv}`),
    runtimeEnv === "test" ? null : resolve(backendRoot, ".env.local"),
    resolve(backendRoot, ".env"),
    resolve(repoRoot, `.env.${runtimeEnv}.local`),
    resolve(repoRoot, `.env.${runtimeEnv}`),
    runtimeEnv === "test" ? null : resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env"),
    resolve(repoRoot, `env/${runtimeEnv}.env`),
    "/etc/environment"
  ];

  return candidates.filter((file): file is string => {
    if (!file) {
      return false;
    }
    return existsSync(file);
  });
}

/**
 * Resolve environment variables required for restic commands.
 * Attempts to read values from the current process environment,
 * falling back to /etc/environment (or a custom file) when needed.
 */
export async function resolveResticEnv(
  envFile: string = "/etc/environment"
): Promise<ResticEnvResult> {
  const baseEnv = { ...process.env } as NodeJS.ProcessEnv;
  const hasProcessEnv =
    Boolean(baseEnv.RESTIC_REPOSITORY) && Boolean(baseEnv.RESTIC_PASSWORD);
  if (hasProcessEnv) {
    return { env: baseEnv, configured: true };
  }

  const candidateFiles = [envFile, ...getCandidateEnvFiles()];
  let mergedEnv = { ...baseEnv };
  let configured = false;

  for (const candidate of candidateFiles) {
    if (!candidate || !existsSync(candidate)) {
      continue;
    }

    try {
      const fileEnv = await readEnvFile(candidate);
      mergedEnv = mergeResticEnv(mergedEnv, fileEnv);
      if (mergedEnv.RESTIC_REPOSITORY && mergedEnv.RESTIC_PASSWORD) {
        configured = true;
        break;
      }
    } catch {
      // Ignore parse errors and continue to next file
    }
  }

  const secretMappings: Array<{ key: keyof NodeJS.ProcessEnv; path: string }> = [
    { key: "RESTIC_PASSWORD", path: "/run/secrets/restic_password" },
    { key: "AWS_SECRET_ACCESS_KEY", path: "/run/secrets/aws_secret_access_key" },
  ];

  for (const secret of secretMappings) {
    if (!mergedEnv[secret.key]) {
      const value = await readSecretFile(secret.path);
      if (value) {
        mergedEnv[secret.key] = value;
      }
    }
  }

  if (mergedEnv.RESTIC_REPOSITORY && mergedEnv.RESTIC_PASSWORD) {
    configured = true;
  }

  return { env: mergedEnv, configured };
}
