/**
 * CLI configuration — loads from env vars or ~/.airgenrc JSON file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CliConfig {
  apiUrl: string;
  email: string;
  password: string;
}

interface RcFile {
  apiUrl?: string;
  email?: string;
  password?: string;
}

function loadRcFile(): RcFile {
  try {
    const raw = readFileSync(join(homedir(), ".airgenrc"), "utf-8");
    return JSON.parse(raw) as RcFile;
  } catch {
    return {};
  }
}

export function loadConfig(): CliConfig {
  const rc = loadRcFile();

  const apiUrl = process.env.AIRGEN_API_URL ?? rc.apiUrl;
  const email = process.env.AIRGEN_EMAIL ?? rc.email;
  const password = process.env.AIRGEN_PASSWORD ?? rc.password;

  if (!apiUrl) {
    console.error("Missing AIRGEN_API_URL. Set it via environment variable or ~/.airgenrc");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("Missing AIRGEN_EMAIL / AIRGEN_PASSWORD. Set via environment or ~/.airgenrc");
    process.exit(1);
  }

  return { apiUrl, email, password };
}
