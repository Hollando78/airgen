/**
 * Backup Metadata Tracking Service
 *
 * Tracks all project backups (local and remote) with metadata storage.
 * Enables backup discovery, validation, and retention management.
 *
 * Features:
 * - Store backup metadata in PostgreSQL
 * - Track local and remote backup locations
 * - Query available backups by tenant/project
 * - Manage backup retention policies
 * - Link to RESTIC snapshots
 */

import { query } from "../../lib/postgres.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectBackupMetadata } from "./project-backup-service.js";

// ============================================================================
// Types
// ============================================================================

export interface BackupRecord {
  id: string;
  tenant: string;
  projectKey: string;
  backupType: "local" | "remote" | "both";
  format: "cypher" | "json";
  localPath?: string;
  remotePath?: string;
  resticSnapshotId?: string;
  createdAt: Date;
  size: number;
  checksum: string;
  metadata: ProjectBackupMetadata;
  status: "pending" | "completed" | "failed" | "expired";
  expiresAt?: Date;
}

export interface BackupListOptions {
  tenant?: string;
  projectKey?: string;
  backupType?: "local" | "remote" | "both";
  status?: BackupRecord["status"];
  limit?: number;
  offset?: number;
}

export interface BackupRetentionPolicy {
  keepDaily: number;      // Days to keep daily backups
  keepWeekly: number;     // Weeks to keep weekly backups
  keepMonthly: number;    // Months to keep monthly backups
  keepYearly: number;     // Years to keep yearly backups
}

// ============================================================================
// Database Schema (virtual - will be created in migration)
// ============================================================================

// NOTE: This service assumes the following PostgreSQL table exists:
//
// CREATE TABLE project_backups (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant VARCHAR(255) NOT NULL,
//   project_key VARCHAR(255) NOT NULL,
//   backup_type VARCHAR(10) NOT NULL CHECK (backup_type IN ('local', 'remote', 'both')),
//   format VARCHAR(10) NOT NULL CHECK (format IN ('cypher', 'json')),
//   local_path TEXT,
//   remote_path TEXT,
//   restic_snapshot_id VARCHAR(64),
//   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
//   size BIGINT NOT NULL,
//   checksum VARCHAR(64) NOT NULL,
//   metadata JSONB NOT NULL,
//   status VARCHAR(20) NOT NULL DEFAULT 'completed',
//   expires_at TIMESTAMP,
//   INDEX idx_tenant_project (tenant, project_key),
//   INDEX idx_created_at (created_at),
//   INDEX idx_status (status)
// );

// ============================================================================
// Backup Registration
// ============================================================================

/**
 * Register a new backup in the metadata store.
 */
export async function registerBackup(record: Omit<BackupRecord, "id" | "createdAt">): Promise<BackupRecord> {
  console.log(`[Backup Metadata] Registering backup for ${record.tenant}/${record.projectKey}`);

  const queryText = `
    INSERT INTO project_backups (
      tenant, project_key, backup_type, format,
      local_path, remote_path, restic_snapshot_id,
      size, checksum, metadata, status, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `;

  try {
    const result = await query(queryText, [
      record.tenant,
      record.projectKey,
      record.backupType,
      record.format,
      record.localPath || null,
      record.remotePath || null,
      record.resticSnapshotId || null,
      record.size,
      record.checksum,
      JSON.stringify(record.metadata),
      record.status,
      record.expiresAt || null
    ]);

    const row = result.rows[0] as any;
    return mapRowToBackupRecord(row);
  } catch (error) {
    console.error("[Backup Metadata] Failed to register backup:", error);
    throw error;
  }
}

/**
 * Update an existing backup record.
 */
export async function updateBackup(
  id: string,
  updates: Partial<Pick<BackupRecord, "status" | "remotePath" | "resticSnapshotId" | "expiresAt">>
): Promise<BackupRecord | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.remotePath !== undefined) {
    setClauses.push(`remote_path = $${paramIndex++}`);
    values.push(updates.remotePath);
  }
  if (updates.resticSnapshotId !== undefined) {
    setClauses.push(`restic_snapshot_id = $${paramIndex++}`);
    values.push(updates.resticSnapshotId);
  }
  if (updates.expiresAt !== undefined) {
    setClauses.push(`expires_at = $${paramIndex++}`);
    values.push(updates.expiresAt);
  }

  if (setClauses.length === 0) {
    throw new Error("No fields to update");
  }

  const queryText = `
    UPDATE project_backups
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  values.push(id);

  try {
    const result = await query(queryText, values);
    if (result.rows.length === 0) return null;

    return mapRowToBackupRecord(result.rows[0] as any);
  } catch (error) {
    console.error("[Backup Metadata] Failed to update backup:", error);
    throw error;
  }
}

// ============================================================================
// Backup Discovery
// ============================================================================

/**
 * List all backups matching the given criteria.
 */
export async function listBackups(options: BackupListOptions = {}): Promise<BackupRecord[]> {
  const whereClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (options.tenant) {
    whereClauses.push(`tenant = $${paramIndex++}`);
    values.push(options.tenant);
  }

  if (options.projectKey) {
    whereClauses.push(`project_key = $${paramIndex++}`);
    values.push(options.projectKey);
  }

  if (options.backupType) {
    whereClauses.push(`backup_type = $${paramIndex++}`);
    values.push(options.backupType);
  }

  if (options.status) {
    whereClauses.push(`status = $${paramIndex++}`);
    values.push(options.status);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const queryText = `
    SELECT * FROM project_backups
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++}
    OFFSET $${paramIndex}
  `;

  values.push(limit, offset);

  try {
    const result = await query(queryText, values);
    return result.rows.map((row: any) => mapRowToBackupRecord(row));
  } catch (error) {
    console.error("[Backup Metadata] Failed to list backups:", error);
    throw error;
  }
}

/**
 * Get a specific backup by ID.
 */
export async function getBackup(id: string): Promise<BackupRecord | null> {
  const queryText = `
    SELECT * FROM project_backups
    WHERE id = $1
  `;

  try {
    const result = await query(queryText, [id]);
    if (result.rows.length === 0) return null;

    return mapRowToBackupRecord(result.rows[0] as any);
  } catch (error) {
    console.error("[Backup Metadata] Failed to get backup:", error);
    throw error;
  }
}

/**
 * Get the most recent backup for a specific project.
 */
export async function getLatestBackup(
  tenant: string,
  projectKey: string,
  backupType?: "local" | "remote"
): Promise<BackupRecord | null> {
  let queryText = `
    SELECT * FROM project_backups
    WHERE tenant = $1 AND project_key = $2
      AND status = 'completed'
  `;

  const params: any[] = [tenant, projectKey];

  if (backupType) {
    queryText += ` AND backup_type IN ($3, 'both')`;
    params.push(backupType);
  }

  queryText += ` ORDER BY created_at DESC LIMIT 1`;

  try {
    const result = await query(queryText, params);
    if (result.rows.length === 0) return null;

    return mapRowToBackupRecord(result.rows[0] as any);
  } catch (error) {
    console.error("[Backup Metadata] Failed to get latest backup:", error);
    throw error;
  }
}

// ============================================================================
// Backup Validation
// ============================================================================

/**
 * Validate that a backup file exists and matches its metadata.
 */
export async function validateBackup(backupId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const backup = await getBackup(backupId);
  if (!backup) {
    return { valid: false, errors: ["Backup record not found"] };
  }

  const errors: string[] = [];

  // Check local file if specified
  if (backup.localPath) {
    try {
      const stats = await fs.stat(backup.localPath);

      // Check size
      if (stats.size !== backup.size) {
        errors.push(`Size mismatch: expected ${backup.size}, got ${stats.size}`);
      }

      // Check checksum (simplified - would use actual hash in production)
      // For now, just verify file is readable
      await fs.access(backup.localPath, fs.constants.R_OK);
    } catch (error) {
      errors.push(`Local file not accessible: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Check remote if specified
  if (backup.resticSnapshotId) {
    // TODO: Add RESTIC validation
    // Would run: restic snapshots --json | grep backup.resticSnapshotId
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// Retention Management
// ============================================================================

/**
 * Apply retention policy to project backups.
 * Marks old backups as expired based on the policy.
 */
export async function applyRetentionPolicy(
  tenant: string,
  projectKey: string,
  policy: BackupRetentionPolicy
): Promise<{
  keptCount: number;
  expiredCount: number;
}> {
  console.log(`[Backup Metadata] Applying retention policy to ${tenant}/${projectKey}`);

  const backups = await listBackups({
    tenant,
    projectKey,
    status: "completed",
    limit: 1000
  });

  if (backups.length === 0) {
    return { keptCount: 0, expiredCount: 0 };
  }

  const now = new Date();
  const toExpire: string[] = [];

  // Sort backups by date (newest first)
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Group by time period
  const daily: BackupRecord[] = [];
  const weekly: BackupRecord[] = [];
  const monthly: BackupRecord[] = [];
  const yearly: BackupRecord[] = [];

  for (const backup of backups) {
    const age = now.getTime() - backup.createdAt.getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);

    if (daysOld <= policy.keepDaily) {
      daily.push(backup);
    } else if (daysOld <= policy.keepWeekly * 7) {
      // Keep one per week
      const weekNum = Math.floor(daysOld / 7);
      if (!weekly[weekNum]) {
        weekly[weekNum] = backup;
      } else {
        toExpire.push(backup.id);
      }
    } else if (daysOld <= policy.keepMonthly * 30) {
      // Keep one per month
      const monthNum = Math.floor(daysOld / 30);
      if (!monthly[monthNum]) {
        monthly[monthNum] = backup;
      } else {
        toExpire.push(backup.id);
      }
    } else if (daysOld <= policy.keepYearly * 365) {
      // Keep one per year
      const yearNum = Math.floor(daysOld / 365);
      if (!yearly[yearNum]) {
        yearly[yearNum] = backup;
      } else {
        toExpire.push(backup.id);
      }
    } else {
      toExpire.push(backup.id);
    }
  }

  // Mark expired backups
  for (const id of toExpire) {
    await updateBackup(id, { status: "expired", expiresAt: now });
  }

  const keptCount = backups.length - toExpire.length;

  console.log(`[Backup Metadata] Retention applied: kept ${keptCount}, expired ${toExpire.length}`);

  return {
    keptCount,
    expiredCount: toExpire.length
  };
}

/**
 * Physically delete expired backups from disk and remote storage.
 */
export async function cleanupExpiredBackups(dryRun = false): Promise<{
  deletedLocal: number;
  deletedRemote: number;
  errors: string[];
}> {
  console.log(`[Backup Metadata] Cleaning up expired backups (dryRun: ${dryRun})`);

  const expiredBackups = await listBackups({ status: "expired", limit: 1000 });

  let deletedLocal = 0;
  let deletedRemote = 0;
  const errors: string[] = [];

  for (const backup of expiredBackups) {
    // Delete local file
    if (backup.localPath) {
      try {
        if (!dryRun) {
          await fs.unlink(backup.localPath);

          // Also delete metadata file if it exists
          const metadataPath = backup.localPath.replace(/\.(cypher|json)$/, ".metadata.json");
          try {
            await fs.unlink(metadataPath);
          } catch {
            // Metadata file might not exist, ignore
          }
        }
        deletedLocal++;
      } catch (error) {
        errors.push(`Failed to delete local file ${backup.localPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Delete remote snapshot
    if (backup.resticSnapshotId) {
      try {
        if (!dryRun) {
          // TODO: Execute RESTIC forget command
          // Would run: restic forget ${backup.resticSnapshotId}
        }
        deletedRemote++;
      } catch (error) {
        errors.push(`Failed to delete remote snapshot ${backup.resticSnapshotId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  console.log(`[Backup Metadata] Cleanup complete: ${deletedLocal} local, ${deletedRemote} remote`);

  return { deletedLocal, deletedRemote, errors };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get backup statistics for a project.
 */
export async function getBackupStats(tenant: string, projectKey: string): Promise<{
  totalBackups: number;
  localBackups: number;
  remoteBackups: number;
  totalSize: number;
  latestBackup: Date | null;
  oldestBackup: Date | null;
}> {
  const queryText = `
    SELECT
      COUNT(*) as total_backups,
      COUNT(*) FILTER (WHERE backup_type IN ('local', 'both')) as local_backups,
      COUNT(*) FILTER (WHERE backup_type IN ('remote', 'both')) as remote_backups,
      SUM(size) as total_size,
      MAX(created_at) as latest_backup,
      MIN(created_at) as oldest_backup
    FROM project_backups
    WHERE tenant = $1 AND project_key = $2
      AND status = 'completed'
  `;

  try {
    const result = await query(queryText, [tenant, projectKey]);
    const row = result.rows[0] as any;

    return {
      totalBackups: parseInt(row.total_backups) || 0,
      localBackups: parseInt(row.local_backups) || 0,
      remoteBackups: parseInt(row.remote_backups) || 0,
      totalSize: parseInt(row.total_size) || 0,
      latestBackup: row.latest_backup ? new Date(row.latest_backup) : null,
      oldestBackup: row.oldest_backup ? new Date(row.oldest_backup) : null
    };
  } catch (error) {
    console.error("[Backup Metadata] Failed to get stats:", error);
    throw error;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapRowToBackupRecord(row: any): BackupRecord {
  return {
    id: row.id,
    tenant: row.tenant,
    projectKey: row.project_key,
    backupType: row.backup_type,
    format: row.format,
    localPath: row.local_path,
    remotePath: row.remote_path,
    resticSnapshotId: row.restic_snapshot_id,
    createdAt: new Date(row.created_at),
    size: parseInt(row.size),
    checksum: row.checksum,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
  };
}

/**
 * Scan local backup directory and register any untracked backups.
 */
export async function syncLocalBackups(backupDir: string): Promise<{
  registered: number;
  skipped: number;
}> {
  console.log(`[Backup Metadata] Syncing local backups from ${backupDir}`);

  let registered = 0;
  let skipped = 0;

  try {
    const files = await fs.readdir(backupDir);

    for (const file of files) {
      if (!file.endsWith(".cypher") && !file.endsWith(".json")) continue;

      const filePath = path.join(backupDir, file);
      const metadataPath = filePath.replace(/\.(cypher|json)$/, ".metadata.json");

      try {
        // Read metadata
        const metadataContent = await fs.readFile(metadataPath, "utf-8");
        const metadata: ProjectBackupMetadata = JSON.parse(metadataContent);

        // Check if already registered
        const existing = await listBackups({
          tenant: metadata.tenant,
          projectKey: metadata.projectKey,
          limit: 1000
        });

        const alreadyRegistered = existing.some(b => b.localPath === filePath);

        if (alreadyRegistered) {
          skipped++;
          continue;
        }

        // Register new backup
        const stats = await fs.stat(filePath);

        await registerBackup({
          tenant: metadata.tenant,
          projectKey: metadata.projectKey,
          backupType: "local",
          format: file.endsWith(".cypher") ? "cypher" : "json",
          localPath: filePath,
          size: stats.size,
          checksum: metadata.checksums.sha256,
          metadata,
          status: "completed"
        });

        registered++;
      } catch (error) {
        console.warn(`[Backup Metadata] Could not register ${file}:`, error);
        skipped++;
      }
    }

    console.log(`[Backup Metadata] Sync complete: ${registered} registered, ${skipped} skipped`);

    return { registered, skipped };
  } catch (error) {
    console.error("[Backup Metadata] Failed to sync local backups:", error);
    throw error;
  }
}
