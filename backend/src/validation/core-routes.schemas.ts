import { z } from "zod";
import { config } from "../config.js";

/**
 * Validation schemas for core route endpoints
 *
 * Extracted from routes/core.ts for reusability and clarity
 */

// ====================
// Tenant Schemas
// ====================

export const tenantParamSchema = z.object({
  tenant: z.string().min(1, "Tenant slug is required")
});

export const createTenantSchema = z.object({
  slug: z.string().min(1, "Tenant slug is required"),
  name: z.string().optional()
});

// ====================
// Project Schemas
// ====================

export const projectParamSchema = z.object({
  tenant: z.string().min(1, "Tenant slug is required"),
  project: z.string().min(1, "Project slug is required")
});

export const createProjectSchema = z.object({
  slug: z.string().min(1, "Project slug is required"),
  key: z.string().optional()
});

// ====================
// Invitation Schemas
// ====================

export const createInvitationSchema = z.object({
  email: z.string().email("Valid email address is required")
});

// ====================
// Quality Analysis Schemas
// ====================

export const qaAnalysisSchema = z.object({
  text: z.string().min(1, "Requirement text is required")
});

export const draftGenerationSchema = z.object({
  need: z.string().min(12, "Provide need context (≥12 characters)"),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  count: z.number().int().min(1).max(config.draftsPerRequestLimit).optional(),
  actor: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  response: z.string().min(1).optional(),
  constraint: z.string().min(1).optional(),
  useLlm: z.boolean().optional()
});

export const applyFixSchema = z.object({
  text: z.string().min(1, "Requirement text is required")
});
