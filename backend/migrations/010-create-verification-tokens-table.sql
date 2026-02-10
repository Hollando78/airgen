-- Migration 010: Create verification_tokens table
-- Moves token storage from in-memory Map to PostgreSQL for persistence across restarts

CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hashed_token TEXT NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMP
);

-- Fast lookup by hashed token (primary query path)
CREATE UNIQUE INDEX idx_verification_tokens_hashed ON verification_tokens (hashed_token);

-- Cleanup queries by expiry and user
CREATE INDEX idx_verification_tokens_expires ON verification_tokens (expires_at);
CREATE INDEX idx_verification_tokens_user ON verification_tokens (user_id, purpose);
