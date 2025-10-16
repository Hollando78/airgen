#!/usr/bin/env node
/**
 * Deploy User Database - All-in-one script
 *
 * This script:
 * 1. Runs PostgreSQL schema migrations
 * 2. Migrates existing users from dev-users.json to database
 * 3. Grants Super-Admin to info@airgen.studio
 * 4. Displays summary
 *
 * Usage:
 *   npx tsx scripts/deploy-user-database.ts
 *   npx tsx scripts/deploy-user-database.ts --dry-run
 */

import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { getPool, closePool } from "../src/lib/postgres.js";
import { UserRepository } from "../src/repositories/UserRepository.js";
import { PermissionRepository } from "../src/repositories/PermissionRepository.js";
import { UserRole } from "../src/types/roles.js";
import type { DevUserRecord } from "../src/services/dev-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "../migrations");
const USERS_FILE = join(config.workspaceRoot, "dev-users.json");

const dryRun = process.argv.includes("--dry-run");

// ============================================================================
// Step 1: Run Schema Migrations
// ============================================================================

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT filename FROM schema_migrations ORDER BY id"
  );
  return new Set(result.rows.map(row => row.filename));
}

async function getAllMigrationFiles(): Promise<string[]> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter(f => f.endsWith(".sql"))
    .sort(); // Lexicographic sort ensures 001, 002, 003 order
}

async function runMigrationFile(filename: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename);
  console.log(`  📄 Running migration: ${filename}`);

  const sql = await fs.readFile(filePath, "utf-8");
  const pool = getPool();

  if (!dryRun) {
    // Execute the SQL file
    await pool.query(sql);

    // Record the migration
    await pool.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
  } else {
    console.log(`     [DRY RUN] Would execute SQL migration`);
  }

  console.log(`  ✅ Migration ${filename} completed`);
}

async function runPendingMigrations(): Promise<number> {
  console.log("\n📦 Step 1: Running PostgreSQL Schema Migrations");
  console.log("=".repeat(70));

  await ensureMigrationsTable();

  const allFiles = await getAllMigrationFiles();
  const applied = await getAppliedMigrations();

  const pending = allFiles.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log("  ✅ All migrations already applied\n");
    return 0;
  }

  console.log(`  🚀 Found ${pending.length} pending migration(s)\n`);

  for (const file of pending) {
    await runMigrationFile(file);
  }

  console.log(`\n  ✅ ${pending.length} migration(s) applied successfully\n`);
  return pending.length;
}

// ============================================================================
// Step 2: Migrate Existing Users
// ============================================================================

function mapLegacyRoleToRBAC(legacyRoles: string[]): UserRole {
  if (legacyRoles.includes("admin")) {
    return UserRole.TENANT_ADMIN;
  }
  if (legacyRoles.includes("approver")) {
    return UserRole.APPROVER;
  }
  if (legacyRoles.includes("author")) {
    return UserRole.AUTHOR;
  }
  return UserRole.VIEWER;
}

async function loadUsersFromFile(): Promise<DevUserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const users = JSON.parse(raw) as DevUserRecord[];

    if (!Array.isArray(users)) {
      throw new Error("Invalid users file format: expected an array");
    }

    return users;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`  ℹ️  No users file found at ${USERS_FILE}`);
      return [];
    }
    throw error;
  }
}

async function migrateUsers(): Promise<{ migrated: number; skipped: number }> {
  console.log("\n📦 Step 2: Migrating Existing Users");
  console.log("=".repeat(70));

  const userRepo = new UserRepository();
  const permRepo = new PermissionRepository();

  const fileUsers = await loadUsersFromFile();

  if (fileUsers.length === 0) {
    console.log("  ℹ️  No users to migrate\n");
    return { migrated: 0, skipped: 0 };
  }

  console.log(`  📂 Found ${fileUsers.length} user(s) in file\n`);

  let migrated = 0;
  let skipped = 0;

  for (const fileUser of fileUsers) {
    console.log(`  📧 ${fileUser.email}...`);

    try {
      // Check if user already exists in database
      const existing = await userRepo.findByEmail(fileUser.email);

      if (existing) {
        console.log(`     ⏭️  Already exists (ID: ${existing.id})`);
        skipped++;
        continue;
      }

      if (!fileUser.passwordHash) {
        console.log(`     ⚠️  No password hash - skipping`);
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`     [DRY RUN] Would create user and grant permissions`);
        migrated++;
        continue;
      }

      // Create user in database
      const newUser = await userRepo.create({
        email: fileUser.email,
        name: fileUser.name,
        passwordHash: fileUser.passwordHash,
        emailVerified: fileUser.emailVerified ?? false
      });

      // Handle MFA settings
      if (fileUser.mfaEnabled && fileUser.mfaSecret) {
        await userRepo.update(newUser.id, {
          mfaEnabled: true,
          mfaSecret: fileUser.mfaSecret
        });
      }

      // Handle MFA backup codes
      if (fileUser.mfaBackupCodes && fileUser.mfaBackupCodes.length > 0) {
        await userRepo.addMfaBackupCodes(newUser.id, fileUser.mfaBackupCodes);
      }

      // Determine RBAC role from legacy roles
      const role = mapLegacyRoleToRBAC(fileUser.roles || []);

      // Grant tenant permissions
      const tenantSlugs = fileUser.tenantSlugs || [];
      const ownedTenantSlugs = fileUser.ownedTenantSlugs || [];

      for (const tenantSlug of tenantSlugs) {
        const isOwner = ownedTenantSlugs.includes(tenantSlug);

        await permRepo.grantPermission({
          userId: newUser.id,
          scopeType: "tenant",
          scopeId: tenantSlug,
          role: role,
          isOwner: isOwner
        });
      }

      console.log(`     ✅ Migrated with ${tenantSlugs.length} tenant permission(s)`);
      migrated++;
    } catch (error) {
      console.error(`     ❌ Failed:`, error instanceof Error ? error.message : String(error));
      skipped++;
    }
  }

  console.log(`\n  📊 Migrated: ${migrated}, Skipped: ${skipped}\n`);
  return { migrated, skipped };
}

// ============================================================================
// Step 3: Grant Super-Admin
// ============================================================================

async function grantSuperAdmin(): Promise<boolean> {
  console.log("\n📦 Step 3: Granting Super-Admin to info@airgen.studio");
  console.log("=".repeat(70));

  const userRepo = new UserRepository();
  const permRepo = new PermissionRepository();

  const targetEmail = "info@airgen.studio";

  try {
    const user = await userRepo.findByEmail(targetEmail);

    if (!user) {
      console.log(`  ❌ User not found: ${targetEmail}`);
      console.log(`     Make sure the user has been migrated first\n`);
      return false;
    }

    // Check if already super-admin
    const isSuperAdmin = await permRepo.isSuperAdmin(user.id);

    if (isSuperAdmin) {
      console.log(`  ℹ️  User already has Super-Admin permissions\n`);
      return true;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would grant Super-Admin to ${targetEmail}`);
      return true;
    }

    // Grant Super-Admin
    await permRepo.grantPermission({
      userId: user.id,
      scopeType: "global",
      role: UserRole.SUPER_ADMIN
    });

    console.log(`  ✅ Super-Admin granted to ${targetEmail} (${user.id})\n`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to grant Super-Admin:`, error);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 User Database Deployment");
  console.log("=".repeat(70));

  if (dryRun) {
    console.log("\n🔍 DRY RUN MODE - No changes will be made\n");
  }

  try {
    // Step 1: Run migrations
    const migrationsRun = await runPendingMigrations();

    // Step 2: Migrate users
    const { migrated, skipped } = await migrateUsers();

    // Step 3: Grant Super-Admin
    const superAdminGranted = await grantSuperAdmin();

    // Summary
    console.log("=".repeat(70));
    console.log("📊 Deployment Summary");
    console.log("=".repeat(70));
    console.log(`  Schema Migrations:  ${migrationsRun} applied`);
    console.log(`  Users Migrated:     ${migrated}`);
    console.log(`  Users Skipped:      ${skipped}`);
    console.log(`  Super-Admin Grant:  ${superAdminGranted ? "✅ Success" : "❌ Failed"}`);
    console.log("");

    if (dryRun) {
      console.log("✅ Dry run complete! Run without --dry-run to apply changes.\n");
    } else if (superAdminGranted) {
      console.log("✅ Deployment complete! Database is ready for use.\n");
    } else {
      console.log("⚠️  Deployment completed with warnings. Check Super-Admin grant status.\n");
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
