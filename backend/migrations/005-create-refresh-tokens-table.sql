-- Migration: Create refresh_tokens table
-- Purpose: Track refresh tokens for session management and revocation
-- Date: 2025-10-16

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > created_at)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at) WHERE revoked_at IS NULL;

-- Add comments to table
COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for session management and revocation';

-- Add comments to columns
COMMENT ON COLUMN refresh_tokens.id IS 'Auto-increment primary key';
COMMENT ON COLUMN refresh_tokens.user_id IS 'User who owns this refresh token';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the refresh token';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'Token expiration timestamp';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Token revocation timestamp (NULL = active)';
COMMENT ON COLUMN refresh_tokens.created_at IS 'Timestamp when token was created';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'IP address where token was issued';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'User agent string where token was issued';
