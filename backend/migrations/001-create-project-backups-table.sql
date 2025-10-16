-- Migration: Create project_backups table
-- Purpose: Track project-level backups for recovery and retention management
-- Date: 2025-10-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create project_backups table
CREATE TABLE IF NOT EXISTS project_backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant VARCHAR(255) NOT NULL,
  project_key VARCHAR(255) NOT NULL,
  backup_type VARCHAR(10) NOT NULL CHECK (backup_type IN ('local', 'remote', 'both')),
  format VARCHAR(10) NOT NULL CHECK (format IN ('cypher', 'json')),
  local_path TEXT,
  remote_path TEXT,
  restic_snapshot_id VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  size BIGINT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  expires_at TIMESTAMP,
  CONSTRAINT project_backups_tenant_project_key_idx UNIQUE (tenant, project_key, created_at)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_backups_tenant_project ON project_backups(tenant, project_key);
CREATE INDEX IF NOT EXISTS idx_project_backups_created_at ON project_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_backups_status ON project_backups(status);
CREATE INDEX IF NOT EXISTS idx_project_backups_backup_type ON project_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_project_backups_restic_snapshot ON project_backups(restic_snapshot_id) WHERE restic_snapshot_id IS NOT NULL;

-- Create index on metadata JSONB for fast lookups
CREATE INDEX IF NOT EXISTS idx_project_backups_metadata_gin ON project_backups USING gin (metadata);

-- Add comment to table
COMMENT ON TABLE project_backups IS 'Tracks per-project backups for recovery and retention management';

-- Add comments to columns
COMMENT ON COLUMN project_backups.tenant IS 'Tenant identifier';
COMMENT ON COLUMN project_backups.project_key IS 'Project key within tenant';
COMMENT ON COLUMN project_backups.backup_type IS 'Storage type: local, remote, or both';
COMMENT ON COLUMN project_backups.format IS 'Backup format: cypher or json';
COMMENT ON COLUMN project_backups.local_path IS 'Local filesystem path to backup file';
COMMENT ON COLUMN project_backups.remote_path IS 'Remote storage path (S3, B2, etc)';
COMMENT ON COLUMN project_backups.restic_snapshot_id IS 'RESTIC snapshot identifier for remote backups';
COMMENT ON COLUMN project_backups.created_at IS 'Timestamp when backup was created';
COMMENT ON COLUMN project_backups.size IS 'Backup file size in bytes';
COMMENT ON COLUMN project_backups.checksum IS 'SHA-256 checksum of backup file';
COMMENT ON COLUMN project_backups.metadata IS 'Full backup metadata including stats and options';
COMMENT ON COLUMN project_backups.status IS 'Backup status: pending, completed, failed, or expired';
COMMENT ON COLUMN project_backups.expires_at IS 'Expiration timestamp for retention management';
