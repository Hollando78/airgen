import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement, AMBIGUOUS } from "@airgen/req-qa";
import { config } from "../config.js";
import { requireTenantAccess, type AuthUser, isTenantOwner } from "../lib/authorization.js";
import {
  slugify,
  type RequirementPattern,
  type VerificationMethod
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
import {
  createTenantInvitation,
  listInvitationsForTenant,
  type TenantInvitationRecord
} from "../services/tenant-invitations.js";
import { sendTenantInvitationEmail } from "../lib/email.js";
import { UserRole } from "../types/roles.js";
import { userRepository } from "../repositories/UserRepository.js";
import { PermissionRepository } from "../repositories/PermissionRepository.js";

function mapInvitationResponse(invitation: TenantInvitationRecord) {
  const { token: _token, invitedByEmail, ...rest } = invitation;
  return {
    ...rest,
    invitedByEmail: invitedByEmail ?? null
  };
}

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
  const permissionRepo = new PermissionRepository();
  // Liveness probe - simple check that the server is running
  app.get("/healthz", {
    schema: {
      tags: ["core"],
      summary: "Liveness check",
      description: "Simple liveness check for Kubernetes/Docker health probes",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" }
          }
        }
      }
    }
  }, async () => {
    return { status: "ok" };
  });

  // Readiness probe - checks if the server can handle requests
  app.get("/readyz", {
    schema: {
      tags: ["core"],
      summary: "Readiness check",
      description: "Checks if the server is ready to accept traffic (database connectivity, etc.)",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            checks: { type: "object" }
          }
        },
        503: {
          type: "object",
          properties: {
            status: { type: "string" },
            checks: { type: "object" }
          }
        }
      }
    }
  }, async (_req, reply) => {
    const checks: Record<string, string> = {};
    let isReady = true;

    // Check Neo4j connectivity
    try {
      const { getSession } = await import("../services/graph/driver.js");
      const session = getSession();
      await session.run("RETURN 1");
      await session.close();
      checks.database = "ready";
    } catch (error) {
      checks.database = "not_ready";
      isReady = false;
    }

    if (isReady) {
      return { status: "ready", checks };
    } else {
      reply.status(503);
      return { status: "not_ready", checks };
    }
  });

  // Comprehensive health check endpoint
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
    } catch {
      dbStatus = "disconnected";
    }

    // Check cache status
    const cacheStats = await getCacheStats();
    const cacheStatus = cacheStats.available ? "connected" : "unavailable";

    // Get Sentry status
    const sentryStatus = getSentryStatus();

    const timestamp = new Date().toISOString();

    return {
      ok: true,
      timestamp,
      time: timestamp,  // Alias for frontend compatibility
      uptime: process.uptime(),
      environment: config.environment,
      env: config.environment,  // Alias for frontend compatibility
      workspace: config.workspaceRoot,  // Workspace root path
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
                  projectCount: { type: "number" },
                  isOwner: { type: "boolean" }
                }
              }
            }
          }
        }
      }
    }
  }, async (req) => {
    const user = req.currentUser as AuthUser | undefined;

    if (!user) {
      return { tenants: [] };
    }

    // Track all tenant slugs the user can access
    const tenantAccess = new Set<string>();

    if (user.permissions) {
      if (user.permissions.globalRole === UserRole.SUPER_ADMIN) {
        const tenants = await listTenants();
        const ownedSlugs = new Set<string>();

        for (const slug of user.ownedTenantSlugs ?? []) {
          ownedSlugs.add(slugify(slug));
        }
        for (const [tenantSlug, permission] of Object.entries(user.permissions.tenantPermissions ?? {})) {
          if (permission.isOwner) {
            ownedSlugs.add(slugify(tenantSlug));
          }
        }

        const responseTenants = tenants.map(tenant => ({
          ...tenant,
          isOwner: ownedSlugs.has(tenant.slug) || user.permissions?.globalRole === UserRole.SUPER_ADMIN
        }));

        return { tenants: responseTenants };
      }

      for (const tenantSlug of Object.keys(user.permissions.tenantPermissions ?? {})) {
        tenantAccess.add(slugify(tenantSlug));
      }

      for (const tenantSlug of Object.keys(user.permissions.projectPermissions ?? {})) {
        tenantAccess.add(slugify(tenantSlug));
      }
    }

    for (const slug of user.tenantSlugs ?? []) {
      tenantAccess.add(slugify(slug));
    }
    for (const slug of user.ownedTenantSlugs ?? []) {
      tenantAccess.add(slugify(slug));
    }

    const tenantFilter = tenantAccess.size > 0 ? Array.from(tenantAccess) : null;
    const tenants = tenantFilter ? await listTenants(tenantFilter) : [];

    const ownedSlugs = new Set<string>();
    for (const slug of user.ownedTenantSlugs ?? []) {
      ownedSlugs.add(slugify(slug));
    }
    for (const [tenantSlug, permission] of Object.entries(user.permissions?.tenantPermissions ?? {})) {
      if (permission.isOwner) {
        ownedSlugs.add(slugify(tenantSlug));
      }
    }

    const responseTenants = tenants.map(tenant => ({
      ...tenant,
      isOwner: ownedSlugs.has(tenant.slug)
    }));

    return { tenants: responseTenants };
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
  }, async (req, reply) => {
    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    // Verify user has access to this tenant
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

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
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
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
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const schema = z.object({
      slug: z.string().min(1),
      name: z.string().optional()
    });
    const body = schema.parse(req.body);

    try {
      const tenant = await createTenant(body);

      const creator = await userRepository.findById(user.sub);
      if (!creator) {
        return reply.status(500).send({ error: "Failed to load user" });
      }

      await permissionRepo.grantPermission({
        userId: creator.id,
        scopeType: "tenant",
        scopeId: tenant.slug,
        role: UserRole.TENANT_ADMIN,
        isOwner: true
      });

      return { tenant: { ...tenant, isOwner: true } };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.get("/tenants/:tenant/invitations", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "List tenant invitations",
      description: "Lists invitations issued for a tenant (owner only)",
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
            invitations: {
              type: "array",
              items: {
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
              }
            }
          }
        },
        401: {
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
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can view invitations" });
    }

    const invitations = await listInvitationsForTenant(params.tenant);
    return { invitations: invitations.map(mapInvitationResponse) };
  });

  app.post("/tenants/:tenant/invitations", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Invite user to tenant",
      description: "Send an invitation to join a tenant (owner only)",
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
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", description: "Email address to invite" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            invitation: {
              type: "object",
              properties: {
                id: { type: "string" },
                tenantSlug: { type: "string" },
                email: { type: "string" },
                invitedBy: { type: "string" },
                invitedByEmail: { type: "string", nullable: true },
                status: { type: "string" },
                createdAt: { type: "string" },
                updatedAt: { type: "string" }
              }
            }
          }
        },
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
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
        },
        409: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can send invitations" });
    }

    const bodySchema = z.object({ email: z.string().email() });
    const body = bodySchema.parse(req.body);

    const normalizedTenant = slugify(params.tenant);
    const existingUser = await userRepository.findByEmail(body.email);
    if (existingUser) {
      const permissions = await permissionRepo.getUserPermissions(existingUser.id);
      const tenantPermission = permissions.tenantPermissions?.[normalizedTenant];
      const projectPermissions = permissions.projectPermissions?.[normalizedTenant];
      if (tenantPermission || (projectPermissions && Object.keys(projectPermissions).length > 0)) {
        return reply.status(409).send({ error: "User already has access to this tenant" });
      }
    }

    try {
      const invitation = await createTenantInvitation(normalizedTenant, body.email, user.sub, user.email);
      try {
        await sendTenantInvitationEmail(body.email, normalizedTenant, user.name, invitation.token);
      } catch (emailError) {
        req.log.error({ err: emailError }, "Failed to send tenant invitation email");
      }
      return { invitation: mapInvitationResponse(invitation) };
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.delete("/tenants/:tenant", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Delete a tenant",
      description: "Deletes a tenant and all associated data (owner only)",
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
        401: {
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
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can delete this tenant" });
    }

    const success = await deleteTenant(params.tenant);
    if (!success) {
      return reply.status(404).send({ error: "Tenant not found" });
    }

    await permissionRepo.removeTenantFromAllUsers(params.tenant);
    return { success: true };
  });

  // Tenant project management endpoints
  app.post("/tenants/:tenant/projects", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["core"],
      summary: "Create a new project",
      description: "Creates a new project within a tenant (owner only)",
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
        401: {
          type: "object",
          properties: {
            error: { type: "string" }
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
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({ tenant: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can create projects" });
    }

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
      description: "Deletes a project and all associated data (owner only)",
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
        401: {
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
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const user = req.currentUser as AuthUser | undefined;
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    if (!isTenantOwner(user, params.tenant)) {
      return reply.status(403).send({ error: "Only the tenant owner can delete projects" });
    }

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
