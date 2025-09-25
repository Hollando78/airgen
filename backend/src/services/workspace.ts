import { promises as fs } from "fs";
import { dirname, join } from "path";
import { config } from "../config.js";

export type RequirementPattern = "ubiquitous" | "event" | "state" | "unwanted" | "optional";
export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";

export type RequirementRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
};

export type BaselineRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  createdAt: string;
  author?: string | null;
  label?: string | null;
  requirementRefs: string[];
};

export type TenantRecord = {
  slug: string;
  name: string | null;
  createdAt: string | null;
  projectCount: number;
};

export type ProjectRecord = {
  slug: string;
  tenantSlug: string;
  key: string | null;
  createdAt: string | null;
  requirementCount: number;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function requirementMarkdown(record: RequirementRecord): string {
  const metadata = {
    id: record.id,
    ref: record.ref,
    title: record.title,
    tenant: record.tenant,
    project: record.projectKey,
    pattern: record.pattern ?? null,
    verification: record.verification ?? null,
    qa: record.qaScore !== undefined && record.qaScore !== null
      ? {
          score: record.qaScore,
          verdict: record.qaVerdict ?? null,
          suggestions: record.suggestions ?? []
        }
      : null,
    tags: record.tags ?? [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  const yaml = Object.entries(metadata)
    .map(([key, value]) => {
      if (value === null || value === undefined) return `${key}: null`;
      if (Array.isArray(value)) {
        if (value.length === 0) return `${key}: []`;
        const items = value.map(item => `  - ${item}`).join("\n");
        return `${key}:\n${items}`;
      }
      if (typeof value === "object") {
        const nested = Object.entries(value)
          .map(([nestedKey, nestedValue]) => {
            if (nestedValue === null || nestedValue === undefined) return `  ${nestedKey}: null`;
            if (Array.isArray(nestedValue)) {
              if (nestedValue.length === 0) return `  ${nestedKey}: []`;
              const nestedItems = nestedValue.map(item => `    - ${item}`).join("\n");
              return `  ${nestedKey}:\n${nestedItems}`;
            }
            return `  ${nestedKey}: ${nestedValue}`;
          })
          .join("\n");
        return `${key}:\n${nested}`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");

  return `---\n${yaml}\n---\n\n${record.text}\n`;
}

function requirementFile(record: { tenant: string; projectKey: string; ref: string }): string {
  return join(config.workspaceRoot, record.tenant, record.projectKey, "requirements", `${record.ref}.md`);
}

export async function writeRequirementMarkdown(record: RequirementRecord): Promise<void> {
  const file = requirementFile(record);
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, requirementMarkdown(record), "utf8");
}

export async function readRequirementMarkdown(record: { tenant: string; projectKey: string; ref: string }): Promise<string> {
  const file = requirementFile(record);
  return fs.readFile(file, "utf8");
}

export async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(config.workspaceRoot, { recursive: true });
}
