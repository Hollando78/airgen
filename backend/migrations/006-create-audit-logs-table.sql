-- Migration: Create audit_logs table
-- Purpose: Track all security-sensitive operations and permission changes
-- Date: 2025-10-16

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id) WHERE resource_type IS NOT NULL;

-- Create index on JSONB details for fast lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING gin (details);

-- Add comments to table
COMMENT ON TABLE audit_logs IS 'Audit trail for security-sensitive operations';

-- Add comments to columns
COMMENT ON COLUMN audit_logs.id IS 'Auto-increment primary key';
COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL for system actions)';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., login, grant_permission, revoke_permission)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., user, tenant, project)';
COMMENT ON COLUMN audit_logs.resource_id IS 'Identifier of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional details about the action (JSON)';
COMMENT ON COLUMN audit_logs.ip_address IS 'IP address where action was performed';
COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp when action was performed';
