/**
 * Project-Level Backup/Restore API Routes
 *
 * Provides HTTP endpoints for per-project backup and restore operations.
 * Designed for use by the admin interface and automation tools.
 */

import { FastifyInstance } from "fastify";
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
          required: ["tenant", "projectKey", "outputPath"],
          properties: {
            tenant: { type: "string" },
            projectKey: { type: "string" },
            outputPath: { type: "string" },
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
              outputPath: { type: "string" },
              fileSize: { type: "number" },
              nodesExported: { type: "number" },
              relationshipsExported: { type: "number" },
              duration: { type: "number" },
              checksum: { type: "string" }
            }
          }
        }
      }
    },
    async (req, reply) => {
      const {
        tenant,
        projectKey,
        outputPath,
        format = "cypher",
        skipVersionHistory = false,
        skipBaselines = false,
        compress = false
      } = req.body as any;

      const startTime = Date.now();

      try {
        app.log.info({ tenant, projectKey, format }, "Starting project export");

        let metadata;

        if (format === "json") {
          metadata = await exportProjectToJSON(tenant, projectKey, outputPath, {
            includeVersionHistory: !skipVersionHistory,
            includeBaselines: !skipBaselines,
            compression: compress ? "gzip" : "none"
          });
        } else {
          metadata = await exportProjectToCypher(tenant, projectKey, outputPath, {
            includeVersionHistory: !skipVersionHistory,
            includeBaselines: !skipBaselines,
            compression: compress ? "gzip" : "none"
          });
        }

        const duration = Date.now() - startTime;

        // Register backup in metadata store
        try {
          await registerBackup({
            tenant,
            projectKey,
            backupType: "local",
            format: format as "cypher" | "json",
            localPath: outputPath,
            size: metadata.fileSize,
            checksum: metadata.checksum,
            metadata,
            status: "completed"
          });
        } catch (error) {
          app.log.warn({ err: error }, "Could not register backup in metadata store");
        }

        app.log.info({ tenant, projectKey, duration }, "Project export completed");

        return {
          success: true,
          tenant,
          projectKey,
          outputPath,
          fileSize: metadata.fileSize,
          nodesExported: metadata.stats.totalNodes,
          relationshipsExported: metadata.stats.totalRelationships,
          duration,
          checksum: metadata.checksum
        };
      } catch (error) {
        app.log.error({ err: error, tenant, projectKey }, "Project export failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Project export failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
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
      }
    },
    async (req, reply) => {
      const {
        backupPath,
        targetTenant,
        targetProjectKey,
        deleteExisting = false,
        dryRun = false,
        toTemp = false
      } = req.body as any;

      const startTime = Date.now();

      try {
        app.log.info({ backupPath, targetTenant, targetProjectKey, dryRun, toTemp }, "Starting project import");

        let result;

        // Restore to temporary project
        if (toTemp) {
          result = await restoreToTempProject(backupPath);
        } else {
          // Detect format from file extension
          const isJSON = backupPath.endsWith(".json");

          if (isJSON) {
            result = await importProjectFromJSON(backupPath, {
              targetTenant,
              targetProjectKey,
              deleteExisting,
              dryRun
            });
          } else {
            result = await importProjectFromCypher(backupPath, {
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
        app.log.error({ err: error, backupPath }, "Project import failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Project import failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
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
      }
    },
    async (req, reply) => {
      const { backupPath } = req.body as any;

      try {
        app.log.info({ backupPath }, "Validating project backup");

        const validation = await validateProjectBackup(backupPath);

        app.log.info({ backupPath, valid: validation.valid }, "Validation completed");

        return validation;
      } catch (error) {
        app.log.error({ err: error, backupPath }, "Validation failed");
        return (reply as any).code(500).send({
          valid: false,
          errors: [error instanceof Error ? error.message : "Unknown error"],
          warnings: [],
          stats: {
            totalNodes: 0,
            totalRelationships: 0,
            crossProjectReferences: 0
          }
        });
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
          }
        }
      }
    },
    async (req, reply) => {
      const query = req.query as any;

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
      }
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;

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
      }
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;
      const { backupType } = req.query as any;

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
      }
    },
    async (req, reply) => {
      const { tenant, projectKey } = req.params as any;
      const policy = req.body as any;

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
          }
        }
      }
    },
    async (req, reply) => {
      const { backupDir } = req.body as any;

      try {
        app.log.info({ backupDir }, "Syncing local backups");

        const result = await syncLocalBackups(backupDir);

        app.log.info({ backupDir, result }, "Backup sync completed");

        return result;
      } catch (error) {
        app.log.error({ err: error, backupDir }, "Failed to sync backups");
        return (reply as any).code(500).send({
          error: "Failed to sync backups",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
