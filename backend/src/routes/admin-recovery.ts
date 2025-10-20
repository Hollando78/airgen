import { FastifyInstance } from "fastify";
import { readdir, stat, readFile } from "fs/promises";
import { join, resolve, relative } from "path";
import { requireSuperAdminMiddleware } from "../lib/authorization.js";
import { resolveResticEnv } from "../lib/restic.js";
import { runCommand, isCommandSuccessful, formatCommandOutput } from "../lib/command.js";

const BACKUP_ROOT = process.env.BACKUP_ROOT ?? "/root/airgen/backups";
const SCRIPT_ROOT = process.env.BACKUP_SCRIPT_ROOT ?? "/root/airgen/scripts";
const DAILY_BACKUP_SCRIPT = join(SCRIPT_ROOT, "backup-daily.sh");
const WEEKLY_BACKUP_SCRIPT = join(SCRIPT_ROOT, "backup-weekly.sh");
const VERIFY_BACKUP_SCRIPT = join(SCRIPT_ROOT, "backup-verify.sh");
const RESTORE_SCRIPT = join(SCRIPT_ROOT, "backup-restore.sh");

const COMPONENT_LABELS: Record<string, string> = {
  neo4j: "Neo4j Database",
  "neo4jVolume": "Neo4j Volume Snapshot",
  postgres: "PostgreSQL Dump",
  "postgresVolume": "PostgreSQL Volume Snapshot",
  config: "Configuration",
  workspace: "Workspace (deprecated)",
  manifest: "Manifest",
  placeholder: "Notice"
};

function resolveBackupPath(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Backup path is required");
  }

  const root = resolve(BACKUP_ROOT);
  const candidate = resolve(input.startsWith("/") ? input : join(root, input));
  const relativePath = relative(root, candidate);
  const segments = relativePath.split(/[\\/]/).filter(Boolean);
  const isOutsideRoot =
    relativePath.startsWith("..") ||
    segments.some(segment => segment === "..");

  if (isOutsideRoot) {
    throw new Error("Backup path must reside within the backup root directory");
  }

  return candidate;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

type BackupComponentSummary = {
  id: string;
  label: string;
  filename: string;
  size: string;
  sizeBytes: number;
};

function detectComponentFromFilename(filename: string): string | null {
  if (filename.startsWith("neo4j-volume-")) {
    return "neo4jVolume";
  }
  if (filename.startsWith("neo4j-")) {
    return "neo4j";
  }
  if (filename.startsWith("postgres-volume-")) {
    return "postgresVolume";
  }
  if (filename.startsWith("postgres-")) {
    return "postgres";
  }
  if (filename.startsWith("config-")) {
    return "config";
  }
  if (filename.startsWith("workspace-") && filename.endsWith(".txt")) {
    return "placeholder";
  }
  if (filename.startsWith("workspace-")) {
    return "workspace";
  }
  if (filename === "MANIFEST.txt") {
    return "manifest";
  }
  return null;
}

async function summariseBackupDirectory(dir: string): Promise<{ components: BackupComponentSummary[]; warnings: string[] }> {
  const components: BackupComponentSummary[] = [];
  const warnings: string[] = [];

  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return { components, warnings };
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let fileStats;
    try {
      fileStats = await stat(fullPath);
    } catch {
      continue;
    }

    if (!fileStats.isFile()) continue;

    const componentId = detectComponentFromFilename(entry);
    if (!componentId) continue;

    components.push({
      id: componentId,
      label: COMPONENT_LABELS[componentId] ?? componentId,
      filename: entry,
      size: formatBytes(fileStats.size),
      sizeBytes: fileStats.size
    });
  }

  if (components.length === 0) {
    warnings.push("No backup artifacts were generated for this run. Review backup logs to diagnose the failure.");
  }

  return { components, warnings };
}

export default async function adminRecoveryRoutes(app: FastifyInstance) {
  const superAdminOnly = [app.authenticate, requireSuperAdminMiddleware];

  // Trigger manual daily backup
  app.post(
    "/admin/recovery/backup/daily",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "Trigger manual daily backup",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              output: { type: "string" },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      const restic = await resolveResticEnv();
      if (!restic.configured) {
        const message = "Remote backup configuration is required before running manual backups";
        app.log.warn({ component: "daily-backup" }, message);
        return {
          success: false,
          message,
          output: "",
        };
      }

      const result = await runCommand(DAILY_BACKUP_SCRIPT, [], { timeout: 300000, env: restic.env });
      const success = isCommandSuccessful(result);
      const output = formatCommandOutput(result);

      if (!success) {
        app.log.error(
          {
            exitCode: result.code,
            timedOut: result.timedOut,
            signal: result.signal,
            error: result.error ? result.error.message : undefined
          },
          "Daily backup failed"
        );
      }

      const message = success
        ? "Daily backup completed successfully"
        : result.timedOut
          ? "Daily backup timed out"
          : result.error
            ? `Failed to execute daily backup: ${result.error.message}`
            : "Daily backup failed";

      return {
        success,
        message,
        output,
      };
    }
  );

  // Trigger manual weekly backup (includes remote upload)
  app.post(
    "/admin/recovery/backup/weekly",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "Trigger manual weekly backup with remote upload",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              output: { type: "string" },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      const restic = await resolveResticEnv();
      if (!restic.configured) {
        const message = "Remote backup configuration is required before running manual backups";
        app.log.warn({ component: "weekly-backup" }, message);
        return {
          success: false,
          message,
          output: "",
        };
      }

      const result = await runCommand(WEEKLY_BACKUP_SCRIPT, [], { timeout: 600000, env: restic.env });
      const success = isCommandSuccessful(result);
      const output = formatCommandOutput(result);

      if (!success) {
        app.log.error(
          {
            exitCode: result.code,
            timedOut: result.timedOut,
            signal: result.signal,
            error: result.error ? result.error.message : undefined
          },
          "Weekly backup failed"
        );
      }

      const message = success
        ? "Weekly backup completed successfully"
        : result.timedOut
          ? "Weekly backup timed out"
          : result.error
            ? `Failed to execute weekly backup: ${result.error.message}`
            : "Weekly backup failed";

      return {
        success,
        message,
        output,
      };
    }
  );

  // List available backups
  app.get(
    "/admin/recovery/backups",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "List available backups (daily and weekly)",
        response: {
          200: {
            type: "object",
            properties: {
              daily: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    path: { type: "string" },
                    size: { type: "string" },
                    modified: { type: "string" },
                    files: { type: "number" },
                  },
                },
              },
              weekly: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    path: { type: "string" },
                    size: { type: "string" },
                    modified: { type: "string" },
                    files: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      try {
        const backupsRoot = BACKUP_ROOT;
        const daily: any[] = [];
        const weekly: any[] = [];

        // List daily backups
        try {
          const dailyDir = join(backupsRoot, "daily");
          const dailyEntries = await readdir(dailyDir);

          for (const entry of dailyEntries) {
            const fullPath = join(dailyDir, entry);
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              // Count files in directory
              const files = await readdir(fullPath);
              const sizeResult = await runCommand("du", ["-sh", fullPath], { timeout: 10000 });
              const size = isCommandSuccessful(sizeResult)
                ? sizeResult.stdout.trim().split(/\s+/)[0] ?? "unknown"
                : "unknown";

              if (!isCommandSuccessful(sizeResult)) {
                app.log.warn(
                  {
                    path: fullPath,
                    exitCode: sizeResult.code,
                    error: sizeResult.error ? sizeResult.error.message : undefined
                  },
                  "Failed to compute size for daily backup directory"
                );
              }

              const summary = await summariseBackupDirectory(fullPath);

              daily.push({
                name: entry,
                path: fullPath,
                size,
                modified: stats.mtime.toISOString(),
                files: files.length,
                components: summary.components,
                warnings: summary.warnings
              });
            }
          }
        } catch (error) {
          app.log.warn({ err: error }, "Could not list daily backups");
        }

        // List weekly backups
        try {
          const weeklyDir = join(backupsRoot, "weekly");
          const weeklyEntries = await readdir(weeklyDir);

          for (const entry of weeklyEntries) {
            const fullPath = join(weeklyDir, entry);
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
              const files = await readdir(fullPath);
              const sizeResult = await runCommand("du", ["-sh", fullPath], { timeout: 10000 });
              const size = isCommandSuccessful(sizeResult)
                ? sizeResult.stdout.trim().split(/\s+/)[0] ?? "unknown"
                : "unknown";

              if (!isCommandSuccessful(sizeResult)) {
                app.log.warn(
                  {
                    path: fullPath,
                    exitCode: sizeResult.code,
                    error: sizeResult.error ? sizeResult.error.message : undefined
                  },
                  "Failed to compute size for weekly backup directory"
                );
              }

              const summary = await summariseBackupDirectory(fullPath);

              weekly.push({
                name: entry,
                path: fullPath,
                size,
                modified: stats.mtime.toISOString(),
                files: files.length,
                components: summary.components,
                warnings: summary.warnings
              });
            }
          }
        } catch (error) {
          app.log.warn({ err: error }, "Could not list weekly backups");
        }

        // Sort by modified date (newest first)
        daily.sort(
          (a, b) =>
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        );
        weekly.sort(
          (a, b) =>
            new Date(b.modified).getTime() - new Date(a.modified).getTime()
        );

        return { daily, weekly };
      } catch (error) {
        app.log.error({ err: error }, "Failed to list backups");
        return (reply as any).code(500).send({
          error: "Failed to list backups",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // List remote backups
  app.get(
    "/admin/recovery/backups/remote",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "List remote backups using restic",
        response: {
          200: {
            type: "object",
            properties: {
              snapshots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    time: { type: "string" },
                    hostname: { type: "string" },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                    },
                    paths: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
              configured: { type: "boolean" },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      try {
        const restic = await resolveResticEnv();

        if (!restic.configured) {
          return { snapshots: [], configured: false };
        }

        const result = await runCommand("restic", ["snapshots", "--json"], {
          timeout: 30000,
          env: restic.env,
        });

        if (!isCommandSuccessful(result)) {
          app.log.error(
            {
              exitCode: result.code,
              error: result.error ? result.error.message : undefined,
              output: formatCommandOutput(result)
            },
            "Failed to list remote backups"
          );
          return { snapshots: [], configured: false };
        }

        const snapshots = JSON.parse(result.stdout || "[]");

        return {
          snapshots: snapshots.map((s: any) => ({
            id: s.short_id,
            time: s.time,
            hostname: s.hostname,
            tags: s.tags || [],
            paths: s.paths || [],
          })),
          configured: true,
        };
      } catch (error) {
        app.log.error({ err: error }, "Failed to list remote backups");
        return { snapshots: [], configured: false };
      }
    }
  );

  // Verify backup
  app.post(
    "/admin/recovery/verify",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "Verify backup integrity",
        body: {
          type: "object",
          required: ["backupPath"],
          properties: {
            backupPath: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              output: { type: "string" },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      const { backupPath } = req.body as { backupPath: string };

      let normalizedPath: string;
      try {
        normalizedPath = resolveBackupPath(backupPath);
        await stat(normalizedPath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid backup path";
        app.log.warn({ path: backupPath, err: error }, "Backup verification path rejected");
        return {
          success: false,
          message,
          output: "",
        };
      }

      const result = await runCommand(VERIFY_BACKUP_SCRIPT, [normalizedPath], {
        timeout: 120000,
      });
      const success = isCommandSuccessful(result);
      const output = formatCommandOutput(result);

      if (!success) {
        app.log.error(
          {
            exitCode: result.code,
            timedOut: result.timedOut,
            signal: result.signal,
            error: result.error ? result.error.message : undefined,
            path: normalizedPath,
          },
          "Backup verification failed"
        );
      }

      const message = success
        ? "Backup verification completed"
        : result.timedOut
          ? "Backup verification timed out"
          : result.error
            ? `Failed to execute verification: ${result.error.message}`
            : "Backup verification failed";

      return {
        success,
        message,
        output,
      };
    }
  );

  // Restore from backup (dry-run)
  app.post(
    "/admin/recovery/restore/dry-run",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "Restore from backup (dry-run - preview only)",
        body: {
          type: "object",
          required: ["backupPath"],
          properties: {
            backupPath: { type: "string" },
            component: {
              type: "string",
              enum: ["all", "neo4j", "postgres", "workspace", "config"],
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              output: { type: "string" },
            },
          },
        },
      },
      preHandler: superAdminOnly,
    },
    async (req, reply) => {
      const { backupPath, component } = req.body as {
        backupPath: string;
        component?: string;
      };

      let normalizedPath: string;
      try {
        normalizedPath = resolveBackupPath(backupPath);
        await stat(normalizedPath);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid backup path";
        app.log.warn({ path: backupPath, err: error }, "Restore dry-run path rejected");
        return {
          success: false,
          message,
          output: "",
        };
      }

      const args = [normalizedPath, "--dry-run"];
      if (component) {
        args.push(`--component=${component}`);
      }

      const result = await runCommand(RESTORE_SCRIPT, args, {
        timeout: 60000,
      });

      const success = isCommandSuccessful(result);
      const output = formatCommandOutput(result);

      if (!success) {
        app.log.error(
          {
            exitCode: result.code,
            timedOut: result.timedOut,
            signal: result.signal,
            error: result.error ? result.error.message : undefined,
            path: normalizedPath,
            component
          },
          "Restore dry-run failed"
        );
      }

      const message = success
        ? "Dry-run completed (no changes made)"
        : result.timedOut
          ? "Restore dry-run timed out"
          : result.error
            ? `Failed to execute restore dry-run: ${result.error.message}`
            : "Restore dry-run failed";

      return {
        success,
        message,
        output,
      };
    }
  );

  // Get backup system status
  app.get(
    "/admin/recovery/status",
    {
      schema: {
        tags: ["admin", "recovery"],
        summary: "Get backup system status and health",
        response: {
          200: {
            type: "object",
            properties: {
              localBackups: {
                type: "object",
                properties: {
                  dailyCount: { type: "number" },
                  weeklyCount: { type: "number" },
                  lastDaily: { type: "string" },
                  lastWeekly: { type: "string" },
                  totalSize: { type: "string" },
                },
              },
              remoteBackups: {
                type: "object",
                properties: {
                  configured: { type: "boolean" },
                  count: { type: "number" },
                  lastSnapshot: { type: "string" },
                },
              },
              cronJobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    schedule: { type: "string" },
                    command: { type: "string" },
                  },
                },
              },
              diskSpace: {
                type: "object",
                properties: {
                  available: { type: "string" },
                  used: { type: "string" },
                  percentage: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        // Get local backup counts and dates
        const dailyBackups = await readdir(join(BACKUP_ROOT, "daily")).catch(
          () => []
        );
        const weeklyBackups = await readdir(
          join(BACKUP_ROOT, "weekly")
        ).catch(() => []);

        const lastDaily =
          dailyBackups.length > 0
            ? dailyBackups.slice().sort().reverse()[0]
            : "Never";
        const lastWeekly =
          weeklyBackups.length > 0
            ? weeklyBackups.slice().sort().reverse()[0]
            : "Never";

        // Get total backup size
        const totalSizeResult = await runCommand("du", ["-sh", BACKUP_ROOT], {
          timeout: 15000,
        });
        const totalSize = isCommandSuccessful(totalSizeResult)
          ? totalSizeResult.stdout.trim().split(/\s+/)[0] ?? "0B"
          : "0B";
        if (!isCommandSuccessful(totalSizeResult)) {
          app.log.warn(
            {
              exitCode: totalSizeResult.code,
              error: totalSizeResult.error ? totalSizeResult.error.message : undefined
            },
            "Failed to calculate total backup size"
          );
        }

        // Check remote backup configuration
        let remoteBackups = {
          configured: false,
          count: 0,
          lastSnapshot: "Never",
        };

        try {
          const restic = await resolveResticEnv();

          if (restic.configured) {
            remoteBackups.configured = true;

            const snapshotsResult = await runCommand("restic", ["snapshots", "--json"], {
              timeout: 30000,
              env: restic.env,
            });

            if (isCommandSuccessful(snapshotsResult)) {
              const snapshots = JSON.parse(snapshotsResult.stdout || "[]");
              remoteBackups.count = snapshots.length;

              if (snapshots.length > 0) {
                const latest = snapshots
                  .slice()
                  .sort(
                    (a: any, b: any) =>
                      new Date(b.time).getTime() - new Date(a.time).getTime()
                  )[0];
                remoteBackups.lastSnapshot = latest.time;
              }
            } else {
              app.log.warn(
                {
                  exitCode: snapshotsResult.code,
                  error: snapshotsResult.error ? snapshotsResult.error.message : undefined,
                  output: formatCommandOutput(snapshotsResult)
                },
                "Could not retrieve remote snapshot information"
              );
            }
          }
        } catch (error) {
          app.log.warn({ err: error }, "Could not check remote backups");
        }

        // Get cron jobs (prefer host crontab mount)
        let cronSource = "";
        try {
          cronSource = await readFile("/host-crontabs/root", "utf-8");
        } catch {
          try {
            const cronResult = await runCommand("crontab", ["-l"], {
              timeout: 5000,
            });
            cronSource = isCommandSuccessful(cronResult) ? cronResult.stdout : "";
          } catch {
            cronSource = "";
          }
        }

        const cronJobs = cronSource
          .split("\n")
          .map((line) => line.trim())
          .filter(
            (line) =>
              line &&
              !line.startsWith("#") &&
              line.includes("/root/airgen/scripts/")
          )
          .map((line) => {
            const match = line.match(
              /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/
            );
            if (!match) return null;

            const [, minute, hour, day, month, weekday, command] = match;
            const schedule = `${minute} ${hour} ${day} ${month} ${weekday}`;

            let description = command;
            if (command.includes("backup-daily.sh")) {
              description = "Daily Backup (Local)";
            } else if (command.includes("backup-weekly.sh")) {
              description = "Weekly Backup (Local + Remote)";
            } else if (command.includes("backup-verify.sh")) {
              description = "Backup Verification";
            }

            return {
              schedule,
              command: description,
            };
          })
          .filter((job): job is { schedule: string; command: string } => job !== null);

        // Get disk space
        const dfResult = await runCommand("df", ["-h", BACKUP_ROOT], {
          timeout: 10000,
        });
        const dfLine = isCommandSuccessful(dfResult)
          ? dfResult.stdout.trim().split("\n").pop() ?? ""
          : "";
        const dfParts = dfLine.trim().split(/\s+/);
        const diskSpace = {
          available: dfParts[3] || "N/A",
          used: dfParts[2] || "N/A",
          percentage: dfParts[4] || "N/A",
        };

        return {
          localBackups: {
            dailyCount: dailyBackups.length,
            weeklyCount: weeklyBackups.length,
            lastDaily,
            lastWeekly,
            totalSize: totalSize.trim(),
          },
          remoteBackups,
          cronJobs,
          diskSpace,
        };
      } catch (error) {
        app.log.error({ err: error }, "Failed to get backup status");
        return (reply as any).code(500).send({
          error: "Failed to get backup status",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
}
