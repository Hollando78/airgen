-- Migration: Create users table
-- Purpose: Enterprise-grade user authentication and management
-- Date: 2025-10-16

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add comments to table
COMMENT ON TABLE users IS 'Core user accounts for authentication and authorization';

-- Add comments to columns
COMMENT ON COLUMN users.id IS 'Unique user identifier (UUID)';
COMMENT ON COLUMN users.email IS 'User email address (unique, used for login)';
COMMENT ON COLUMN users.name IS 'User display name';
COMMENT ON COLUMN users.password_hash IS 'Argon2id password hash';
COMMENT ON COLUMN users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN users.mfa_enabled IS 'Whether two-factor authentication is enabled';
COMMENT ON COLUMN users.mfa_secret IS 'Encrypted TOTP secret for 2FA';
COMMENT ON COLUMN users.created_at IS 'Timestamp when user account was created';
COMMENT ON COLUMN users.updated_at IS 'Timestamp when user account was last updated';
COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp (NULL = active)';
