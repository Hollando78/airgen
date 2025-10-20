/**
 * Project-Level Backup/Restore API Routes
 *
 * Provides HTTP endpoints for per-project backup and restore operations.
 * Designed for use by the admin interface and automation tools.
 */

import { FastifyInstance } from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  exportProjectToCypher,
  exportProjectToJSON
} from "../services/backup/project-backup-service.js";
import {
  importProjectFromCypher,
  importProjectFromJSON,
  validateProjectBackup,
  restoreToTempProject
} from "../services/backup/project-import-service.js";
import {
  registerBackup,
  listBackups,
  getBackupStats,
  getLatestBackup,
  applyRetentionPolicy,
  syncLocalBackups
} from "../services/backup/backup-metadata.js";
import path from "node:path";
import { requireMinimumRole, type AuthUser } from "../lib/authorization.js";
import { UserRole } from "../types/roles.js";
import { resolveResticEnv } from "../lib/restic.js";
import { runCommand, isCommandSuccessful, formatCommandOutput } from "../lib/command.js";
import { slugify } from "../services/workspace.js";

const BACKUP_ROOT = process.env.BACKUP_ROOT ?? "/root/airgen/backups";
const PROJECT_BACKUP_ROOT =
  process.env.PROJECT_BACKUP_ROOT ?? path.join(BACKUP_ROOT, "projects");
const PROJECT_BACKUP_TIMEOUT_MS = Number(
  process.env.PROJECT_BACKUP_TIMEOUT_MS ?? 300000
);

function formatTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate()
  )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds()
  )}`;
}

function safeSlug(value: string | undefined, fallback: string): string {
  const slug = slugify(value ?? "");
  if (slug) return slug;

  if (value) {
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (sanitized) return sanitized;
  }

  return fallback;
}

function buildProjectBackupPath(
  tenant: string,
  projectKey: string,
  format: "cypher" | "json"
) {
  const tenantSlug = safeSlug(tenant, "tenant");
  const projectSlug = safeSlug(projectKey, "project");
  const timestamp = formatTimestamp();
  const extension = format === "json" ? ".json" : ".cypher";
  const fileName = `${tenantSlug}__${projectSlug}__${timestamp}${extension}`;
  const directory = path.join(PROJECT_BACKUP_ROOT, tenantSlug, projectSlug);
  const filePath = path.join(directory, fileName);
  const metadataPath = format === "cypher"
    ? filePath.replace(/\.cypher$/, ".metadata.json")
    : null;

  return { tenantSlug, projectSlug, directory, filePath, metadataPath };
}

function extractResticSnapshotId(stdout: string): string | null {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    try {
      const parsed = JSON.parse(line);
      if (
        parsed?.message_type === "summary" &&
        parsed?.summary?.snapshot_id
      ) {
        return parsed.summary.snapshot_id;
      }
    } catch {
      const match = line.match(/snapshot\s+([0-9a-f]{8,})/i);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

function ensureProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: string,
  projectKey: string,
  minimumRole: UserRole = UserRole.ADMIN
): boolean {
  try {
    requireMinimumRole(
      request.currentUser as AuthUser | undefined,
      minimumRole,
      tenant,
      projectKey,
      reply
    );
    return true;
  } catch {
    return false;
  }
}

function ensureTenantAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: string,
  minimumRole: UserRole = UserRole.TENANT_ADMIN
): boolean {
  try {
    requireMinimumRole(
      request.currentUser as AuthUser | undefined,
      minimumRole,
      tenant,
      undefined,
      reply
    );
    return true;
  } catch {
    return false;
  }
}

function resolveProjectBackupPath(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Backup path is required");
  }

  const root = path.resolve(PROJECT_BACKUP_ROOT);
  const candidate = path.resolve(
    path.isAbsolute(input) ? input : path.join(root, input)
  );
  const relativePath = path.relative(root, candidate);
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  const isOutsideRoot =
    relativePath.startsWith("..") || segments.some((segment) => segment === "..");

  if (isOutsideRoot) {
    throw new Error("Backup path must reside within the project backup directory");
  }

  return candidate;
}

// ============================================================================
// Route Definitions
// ============================================================================

export default async function projectBackupRoutes(app: FastifyInstance) {
  /**
   * Export a project to backup file
   */
  app.post(
    "/admin/recovery/project/export",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Export a project to backup file",
        body: {
          type: "object",
          required: ["tenant", "projectKey"],
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" },
            outputPath: { type: "string", nullable: true },
            format: { type: "string", enum: ["cypher", "json"], default: "cypher" },
            skipVersionHistory: { type: "boolean", default: false },
            skipBaselines: { type: "boolean", default: false },
            compress: { type: "boolean", default: false }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              tenant: { type: "string" },
              projectKey: { type: "string" },
              outputPath: { type: "string", nullable: true },
              fileSize: { type: "number", nullable: true },
              nodesExported: { type: "number", nullable: true },
              relationshipsExported: { type: "number", nullable: true },
              duration: { type: "number" },
              checksum: { type: "string", nullable: true },
              resticSnapshotId: { type: "string", nullable: true },
              log: { type: "string", nullable: true },
              message: { type: "string", nullable: true }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const body = req.body as {
        tenant: string;
        projectKey: string;
        format?: "cypher" | "json";
        skipVersionHistory?: boolean;
        skipBaselines?: boolean;
        compress?: boolean;
        outputPath?: string;
      };

      const {
        tenant,
        projectKey,
        format = "cypher",
        skipVersionHistory = false,
        skipBaselines = false,
        compress = false
      } = body;

      try {
        if (!ensureProjectAccess(req, reply, tenant, projectKey)) {
          return;
        }

        const restic = await resolveResticEnv();
        if (!restic.configured) {
          const message = "Remote backup configuration is required before exporting projects";
          app.log.warn({ tenant, projectKey }, message);
          return {
            success: false,
            tenant,
            projectKey,
            outputPath: null,
            fileSize: null,
            nodesExported: null,
            relationshipsExported: null,
            duration: 0,
            checksum: null,
            resticSnapshotId: null,
            log: message,
            message
          };
        }

        const startTime = Date.now();
        const resolvedFormat = format === "json" ? "json" : "cypher";
        const { tenantSlug, projectSlug, filePath, metadataPath } =
          buildProjectBackupPath(tenant, projectKey, resolvedFormat);

        app.log.info(
          { tenant, projectKey, format: resolvedFormat, filePath },
          "Starting project export"
        );

        let metadata;

        try {
          if (resolvedFormat === "json") {
            metadata = await exportProjectToJSON(tenant, projectKey, filePath, {
              includeVersionHistory: !skipVersionHistory,
              includeBaselines: !skipBaselines,
              compression: compress ? "gzip" : "none"
            });
          } else {
            metadata = await exportProjectToCypher(tenant, projectKey, filePath, {
              includeVersionHistory: !skipVersionHistory,
              includeBaselines: !skipBaselines,
              compression: compress ? "gzip" : "none"
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Project export failed";
          app.log.error(
            { err: error, tenant, projectKey },
            "Project export failed"
          );
          return {
            success: false,
            tenant,
            projectKey,
            outputPath: filePath,
            fileSize: null,
            nodesExported: null,
            relationshipsExported: null,
            duration: Date.now() - startTime,
            checksum: null,
            resticSnapshotId: null,
            log: message,
            message
          };
        }

        const duration = Date.now() - startTime;

        if (body.outputPath && body.outputPath !== filePath) {
          app.log.warn(
            {
              tenant,
              projectKey,
              requestedPath: body.outputPath,
              resolvedPath: filePath
            },
            "Custom outputPath is ignored; using managed project backup naming"
          );
        }

        const resticArgs = [
          "backup",
          filePath,
          ...(metadataPath ? [metadataPath] as string[] : []),
          "--json",
          "--tag",
          "project-backup",
          "--tag",
          `tenant:${tenantSlug}`,
          "--tag",
          `project:${projectSlug}`
        ];

        const resticResult = await runCommand("restic", resticArgs, {
          env: restic.env,
          timeout: PROJECT_BACKUP_TIMEOUT_MS
        });

        if (!isCommandSuccessful(resticResult)) {
          const log = formatCommandOutput(resticResult);
          app.log.error(
            {
              tenant,
              projectKey,
              exitCode: resticResult.code,
              error: resticResult.error ? resticResult.error.message : undefined,
              log
            },
            "Project export remote backup failed"
          );
          return {
            success: false,
            tenant,
            projectKey,
            outputPath: filePath,
            fileSize: metadata.fileSize,
            nodesExported: metadata.stats.totalNodes,
            relationshipsExported: metadata.stats.totalRelationships,
            duration,
            checksum: metadata.checksum,
            resticSnapshotId: null,
            log,
            message: "Failed to upload project backup to remote storage"
          };
        }

        const resticOutput = formatCommandOutput(resticResult);
        const snapshotId = extractResticSnapshotId(resticResult.stdout);

        try {
          await registerBackup({
            tenant,
            projectKey,
            backupType: "both",
            format: resolvedFormat,
            localPath: filePath,
            remotePath: snapshotId ? `restic:snapshot:${snapshotId}` : undefined,
            resticSnapshotId: snapshotId ?? undefined,
            size: metadata.fileSize,
            checksum: metadata.checksum,
            metadata,
            status: "completed"
          });
        } catch (error) {
          app.log.warn(
            { err: error, tenant, projectKey },
            "Could not register backup in metadata store"
          );
        }

        app.log.info(
          { tenant, projectKey, duration, snapshotId },
          "Project export completed"
        );

        return {
          success: true,
          tenant,
          projectKey,
          outputPath: filePath,
          fileSize: metadata.fileSize,
          nodesExported: metadata.stats.totalNodes,
          relationshipsExported: metadata.stats.totalRelationships,
          duration,
          checksum: metadata.checksum,
          resticSnapshotId: snapshotId ?? null,
          log: resticOutput,
          message: null
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Project export failed";
        app.log.error({ err: error, tenant, projectKey }, "Project export failed");
        return {
          success: false,
          tenant,
          projectKey,
          outputPath: null,
          fileSize: null,
          nodesExported: null,
          relationshipsExported: null,
          duration: 0,
          checksum: null,
          resticSnapshotId: null,
          log: message,
          message
        };
      }
    }
  );

  /**
   * Import/restore a project from backup file
   */
  app.post(
    "/admin/recovery/project/import",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Import/restore a project from backup",
        body: {
          type: "object",
          required: ["backupPath"],
          properties: {
            backupPath: { type: "string" },
            targetTenant: { type: "string" },
            targetProjectKey: { type: "string" },
            deleteExisting: { type: "boolean", default: false },
            dryRun: { type: "boolean", default: false },
            toTemp: { type: "boolean", default: false }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              nodesCreated: { type: "number" },
              relationshipsCreated: { type: "number" },
              targetTenant: { type: "string" },
              targetProjectKey: { type: "string" },
              duration: { type: "number" },
              errors: { type: "array", items: { type: "string" } },
              warnings: { type: "array", items: { type: "string" } }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const body = req.body as {
        backupPath: string;
        targetTenant?: string;
        targetProjectKey?: string;
        deleteExisting?: boolean;
        dryRun?: boolean;
        toTemp?: boolean;
      };

      const {
        backupPath,
        targetTenant,
        targetProjectKey,
        deleteExisting = false,
        dryRun = false,
        toTemp = false
      } = body;

      try {
        requireMinimumRole(
          req.currentUser as AuthUser | undefined,
          UserRole.SUPER_ADMIN,
          undefined,
          undefined,
          reply
        );
      } catch {
        return;
      }

      let resolvedBackupPath: string;
      try {
        resolvedBackupPath = resolveProjectBackupPath(backupPath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid backup path";
        app.log.warn({ backupPath }, message);
        return {
          success: false,
          nodesCreated: 0,
          relationshipsCreated: 0,
          targetTenant: targetTenant ?? "",
          targetProjectKey: targetProjectKey ?? "",
          duration: 0,
          errors: [message],
          warnings: []
        };
      }

      const startTime = Date.now();

      try {
        app.log.info({ backupPath: resolvedBackupPath, targetTenant, targetProjectKey, dryRun, toTemp }, "Starting project import");

        let result;

        // Restore to temporary project
        if (toTemp) {
          result = await restoreToTempProject(resolvedBackupPath);
        } else {
          // Detect format from file extension
          const isJSON = resolvedBackupPath.endsWith(".json");

          if (isJSON) {
            result = await importProjectFromJSON(resolvedBackupPath, {
              targetTenant,
              targetProjectKey,
              deleteExisting,
              dryRun
            });
          } else {
            result = await importProjectFromCypher(resolvedBackupPath, {
              targetTenant,
              targetProjectKey,
              deleteExisting,
              dryRun
            });
          }
        }

        const duration = Date.now() - startTime;

        app.log.info({
          tenant: result.targetTenant,
          project: result.targetProjectKey,
          duration,
          success: result.success
        }, "Project import completed");

        return {
          success: result.success,
          nodesCreated: result.nodesCreated,
          relationshipsCreated: result.relationshipsCreated,
          targetTenant: result.targetTenant,
          targetProjectKey: result.targetProjectKey,
          duration,
          errors: result.errors,
          warnings: result.warnings
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Project import failed";
        app.log.error({ err: error, backupPath: resolvedBackupPath }, "Project import failed");
        return {
          success: false,
          nodesCreated: 0,
          relationshipsCreated: 0,
          targetTenant: targetTenant ?? "",
          targetProjectKey: targetProjectKey ?? "",
          duration: Date.now() - startTime,
          errors: [message],
          warnings: []
        };
      }
    }
  );

  /**
   * Validate a project backup file
   */
  app.post(
    "/admin/recovery/project/validate",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Validate a project backup file",
        body: {
          type: "object",
          required: ["backupPath"],
          properties: {
            backupPath: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              errors: { type: "array", items: { type: "string" } },
              warnings: { type: "array", items: { type: "string" } },
              stats: {
                type: "object",
                properties: {
                  totalNodes: { type: "number" },
                  totalRelationships: { type: "number" },
                  crossProjectReferences: { type: "number" }
                }
              }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const { backupPath } = req.body as { backupPath: string };

      try {
        requireMinimumRole(
          req.currentUser as AuthUser | undefined,
          UserRole.SUPER_ADMIN,
          undefined,
          undefined,
          reply
        );
      } catch {
        return;
      }

      let resolvedBackupPath: string;
      try {
        resolvedBackupPath = resolveProjectBackupPath(backupPath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid backup path";
        app.log.warn({ backupPath }, message);
        return {
          valid: false,
          errors: [message],
          warnings: [],
          stats: {
            totalNodes: 0,
            totalRelationships: 0,
            crossProjectReferences: 0
          }
        };
      }

      try {
        app.log.info({ backupPath: resolvedBackupPath }, "Validating project backup");

        const validation = await validateProjectBackup(resolvedBackupPath);

        app.log.info({ backupPath: resolvedBackupPath, valid: validation.valid }, "Validation completed");

        return validation;
      } catch (error) {
        app.log.error({ err: error, backupPath: resolvedBackupPath }, "Validation failed");
        return {
          valid: false,
          errors: [error instanceof Error ? error.message : "Unknown error"],
          warnings: [],
          stats: {
            totalNodes: 0,
            totalRelationships: 0,
            crossProjectReferences: 0
          }
        };
      }
    }
  );

  /**
   * List all project backups
   */
  app.get(
    "/admin/recovery/project/backups",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "List all project backups",
        querystring: {
          type: "object",
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" },
            backupType: { type: "string", enum: ["local", "remote", "both"] },
            status: { type: "string", enum: ["pending", "completed", "failed", "expired"] },
            limit: { type: "number", default: 100 },
            offset: { type: "number", default: 0 }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              backups: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    tenant: { type: "string" },
                    projectKey: { type: "string" },
                    backupType: { type: "string" },
                    format: { type: "string" },
                    localPath: { type: "string" },
                    remotePath: { type: "string" },
                    resticSnapshotId: { type: "string" },
                    createdAt: { type: "string" },
                    size: { type: "number" },
                    checksum: { type: "string" },
                    status: { type: "string" }
                  }
                }
              },
              total: { type: "number" }
            }
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" }
            },
            additionalProperties: true
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const query = req.query as any;
      const user = req.currentUser as AuthUser | undefined;
      const isSuperAdmin =
        user?.permissions?.globalRole === UserRole.SUPER_ADMIN ||
        (Array.isArray(user?.roles) && user.roles.includes(UserRole.SUPER_ADMIN));

      if (!isSuperAdmin) {
        if (!query.tenant) {
          reply.code(400).send({
            error: "Tenant parameter is required for scoped backup listing"
          });
          return;
        }

        if (query.projectKey) {
          if (!ensureProjectAccess(req, reply, query.tenant, query.projectKey)) {
            return;
          }
        } else {
          if (!ensureTenantAccess(req, reply, query.tenant)) {
            return;
          }
        }
      }

      try {
        app.log.info({ query }, "Listing project backups");

        const backups = await listBackups({
          tenant: query.tenant,
          projectKey: query.projectKey,
          backupType: query.backupType,
          status: query.status,
          limit: query.limit || 100,
          offset: query.offset || 0
        });

        return {
          backups: backups.map(b => ({
            id: b.id,
            tenant: b.tenant,
            projectKey: b.projectKey,
            backupType: b.backupType,
            format: b.format,
            localPath: b.localPath,
            remotePath: b.remotePath,
            resticSnapshotId: b.resticSnapshotId,
            createdAt: b.createdAt.toISOString(),
            size: b.size,
            checksum: b.checksum,
            status: b.status
          })),
          total: backups.length
        };
      } catch (error) {
        app.log.error({ err: error }, "Failed to list project backups");
        return (reply as any).code(500).send({
          error: "Failed to list project backups",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  /**
   * Get backup statistics for a specific project
   */
  app.get(
    "/admin/recovery/project/stats/:tenant/:projectKey",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Get backup statistics for a project",
        params: {
          type: "object",
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              totalBackups: { type: "number" },
              localBackups: { type: "number" },
              remoteBackups: { type: "number" },
              totalSize: { type: "number" },
              latestBackup: { type: "string" },
              oldestBackup: { type: "string" }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;

      if (!ensureProjectAccess(req, reply, tenant, projectKey)) {
        return;
      }

      try {
        app.log.info({ tenant, projectKey }, "Getting project backup stats");

        const stats = await getBackupStats(tenant, projectKey);

        return {
          totalBackups: stats.totalBackups,
          localBackups: stats.localBackups,
          remoteBackups: stats.remoteBackups,
          totalSize: stats.totalSize,
          latestBackup: stats.latestBackup?.toISOString() || null,
          oldestBackup: stats.oldestBackup?.toISOString() || null
        };
      } catch (error) {
        app.log.error({ err: error, tenant, projectKey }, "Failed to get backup stats");
        return (reply as any).code(500).send({
          error: "Failed to get backup stats",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  /**
   * Get the latest backup for a specific project
   */
  app.get(
    "/admin/recovery/project/latest/:tenant/:projectKey",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Get the latest backup for a project",
        params: {
          type: "object",
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          properties: {
            backupType: { type: "string", enum: ["local", "remote"] }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              backup: {
                type: "object",
                nullable: true,
                properties: {
                  id: { type: "string" },
                  tenant: { type: "string" },
                  projectKey: { type: "string" },
                  backupType: { type: "string" },
                  format: { type: "string" },
                  localPath: { type: "string" },
                  remotePath: { type: "string" },
                  resticSnapshotId: { type: "string" },
                  createdAt: { type: "string" },
                  size: { type: "number" },
                  checksum: { type: "string" },
                  status: { type: "string" }
                }
              }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;
      const { backupType } = req.query as any;

      if (!ensureProjectAccess(req, reply, tenant, projectKey)) {
        return;
      }

      try {
        app.log.info({ tenant, projectKey, backupType }, "Getting latest backup");

        const backup = await getLatestBackup(tenant, projectKey, backupType);

        if (!backup) {
          return { backup: null };
        }

        return {
          backup: {
            id: backup.id,
            tenant: backup.tenant,
            projectKey: backup.projectKey,
            backupType: backup.backupType,
            format: backup.format,
            localPath: backup.localPath,
            remotePath: backup.remotePath,
            resticSnapshotId: backup.resticSnapshotId,
            createdAt: backup.createdAt.toISOString(),
            size: backup.size,
            checksum: backup.checksum,
            status: backup.status
          }
        };
      } catch (error) {
        app.log.error({ err: error, tenant, projectKey }, "Failed to get latest backup");
        return (reply as any).code(500).send({
          error: "Failed to get latest backup",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  /**
   * Apply retention policy to project backups
   */
  app.post(
    "/admin/recovery/project/retention/:tenant/:projectKey",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Apply retention policy to project backups",
        params: {
          type: "object",
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" }
          }
        },
        body: {
          type: "object",
          properties: {
            keepDaily: { type: "number", default: 7 },
            keepWeekly: { type: "number", default: 4 },
            keepMonthly: { type: "number", default: 6 },
            keepYearly: { type: "number", default: 2 }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              keptCount: { type: "number" },
              expiredCount: { type: "number" }
            }
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;
      const policy = req.body as {
        keepDaily?: number;
        keepWeekly?: number;
        keepMonthly?: number;
        keepYearly?: number;
      };

      if (!ensureProjectAccess(req, reply, tenant, projectKey, UserRole.TENANT_ADMIN)) {
        return;
      }

      try {
        app.log.info({ tenant, projectKey, policy }, "Applying retention policy");

        const result = await applyRetentionPolicy(tenant, projectKey, {
          keepDaily: policy.keepDaily || 7,
          keepWeekly: policy.keepWeekly || 4,
          keepMonthly: policy.keepMonthly || 6,
          keepYearly: policy.keepYearly || 2
        });

        app.log.info({ tenant, projectKey, result }, "Retention policy applied");

        return result;
      } catch (error) {
        app.log.error({ err: error, tenant, projectKey }, "Failed to apply retention policy");
        return (reply as any).code(500).send({
          error: "Failed to apply retention policy",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  /**
   * Sync local backups with metadata store
   */
  app.post(
    "/admin/recovery/project/sync",
    {
      schema: {
        tags: ["admin", "recovery", "project-backup"],
        summary: "Sync local backups with metadata store",
        body: {
          type: "object",
          required: ["backupDir"],
          properties: {
            backupDir: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              registered: { type: "number" },
              skipped: { type: "number" }
            }
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" }
            },
            additionalProperties: true
          }
        }
      },
      preHandler: [app.authenticate]
    },
    async (req, reply) => {
      const { backupDir } = req.body as { backupDir: string };

      try {
        requireMinimumRole(
          req.currentUser as AuthUser | undefined,
          UserRole.SUPER_ADMIN,
          undefined,
          undefined,
          reply
        );
      } catch {
        return;
      }

      let resolvedDir: string;
      try {
        resolvedDir = resolveProjectBackupPath(backupDir);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid backup directory";
        app.log.warn({ backupDir }, message);
        reply.code(400).send({ error: message });
        return;
      }

      try {
        app.log.info({ backupDir: resolvedDir }, "Syncing local backups");

        const result = await syncLocalBackups(resolvedDir);

        app.log.info({ backupDir: resolvedDir, result }, "Backup sync completed");

        return result;
      } catch (error) {
        app.log.error({ err: error, backupDir: resolvedDir }, "Failed to sync backups");
        return (reply as any).code(500).send({
          error: "Failed to sync backups",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
