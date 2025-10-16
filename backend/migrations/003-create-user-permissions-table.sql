-- Migration: Create user_permissions table
-- Purpose: RBAC permission grants at global, tenant, and project scopes
-- Date: 2025-10-16

-- Create user_permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('global', 'tenant', 'project')),
  scope_id VARCHAR(255),
  role VARCHAR(50) NOT NULL CHECK (role IN ('super-admin', 'tenant-admin', 'admin', 'approver', 'author', 'viewer')),
  is_owner BOOLEAN DEFAULT false,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  CONSTRAINT user_permissions_scope_check CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type = 'tenant' AND scope_id IS NOT NULL) OR
    (scope_type = 'project' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT user_permissions_global_role_check CHECK (
    (scope_type = 'global' AND role = 'super-admin') OR
    (scope_type != 'global')
  ),
  CONSTRAINT user_permissions_unique UNIQUE(user_id, scope_type, scope_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_scope ON user_permissions(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted_at ON user_permissions(granted_at DESC);

-- Add comments to table
COMMENT ON TABLE user_permissions IS 'RBAC permission grants for users at different scopes';

-- Add comments to columns
COMMENT ON COLUMN user_permissions.id IS 'Auto-increment primary key';
COMMENT ON COLUMN user_permissions.user_id IS 'User who receives this permission';
COMMENT ON COLUMN user_permissions.scope_type IS 'Permission scope: global, tenant, or project';
COMMENT ON COLUMN user_permissions.scope_id IS 'Identifier for tenant or project (NULL for global)';
COMMENT ON COLUMN user_permissions.role IS 'Role granted: super-admin, tenant-admin, admin, approver, author, or viewer';
COMMENT ON COLUMN user_permissions.is_owner IS 'Whether user owns this tenant/project (for tenant-admin and admin roles)';
COMMENT ON COLUMN user_permissions.granted_at IS 'Timestamp when permission was granted';
COMMENT ON COLUMN user_permissions.granted_by IS 'User ID who granted this permission';
