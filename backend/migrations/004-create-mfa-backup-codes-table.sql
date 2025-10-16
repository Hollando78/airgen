-- Migration: Create mfa_backup_codes table
-- Purpose: Store hashed backup codes for two-factor authentication recovery
-- Date: 2025-10-16

-- Create mfa_backup_codes table
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_used_at ON mfa_backup_codes(used_at) WHERE used_at IS NULL;

-- Add comments to table
COMMENT ON TABLE mfa_backup_codes IS 'Hashed backup codes for 2FA recovery';

-- Add comments to columns
COMMENT ON COLUMN mfa_backup_codes.id IS 'Auto-increment primary key';
COMMENT ON COLUMN mfa_backup_codes.user_id IS 'User who owns this backup code';
COMMENT ON COLUMN mfa_backup_codes.code_hash IS 'SHA-256 hash of the backup code';
COMMENT ON COLUMN mfa_backup_codes.used_at IS 'Timestamp when code was used (NULL = unused)';
COMMENT ON COLUMN mfa_backup_codes.created_at IS 'Timestamp when code was generated';
