/**
 * OpenAPI schemas for core API endpoints
 *
 * Extracted from routes/core.ts for better maintainability
 */

export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" }
  }
} as const;

// ====================
// Health Check Schemas
// ====================

export const healthzResponseSchema = {
  type: "object",
  properties: {
    status: { type: "string" }
  }
} as const;

export const readyzResponseSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    checks: { type: "object" }
  }
} as const;

export const healthResponseSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    timestamp: { type: "string" },
    time: { type: "string" },
    uptime: { type: "number" },
    environment: { type: "string" },
    env: { type: "string" },
    workspace: { type: "string" },
    version: { type: "string" },
    memory: {
      type: "object",
      properties: {
        heapUsedMB: { type: "number" },
        heapTotalMB: { type: "number" },
        rssMB: { type: "number" },
        externalMB: { type: "number" }
      }
    },
    services: {
      type: "object",
      properties: {
        database: { type: "string" },
        cache: { type: "string" },
        llm: { type: "string" }
      }
    },
    observability: {
      type: "object",
      properties: {
        metrics: { type: "boolean" },
        errorTracking: { type: "boolean" }
      }
    }
  }
} as const;

// ====================
// Tenant Schemas
// ====================

export const tenantSchema = {
  type: "object",
  properties: {
    slug: { type: "string" },
    name: { type: "string", nullable: true },
    createdAt: { type: "string", nullable: true },
    projectCount: { type: "number" },
    isOwner: { type: "boolean" }
  }
} as const;

export const listTenantsResponseSchema = {
  type: "object",
  properties: {
    tenants: {
      type: "array",
      items: tenantSchema
    }
  }
} as const;

export const createTenantRequestSchema = {
  type: "object",
  required: ["slug"],
  properties: {
    slug: { type: "string", minLength: 1, description: "Tenant slug identifier" },
    name: { type: "string", description: "Display name for tenant" }
  }
} as const;

export const createTenantResponseSchema = {
  type: "object",
  properties: {
    tenant: tenantSchema
  }
} as const;

export const deleteTenantResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" }
  }
} as const;

// ====================
// Project Schemas
// ====================

export const projectSchema = {
  type: "object",
  properties: {
    slug: { type: "string" },
    tenantSlug: { type: "string" },
    key: { type: "string", nullable: true },
    createdAt: { type: "string", nullable: true },
    requirementCount: { type: "number" }
  }
} as const;

export const listProjectsResponseSchema = {
  type: "object",
  properties: {
    projects: {
      type: "array",
      items: projectSchema
    }
  }
} as const;

export const createProjectRequestSchema = {
  type: "object",
  required: ["slug"],
  properties: {
    slug: { type: "string", minLength: 1, description: "Project slug identifier" },
    key: { type: "string", description: "Project key (e.g., PROJ)" }
  }
} as const;

export const createProjectResponseSchema = {
  type: "object",
  properties: {
    project: projectSchema
  }
} as const;

export const deleteProjectResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" }
  }
} as const;

// ====================
// Invitation Schemas
// ====================

export const invitationSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    tenantSlug: { type: "string" },
    email: { type: "string" },
    invitedBy: { type: "string" },
    invitedByEmail: { type: "string", nullable: true },
    status: { type: "string" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    acceptedAt: { type: "string", nullable: true },
    cancelledAt: { type: "string", nullable: true }
  }
} as const;

export const listInvitationsResponseSchema = {
  type: "object",
  properties: {
    invitations: {
      type: "array",
      items: invitationSchema
    }
  }
} as const;

export const createInvitationRequestSchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", format: "email", description: "Email address to invite" }
  }
} as const;

export const createInvitationResponseSchema = {
  type: "object",
  properties: {
    invitation: invitationSchema
  }
} as const;

// ====================
// Quality Analysis Schemas
// ====================

export const qaAnalysisRequestSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1, description: "Requirement text to analyze" }
  }
} as const;

export const qaAnalysisResponseSchema = {
  type: "object",
  properties: {
    quality: { type: "string", description: "Quality rating" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          message: { type: "string" },
          severity: { type: "string" }
        }
      }
    }
  }
} as const;

// ====================
// Draft Generation Schemas
// ====================

export const draftGenerationRequestSchema = {
  type: "object",
  required: ["need"],
  properties: {
    need: { type: "string", minLength: 12, description: "Need context (≥12 characters)" },
    pattern: {
      type: "string",
      enum: ["ubiquitous", "event", "state", "unwanted", "optional"],
      description: "Requirement pattern"
    },
    verification: {
      type: "string",
      enum: ["Test", "Analysis", "Inspection", "Demonstration"],
      description: "Verification method"
    },
    count: { type: "integer", minimum: 1, maximum: 20, description: "Number of drafts to generate" },
    actor: { type: "string", minLength: 1, description: "Actor for event pattern" },
    system: { type: "string", minLength: 1, description: "System for event pattern" },
    trigger: { type: "string", minLength: 1, description: "Trigger for event pattern" },
    response: { type: "string", minLength: 1, description: "Response for event pattern" },
    constraint: { type: "string", minLength: 1, description: "Constraint for event pattern" },
    useLlm: { type: "boolean", description: "Use LLM for draft generation" }
  }
} as const;

export const draftGenerationResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          source: { type: "string" }
        }
      }
    },
    meta: {
      type: "object",
      properties: {
        heuristics: { type: "number" },
        llm: {
          type: "object",
          properties: {
            requested: { type: "boolean" },
            provided: { type: "number" },
            error: { type: "string", nullable: true }
          }
        }
      }
    }
  }
} as const;

// ====================
// Apply Fix Schemas
// ====================

export const applyFixRequestSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1, description: "Requirement text to fix" }
  }
} as const;

export const applyFixResponseSchema = {
  type: "object",
  properties: {
    before: { type: "string", description: "Original text" },
    after: { type: "string", description: "Fixed text" },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "List of changes made"
    }
  }
} as const;

// ====================
// Common Parameter Schemas
// ====================

export const tenantParamSchema = {
  type: "object",
  required: ["tenant"],
  properties: {
    tenant: { type: "string", description: "Tenant slug" }
  }
} as const;

export const projectParamSchema = {
  type: "object",
  required: ["tenant", "project"],
  properties: {
    tenant: { type: "string", description: "Tenant slug" },
    project: { type: "string", description: "Project slug" }
  }
} as const;
