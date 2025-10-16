/**
 * User Repository
 *
 * Database abstraction layer for user management.
 * Handles all user CRUD operations with PostgreSQL.
 */

import type { Pool } from "pg";
import { getPool } from "../lib/postgres.js";
import type { UserPermissions } from "../types/permissions.js";

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  passwordHash: string;
  emailVerified?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  name?: string | null;
  passwordHash?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
}

export interface UserFilters {
  email?: string;
  emailVerified?: boolean;
  includeDeleted?: boolean;
}

// ============================================================================
// User Repository
// ============================================================================

export class UserRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Find user by email (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    // Check for existing user with same email
    const existing = await this.findByEmail(input.email);
    if (existing) {
      const error = new Error("User with this email already exists");
      (error as NodeJS.ErrnoException).code = "EUSER_EXISTS";
      throw error;
    }

    const result = await this.pool.query(
      `INSERT INTO users (email, name, password_hash, email_verified, mfa_enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.email,
        input.name || null,
        input.passwordHash,
        input.emailVerified ?? false,
        false // mfaEnabled defaults to false
      ]
    );

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Update an existing user
   */
  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    // Check for email conflicts if email is being changed
    if (input.email && input.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.findByEmail(input.email);
      if (existing) {
        const error = new Error("User with this email already exists");
        (error as NodeJS.ErrnoException).code = "EUSER_EXISTS";
        throw error;
      }
    }

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.passwordHash !== undefined) {
      setClauses.push(`password_hash = $${paramIndex++}`);
      values.push(input.passwordHash);
    }

    if (input.emailVerified !== undefined) {
      setClauses.push(`email_verified = $${paramIndex++}`);
      values.push(input.emailVerified);
    }

    if (input.mfaEnabled !== undefined) {
      setClauses.push(`mfa_enabled = $${paramIndex++}`);
      values.push(input.mfaEnabled);
    }

    if (input.mfaSecret !== undefined) {
      setClauses.push(`mfa_secret = $${paramIndex++}`);
      values.push(input.mfaSecret);
    }

    // Add user ID as last parameter
    values.push(id);

    const result = await this.pool.query(
      `UPDATE users
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Soft delete a user
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    return result.rows.length > 0;
  }

  /**
   * List users with optional filters
   */
  async list(filters: UserFilters = {}): Promise<User[]> {
    const whereClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.email) {
      whereClauses.push(`LOWER(email) LIKE LOWER($${paramIndex++})`);
      values.push(`%${filters.email}%`);
    }

    if (filters.emailVerified !== undefined) {
      whereClauses.push(`email_verified = $${paramIndex++}`);
      values.push(filters.emailVerified);
    }

    if (!filters.includeDeleted) {
      whereClauses.push("deleted_at IS NULL");
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const result = await this.pool.query(
      `SELECT * FROM users
       ${whereClause}
       ORDER BY created_at DESC`,
      values
    );

    return result.rows.map(row => this.mapRowToUser(row));
  }

  /**
   * Mark user's email as verified
   */
  async markEmailVerified(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      `UPDATE users
       SET email_verified = true, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(result.rows[0]);
  }

  /**
   * Add MFA backup codes for a user
   */
  async addMfaBackupCodes(userId: string, codeHashes: string[]): Promise<void> {
    // First, delete any existing codes
    await this.pool.query(
      "DELETE FROM mfa_backup_codes WHERE user_id = $1",
      [userId]
    );

    // Insert new codes
    if (codeHashes.length > 0) {
      const values: string[] = [];
      const params: any[] = [];

      codeHashes.forEach((codeHash, index) => {
        const offset = index * 2;
        values.push(`($${offset + 1}, $${offset + 2})`);
        params.push(userId, codeHash);
      });

      await this.pool.query(
        `INSERT INTO mfa_backup_codes (user_id, code_hash)
         VALUES ${values.join(", ")}`,
        params
      );
    }
  }

  /**
   * Get user's unused MFA backup codes
   */
  async getMfaBackupCodes(userId: string): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT code_hash FROM mfa_backup_codes
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at`,
      [userId]
    );

    return result.rows.map(row => row.code_hash);
  }

  /**
   * Mark an MFA backup code as used
   */
  async markBackupCodeUsed(userId: string, codeHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE mfa_backup_codes
       SET used_at = NOW()
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
       RETURNING id`,
      [userId, codeHash]
    );

    return result.rows.length > 0;
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      emailVerified: row.email_verified,
      mfaEnabled: row.mfa_enabled,
      mfaSecret: row.mfa_secret,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined
    };
  }
}

// Export a singleton instance
export const userRepository = new UserRepository();
