/**
 * Workspace Service
 *
 * After Neo4j Single-Source Migration (Phase 4 complete):
 * - This module now provides ONLY type definitions and utility functions
 * - Markdown generation functions have been REMOVED (use export service instead)
 * - Workspace directory is used ONLY for surrogate file storage (uploaded PDFs, images, etc.)
 * - All requirements/infos/surrogates metadata is stored in Neo4j
 *
 * See:
 * - Export service: src/services/export-service.ts
 * - Migration docs: docs/NEO4J-MIGRATION-PHASE-*-COMPLETE.md
 */

import { promises as fs } from "fs";
import { config } from "../config.js";

// ============================================================================
// Type Definitions
// ============================================================================

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
  isOwner?: boolean;
};

export type ProjectRecord = {
  slug: string;
  tenantSlug: string;
  key: string | null;
  name?: string | null;
  description?: string | null;
  code?: string | null;
  createdAt: string | null;
  requirementCount: number;
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a string to a URL-safe slug
 * Used throughout the codebase for generating tenant/project slugs
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

/**
 * Ensure workspace directory exists
 *
 * NOTE: After Phase 4 migration, workspace is used ONLY for surrogate file storage
 * (uploaded PDFs, images, etc.). It is NOT used for requirements/infos markdown.
 *
 * Requirements, infos, and surrogate metadata are stored in Neo4j.
 * Use the export service to generate markdown on-demand.
 */
export async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(config.workspaceRoot, { recursive: true });
}
