import { FastifyInstance } from "fastify";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

export default async function adminRecoveryRoutes(app: FastifyInstance) {
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
    },
    async (req, reply) => {
      try {
        const { stdout, stderr } = await execAsync(
          "/root/airgen/scripts/backup-daily.sh",
          { timeout: 300000 }
        );

        return {
          success: true,
          message: "Daily backup completed successfully",
          output: stdout + (stderr || ""),
        };
      } catch (error) {
        app.log.error({ err: error }, "Daily backup failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Daily backup failed",
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
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
    },
    async (req, reply) => {
      try {
        const { stdout, stderr } = await execAsync(
          "/root/airgen/scripts/backup-weekly.sh",
          { timeout: 600000 }
        );

        return {
          success: true,
          message: "Weekly backup completed successfully",
          output: stdout + (stderr || ""),
        };
      } catch (error) {
        app.log.error({ err: error }, "Weekly backup failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Weekly backup failed",
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
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
    },
    async (req, reply) => {
      try {
        const backupsRoot = "/root/airgen/backups";
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
              const size = await execAsync(`du -sh "${fullPath}" | cut -f1`);

              daily.push({
                name: entry,
                path: fullPath,
                size: size.stdout.trim(),
                modified: stats.mtime.toISOString(),
                files: files.length,
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
              const size = await execAsync(`du -sh "${fullPath}" | cut -f1`);

              weekly.push({
                name: entry,
                path: fullPath,
                size: size.stdout.trim(),
                modified: stats.mtime.toISOString(),
                files: files.length,
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
    },
    async (req, reply) => {
      try {
        // Check if remote backup is configured
        const { stdout: repoCheck } = await execAsync(
          "grep RESTIC_REPOSITORY /etc/environment || echo 'not_configured'",
          { timeout: 5000 }
        );

        if (repoCheck.includes("not_configured")) {
          return { snapshots: [], configured: false };
        }

        // Get remote snapshots (export env vars from /etc/environment)
        const { stdout } = await execAsync(
          "set -a && source /etc/environment && set +a && restic snapshots --json",
          { timeout: 30000, shell: "/bin/bash" }
        );

        const snapshots = JSON.parse(stdout);

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
    },
    async (req, reply) => {
      const { backupPath } = req.body as { backupPath: string };

      try {
        const { stdout, stderr } = await execAsync(
          `/root/airgen/scripts/backup-verify.sh "${backupPath}"`,
          { timeout: 120000 }
        );

        return {
          success: true,
          message: "Backup verification completed",
          output: stdout + (stderr || ""),
        };
      } catch (error) {
        app.log.error({ err: error }, "Backup verification failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Backup verification failed",
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
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
    },
    async (req, reply) => {
      const { backupPath, component } = req.body as {
        backupPath: string;
        component?: string;
      };

      try {
        const componentFlag = component ? `--component ${component}` : "";
        const { stdout, stderr } = await execAsync(
          `/root/airgen/scripts/backup-restore.sh "${backupPath}" --dry-run ${componentFlag}`,
          { timeout: 60000 }
        );

        return {
          success: true,
          message: "Dry-run completed (no changes made)",
          output: stdout + (stderr || ""),
        };
      } catch (error) {
        app.log.error({ err: error }, "Restore dry-run failed");
        return (reply as any).code(500).send({
          success: false,
          message: "Restore dry-run failed",
          output: error instanceof Error ? error.message : "Unknown error",
        });
      }
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
        const dailyBackups = await readdir("/root/airgen/backups/daily").catch(
          () => []
        );
        const weeklyBackups = await readdir(
          "/root/airgen/backups/weekly"
        ).catch(() => []);

        const lastDaily =
          dailyBackups.length > 0
            ? dailyBackups.sort().reverse()[0]
            : "Never";
        const lastWeekly =
          weeklyBackups.length > 0
            ? weeklyBackups.sort().reverse()[0]
            : "Never";

        // Get total backup size
        const { stdout: totalSize } = await execAsync(
          "du -sh /root/airgen/backups 2>/dev/null | cut -f1 || echo '0B'"
        );

        // Check remote backup configuration
        let remoteBackups = {
          configured: false,
          count: 0,
          lastSnapshot: "Never",
        };

        try {
          const { stdout: repoCheck } = await execAsync(
            "grep RESTIC_REPOSITORY /etc/environment",
            { timeout: 5000 }
          );

          if (repoCheck) {
            remoteBackups.configured = true;

            const { stdout: snapshotsJson } = await execAsync(
              "set -a && source /etc/environment && set +a && restic snapshots --json 2>/dev/null || echo '[]'",
              { timeout: 30000, shell: "/bin/bash" }
            );

            const snapshots = JSON.parse(snapshotsJson);
            remoteBackups.count = snapshots.length;

            if (snapshots.length > 0) {
              const latest = snapshots.sort(
                (a: any, b: any) =>
                  new Date(b.time).getTime() - new Date(a.time).getTime()
              )[0];
              remoteBackups.lastSnapshot = latest.time;
            }
          }
        } catch (error) {
          app.log.warn({ err: error }, "Could not check remote backups");
        }

        // Get cron jobs
        const { stdout: cronOutput } = await execAsync(
          "crontab -l 2>/dev/null | grep backup || echo 'No cron jobs configured'"
        );

        const cronJobs = cronOutput
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("#"))
          .map((line) => {
            // Match: minute hour day month weekday command
            const match = line.match(/^(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)\s+(.+)$/);
            if (!match) return null;

            const [_, minute, hour, day, month, weekday, command] = match;
            const schedule = `${minute} ${hour} ${day} ${month} ${weekday}`;

            // Determine backup type from command
            let description = "Backup";
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
          .filter((job) => job !== null);

        // Get disk space
        const { stdout: dfOutput } = await execAsync(
          "df -h /root/airgen/backups 2>/dev/null | tail -1 || echo 'N/A N/A N/A N/A'"
        );

        const dfParts = dfOutput.trim().split(/\s+/);
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
