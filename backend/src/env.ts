import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "..");
const repoRoot = resolve(backendRoot, "..");

const runtimeEnv = (process.env.API_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();

const candidateFiles = [
  // Backend-scoped files take precedence so the service can run standalone
  resolve(backendRoot, `.env.${runtimeEnv}.local`),
  resolve(backendRoot, `.env.${runtimeEnv}`),
  runtimeEnv === "test" ? null : resolve(backendRoot, ".env.local"),
  resolve(backendRoot, ".env"),
  // Fall back to repository-wide env files so docker compose stacks keep working
  resolve(repoRoot, `.env.${runtimeEnv}.local`),
  resolve(repoRoot, `.env.${runtimeEnv}`),
  runtimeEnv === "test" ? null : resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env"),
  resolve(repoRoot, `env/${runtimeEnv}.env`)
].filter((path): path is string => Boolean(path));

for (const candidate of candidateFiles) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
    break;
  }
}
