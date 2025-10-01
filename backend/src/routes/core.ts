import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement, AMBIGUOUS } from "@airgen/req-qa";
import { config } from "../config.js";
import {
  RequirementPattern,
  VerificationMethod
} from "../services/workspace.js";
import {
  listTenants,
  listProjects,
  createTenant,
  createProject,
  deleteTenant,
  deleteProject
} from "../services/graph.js";
import { generateDrafts } from "../services/drafts.js";
import { generateLlmDrafts, isLlmConfigured } from "../services/llm.js";
import { getErrorMessage } from "../lib/type-guards.js";
import { getCacheStats } from "../lib/cache.js";
import { areMetricsAvailable } from "../lib/metrics.js";
import { getSentryStatus } from "../lib/sentry.js";

export type DraftBody = {
  need: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  count?: number;
  actor?: string;
  system?: string;
  trigger?: string;
  response?: string;
  constraint?: string;
  useLlm?: boolean;
};

const draftSchema = z.object({
  need: z.string().min(12, "Provide need context (≥12 characters)."),
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

export default async function registerCoreRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", {
    schema: {
      tags: ["core"],
      summary: "Health check endpoint",
      description: "Returns system health status and metrics",
      response: {
        200: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            timestamp: { type: "string" },
            uptime: { type: "number" },
            environment: { type: "string" },
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
        }
      }
    }
  }, async () => {
    const memUsage = process.memoryUsage();

    // Check Neo4j connectivity
    let dbStatus = "unknown";
    try {
      const { getSession } = await import("../services/graph/driver.js");
      const session = getSession();
      await session.run("RETURN 1");
      await session.close();
      dbStatus = "connected";
    } catch (error) {
      dbStatus = "disconnected";
    }

    // Check cache status
    const cacheStats = await getCacheStats();
    const cacheStatus = cacheStats.available ? "connected" : "unavailable";

    // Get Sentry status
    const sentryStatus = getSentryStatus();

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.environment,
      version: "0.1.0",
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(memUsage.external / 1024 / 1024 * 100) / 100
      },
      services: {
        database: dbStatus,
        cache: cacheStatus,
        llm: isLlmConfigured() ? "configured" : "not-configured"
      },
      observability: {
        metrics: areMetricsAvailable(),
        errorTracking: sentryStatus.enabled
      },
      ...(cacheStats.available && cacheStats.info && {
        cacheStats: {
          totalConnections: cacheStats.info.total_connections_received || '0',
          totalCommands: cacheStats.info.total_commands_processed || '0',
          keyspaceHits: cacheStats.info.keyspace_hits || '0',
          keyspaceMisses: cacheStats.info.keyspace_misses || '0'
        }
      })
    };
  });

  app.get("/tenants", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "List all tenants",
      description: "Retrieves all tenants with project counts",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          properties: {
            tenants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  name: { type: "string", nullable: true },
                  createdAt: { type: "string", nullable: true },
                  projectCount: { type: "number" }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    const tenants = await listTenants();
    return { tenants };
  });

  app.get("/tenants/:tenant/projects", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "List projects for a tenant",
      description: "Retrieves all projects for a specific tenant with requirement counts",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            projects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slug: { type: "string" },
                  tenantSlug: { type: "string" },
                  key: { type: "string", nullable: true },
                  createdAt: { type: "string", nullable: true },
                  requirementCount: { type: "number" }
                }
              }
            }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const projects = await listProjects(params.tenant);
    return { projects };
  });

  // Admin-only tenant management endpoints
  app.post("/tenants", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Create a new tenant",
      description: "Creates a new tenant (admin only)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, description: "Tenant slug identifier" },
          name: { type: "string", description: "Display name for tenant" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            tenant: {
              type: "object",
              properties: {
                slug: { type: "string" },
                name: { type: "string", nullable: true },
                createdAt: { type: "string", nullable: true }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const schema = z.object({
      slug: z.string().min(1),
      name: z.string().optional()
    });
    const body = schema.parse(req.body);

    try {
      const tenant = await createTenant(body);
      return { tenant };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.delete("/tenants/:tenant", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Delete a tenant",
      description: "Deletes a tenant and all associated data (admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    const success = await deleteTenant(params.tenant);
    if (!success) {
      return reply.status(404).send({ error: "Tenant not found" });
    }

    return { success: true };
  });

  // Admin-only project management endpoints
  app.post("/tenants/:tenant/projects", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Create a new project",
      description: "Creates a new project within a tenant (admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" }
        }
      },
      body: {
        type: "object",
        required: ["slug"],
        properties: {
          slug: { type: "string", minLength: 1, description: "Project slug identifier" },
          key: { type: "string", description: "Project key (e.g., PROJ)" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            project: {
              type: "object",
              properties: {
                slug: { type: "string" },
                tenantSlug: { type: "string" },
                key: { type: "string", nullable: true },
                createdAt: { type: "string", nullable: true }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    const schema = z.object({
      slug: z.string().min(1),
      key: z.string().optional()
    });
    const body = schema.parse(req.body);

    try {
      const project = await createProject({
        tenantSlug: params.tenant,
        slug: body.slug,
        key: body.key
      });
      return { project };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.delete("/tenants/:tenant/projects/:project", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Delete a project",
      description: "Deletes a project and all associated data (admin only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        },
        403: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.currentUser?.roles.includes('admin')) {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const success = await deleteProject(params.tenant, params.project);
    if (!success) {
      return reply.status(404).send({ error: "Project not found" });
    }

    return { success: true };
  });

  app.post("/qa", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Analyze requirement quality",
      description: "Performs quality analysis on requirement text using @airgen/req-qa",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", minLength: 1, description: "Requirement text to analyze" }
        }
      },
      response: {
        200: {
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
        }
      }
    }
  }, async (req) => {
    const schema = z.object({ text: z.string().min(1) });
    const body = schema.parse(req.body);
    return analyzeRequirement(body.text);
  });

  app.post<{ Body: DraftBody }>("/draft", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Generate requirement drafts",
      description: "Generates requirement drafts using heuristics and optionally LLM",
      security: [{ bearerAuth: [] }],
      body: {
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
      },
      response: {
        200: {
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
        }
      }
    }
  }, async (req) => {
    const body = draftSchema.parse(req.body);
    const heuristicDrafts = generateDrafts(body);
    let llmDrafts: typeof heuristicDrafts = [];
    let llmError: string | undefined;

    if (body.useLlm) {
      if (!isLlmConfigured()) {
        llmError = "LLM provider not configured";
      } else {
        try {
          llmDrafts = await generateLlmDrafts(body);
        } catch (error) {
          llmError = getErrorMessage(error);
          app.log.error({ err: error }, "LLM draft generation failed");
        }
      }
    }

    return {
      items: [...llmDrafts, ...heuristicDrafts],
      meta: {
        heuristics: heuristicDrafts.length,
        llm: {
          requested: Boolean(body.useLlm),
          provided: llmDrafts.length,
          error: llmError
        }
      }
    };
  });

  app.post("/apply-fix", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Apply quality fixes to requirement",
      description: "Applies automatic fixes to improve requirement quality based on QA analysis",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", minLength: 1, description: "Requirement text to fix" }
        }
      },
      response: {
        200: {
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
        }
      }
    }
  }, async (req) => {
    const schema = z.object({ text: z.string().min(1) });
    const { text } = schema.parse(req.body);
    const lower = text.toLowerCase();
    const hits = AMBIGUOUS.filter(word => lower.includes(word));
    let replacement = text;
    const notes: string[] = [];

    if (hits.length) {
      for (const word of hits) {
        const pattern = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
        replacement = replacement.replace(pattern, `${word.toUpperCase()} [DEFINE]`);
        notes.push(`Flagged ambiguous phrase '${word}'.`);
      }
    }

    if (!/\bshall\b/i.test(replacement)) {
      replacement = replacement.replace(/\b(will|should|may|can)\b/i, "shall");
      notes.push("Replaced weak modal with 'shall'.");
    }

    if (!/\b(ms|s|kg|m|bar|v|a|hz|%)\b/i.test(replacement)) {
      notes.push("Consider adding measurable units (e.g. ms, bar, %).");
    }

    return { before: text, after: replacement, notes };
  });
}
