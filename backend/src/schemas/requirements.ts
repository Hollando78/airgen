/**
 * Requirements Validation and OpenAPI Schemas
 *
 * Centralized schemas for:
 * - Zod validation
 * - OpenAPI documentation
 * - Type definitions
 */

import { z } from "zod";

// ============================================================================
// Zod Validation Schemas
// ============================================================================

/**
 * Requirement creation/update schema
 */
export const requirementSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  text: z.string().min(10),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  rationale: z.string().optional(),
  complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
  complianceRationale: z.string().optional(),
  qaScore: z.number().int().min(0).max(100).optional(),
  qaVerdict: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

/**
 * Baseline creation schema
 */
export const baselineSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  label: z.string().min(1).optional(),
  author: z.string().min(1).optional()
});

/**
 * Tenant and project params schema
 */
export const tenantProjectParamsSchema = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1)
});

/**
 * Requirement ID params schema
 */
export const requirementIdParamsSchema = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  requirementId: z.string().min(1)
});

/**
 * Requirement ref params schema
 */
export const requirementRefParamsSchema = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1),
  ref: z.string().min(1)
});

/**
 * Requirement update body schema
 */
export const requirementUpdateSchema = z.object({
  text: z.string().min(10).optional(),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  rationale: z.string().optional(),
  complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
  complianceRationale: z.string().optional(),
  sectionId: z.string().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

/**
 * Archive/unarchive body schema
 */
export const requirementIdsSchema = z.object({
  requirementIds: z.array(z.string().min(1)).min(1)
});

// ============================================================================
// OpenAPI Schemas (for Fastify route definitions)
// ============================================================================

/**
 * Requirement creation body schema (OpenAPI)
 */
export const requirementBodySchema = {
  type: "object" as const,
  required: ["tenant", "projectKey", "text"],
  properties: {
    tenant: { type: "string" as const, minLength: 1, description: "Tenant slug" },
    projectKey: { type: "string" as const, minLength: 1, description: "Project key" },
    documentSlug: { type: "string" as const, minLength: 1, description: "Document slug" },
    sectionId: { type: "string" as const, minLength: 1, description: "Section identifier" },
    text: { type: "string" as const, minLength: 10, description: "Requirement text" },
    pattern: {
      type: "string" as const,
      enum: ["ubiquitous", "event", "state", "unwanted", "optional"],
      description: "Requirement pattern"
    },
    verification: {
      type: "string" as const,
      enum: ["Test", "Analysis", "Inspection", "Demonstration"],
      description: "Verification method"
    },
    qaScore: { type: "integer" as const, minimum: 0, maximum: 100, description: "Quality score" },
    qaVerdict: { type: "string" as const, description: "Quality verdict" },
    suggestions: { type: "array" as const, items: { type: "string" as const }, description: "QA suggestions" },
    tags: { type: "array" as const, items: { type: "string" as const }, description: "Requirement tags" }
  }
};

/**
 * Requirement update body schema (OpenAPI)
 */
export const requirementUpdateBodySchema = {
  type: "object" as const,
  properties: {
    text: { type: "string" as const, minLength: 10, description: "Requirement text" },
    pattern: {
      type: "string" as const,
      enum: ["ubiquitous", "event", "state", "unwanted", "optional"],
      description: "Requirement pattern"
    },
    verification: {
      type: "string" as const,
      enum: ["Test", "Analysis", "Inspection", "Demonstration"],
      description: "Verification method"
    },
    rationale: { type: "string" as const, description: "Rationale for the requirement" },
    complianceStatus: {
      type: "string" as const,
      enum: ["N/A", "Compliant", "Compliance Risk", "Non-Compliant"],
      description: "Compliance status"
    },
    complianceRationale: { type: "string" as const, description: "Compliance rationale" },
    sectionId: { type: "string" as const, description: "Section ID to move the requirement to" }
  }
};

/**
 * Tenant/project params schema (OpenAPI)
 */
export const tenantProjectParamsOpenApiSchema = {
  type: "object" as const,
  required: ["tenant", "project"],
  properties: {
    tenant: { type: "string" as const, description: "Tenant slug" },
    project: { type: "string" as const, description: "Project slug" }
  }
};

/**
 * Pagination querystring schema (OpenAPI)
 */
export const paginationQuerySchema = {
  type: "object" as const,
  properties: {
    page: { type: "integer" as const, minimum: 1, default: 1, description: "Page number" },
    limit: { type: "integer" as const, minimum: 1, maximum: 100, default: 20, description: "Items per page" },
    sortBy: { type: "string" as const, enum: ["createdAt", "ref", "qaScore"], description: "Field to sort by" },
    sortOrder: { type: "string" as const, enum: ["asc", "desc"], default: "desc", description: "Sort direction" }
  }
};
