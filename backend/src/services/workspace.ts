import { promises as fs } from "fs";
import { dirname, join } from "path";
import { config } from "../config.js";

export type RequirementPattern = "ubiquitous" | "event" | "state" | "unwanted" | "optional";
export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";

export type RequirementRecord = {
  id: string;
  hashId: string;
  ref: string;
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: string;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  path: string;
  documentSlug?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  archived?: boolean;
  // Data integrity fields
  contentHash?: string; // SHA-256 hash of requirement content
  deletedAt?: string; // ISO timestamp when deleted
  deletedBy?: string; // User who deleted it
  restoredAt?: string; // ISO timestamp when restored from deletion
  // Version tracking fields
  createdBy?: string; // User who created the requirement
  updatedBy?: string; // User who last updated the requirement
  versionNumber?: number; // Current version number
};

export type RequirementVersionRecord = {
  versionId: string;
  requirementId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "archived" | "restored" | "deleted";
  changeDescription?: string;
  // Snapshot of requirement state at this version
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: string;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  contentHash: string;
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
  // Version snapshot counts
  requirementVersionCount?: number;
  documentVersionCount?: number;
  documentSectionVersionCount?: number;
  infoVersionCount?: number;
  surrogateVersionCount?: number;
  traceLinkVersionCount?: number;
  linksetVersionCount?: number;
  diagramVersionCount?: number;
  blockVersionCount?: number;
  connectorVersionCount?: number;
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

export function requirementMarkdown(record: RequirementRecord): string {
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
      if (value === null || value === undefined) {return `${key}: null`;}
      if (Array.isArray(value)) {
        if (value.length === 0) {return `${key}: []`;}
        const items = value.map(item => `  - ${item}`).join("\n");
        return `${key}:\n${items}`;
      }
      if (typeof value === "object") {
        const nested = Object.entries(value)
          .map(([nestedKey, nestedValue]) => {
            if (nestedValue === null || nestedValue === undefined) {return `  ${nestedKey}: null`;}
            if (Array.isArray(nestedValue)) {
              if (nestedValue.length === 0) {return `  ${nestedKey}: []`;}
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

export function requirementFile(record: { tenant: string; projectKey: string; ref: string }): string {
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

// Info markdown handling
export type InfoRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export function infoMarkdown(record: InfoRecord): string {
  const metadata = {
    id: record.id,
    ref: record.ref,
    title: record.title ?? null,
    tenant: record.tenant,
    project: record.projectKey,
    document: record.documentSlug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  const yaml = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value === null ? 'null' : value}`)
    .join("\n");

  return `---\n${yaml}\n---\n\n${record.text}\n`;
}

export function infoFile(record: { tenant: string; projectKey: string; ref: string }): string {
  return join(config.workspaceRoot, record.tenant, record.projectKey, "infos", `${record.ref}.md`);
}

export async function writeInfoMarkdown(record: InfoRecord): Promise<void> {
  const file = infoFile(record);
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, infoMarkdown(record), "utf8");
}

// Surrogate markdown handling
export type SurrogateReferenceRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  slug: string;
  caption?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export function surrogateMarkdown(record: SurrogateReferenceRecord): string {
  const metadata = {
    id: record.id,
    slug: record.slug,
    caption: record.caption ?? null,
    tenant: record.tenant,
    project: record.projectKey,
    document: record.documentSlug,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };

  const yaml = Object.entries(metadata)
    .map(([key, value]) => `${key}: ${value === null ? 'null' : value}`)
    .join("\n");

  return `---\n${yaml}\n---\n\nSurrogate reference: ${record.slug}\n${record.caption ? `Caption: ${record.caption}` : ''}\n`;
}

export function surrogateFile(record: { tenant: string; projectKey: string; slug: string }): string {
  return join(config.workspaceRoot, record.tenant, record.projectKey, "surrogates", `${record.slug}.md`);
}

export async function writeSurrogateMarkdown(record: SurrogateReferenceRecord): Promise<void> {
  const file = surrogateFile(record);
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, surrogateMarkdown(record), "utf8");
}
