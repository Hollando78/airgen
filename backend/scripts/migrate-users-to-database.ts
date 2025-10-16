#!/usr/bin/env node
/**
 * Migrate existing file-based users to PostgreSQL database
 *
 * This script:
 * 1. Reads users from dev-users.json
 * 2. Creates them in the users table
 * 3. Converts legacy roles/tenantSlugs to new permissions structure
 * 4. Creates a backup of the original file
 * 5. Optionally grants Super-Admin to specified user
 *
 * Usage:
 *   npx tsx scripts/migrate-users-to-database.ts [--grant-super-admin EMAIL]
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.js";
import { UserRepository } from "../src/repositories/UserRepository.js";
import { PermissionRepository } from "../src/repositories/PermissionRepository.js";
import { UserRole } from "../src/types/roles.js";
import { closePool } from "../src/lib/postgres.js";
import type { DevUserRecord } from "../src/services/dev-users.js";

const USERS_FILE = join(config.workspaceRoot, "dev-users.json");

// Parse command line arguments
const args = process.argv.slice(2);
const grantSuperAdminIndex = args.indexOf("--grant-super-admin");
const superAdminEmail = grantSuperAdminIndex !== -1 ? args[grantSuperAdminIndex + 1] : null;

async function loadUsersFromFile(): Promise<DevUserRecord[]> {
  console.log(`\n📂 Reading users from: ${USERS_FILE}`);

  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const users = JSON.parse(raw) as DevUserRecord[];

    if (!Array.isArray(users)) {
      throw new Error("Invalid users file format: expected an array");
    }

    console.log(`✅ Found ${users.length} user(s) to migrate\n`);
    return users;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`❌ File not found: ${USERS_FILE}`);
    } else {
      console.error(`❌ Failed to read users file:`, error);
    }
    throw error;
  }
}

async function createBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  const backupPath = `${USERS_FILE}.backup.${timestamp}`;

  console.log(`\n💾 Creating backup: ${backupPath}`);
  await fs.copyFile(USERS_FILE, backupPath);
  console.log(`✅ Backup created\n`);

  return backupPath;
}

/**
 * Map legacy roles to new RBAC roles
 * - If user has "admin" role → Tenant-Admin for their tenants
 * - If user has "approver" role → Approver for their tenants
 * - If user has "author" role → Author for their tenants
 * - Default → Viewer for their tenants
 */
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

async function migrateUsers(dryRun = false): Promise<void> {
  const userRepo = new UserRepository();
  const permRepo = new PermissionRepository();

  // Load users from file
  const fileUsers = await loadUsersFromFile();

  // Create backup
  if (!dryRun) {
    await createBackup();
  }

  console.log(`\n${dryRun ? "🔍 DRY RUN MODE - No changes will be made" : "🚀 Starting migration..."}\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const fileUser of fileUsers) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📧 Processing: ${fileUser.email} (${fileUser.name || "no name"})`);
    console.log(`${"=".repeat(70)}`);

    try {
      // Check if user already exists in database
      const existing = await userRepo.findByEmail(fileUser.email);

      if (existing) {
        console.log(`⚠️  User already exists in database (ID: ${existing.id})`);
        console.log(`   Skipping migration for this user`);
        skippedCount++;
        continue;
      }

      if (!fileUser.passwordHash) {
        console.log(`⚠️  User has no password hash - skipping`);
        errors.push({ email: fileUser.email, error: "No password hash" });
        continue;
      }

      // Create user in database
      console.log(`\n1️⃣  Creating user record...`);
      if (dryRun) {
        console.log(`   [DRY RUN] Would create user with:`);
        console.log(`   - Email: ${fileUser.email}`);
        console.log(`   - Name: ${fileUser.name || "(none)"}`);
        console.log(`   - Email Verified: ${fileUser.emailVerified ?? false}`);
        console.log(`   - MFA Enabled: ${fileUser.mfaEnabled ?? false}`);
      } else {
        const newUser = await userRepo.create({
          email: fileUser.email,
          name: fileUser.name,
          passwordHash: fileUser.passwordHash,
          emailVerified: fileUser.emailVerified ?? false
        });

        console.log(`   ✅ User created with ID: ${newUser.id}`);

        // Handle MFA settings
        if (fileUser.mfaEnabled && fileUser.mfaSecret) {
          await userRepo.update(newUser.id, {
            mfaEnabled: true,
            mfaSecret: fileUser.mfaSecret
          });
          console.log(`   ✅ MFA settings migrated`);
        }

        // Handle MFA backup codes
        if (fileUser.mfaBackupCodes && fileUser.mfaBackupCodes.length > 0) {
          await userRepo.addMfaBackupCodes(newUser.id, fileUser.mfaBackupCodes);
          console.log(`   ✅ ${fileUser.mfaBackupCodes.length} MFA backup codes migrated`);
        }

        // Determine RBAC role from legacy roles
        const role = mapLegacyRoleToRBAC(fileUser.roles || []);

        console.log(`\n2️⃣  Migrating permissions...`);
        console.log(`   Legacy roles: ${fileUser.roles.join(", ")}`);
        console.log(`   Mapped to: ${role}`);

        // Grant tenant permissions
        const tenantSlugs = fileUser.tenantSlugs || [];
        const ownedTenantSlugs = fileUser.ownedTenantSlugs || [];

        if (tenantSlugs.length > 0) {
          for (const tenantSlug of tenantSlugs) {
            const isOwner = ownedTenantSlugs.includes(tenantSlug);

            await permRepo.grantPermission({
              userId: newUser.id,
              scopeType: "tenant",
              scopeId: tenantSlug,
              role: role,
              isOwner: isOwner
            });

            console.log(`   ✅ Granted ${role} for tenant: ${tenantSlug}${isOwner ? " (owner)" : ""}`);
          }
        } else {
          console.log(`   ℹ️  No tenant permissions to migrate`);
        }
      }

      migratedCount++;
      console.log(`\n✅ Migration successful for ${fileUser.email}`);
    } catch (error) {
      console.error(`\n❌ Failed to migrate ${fileUser.email}:`, error);
      errors.push({
        email: fileUser.email,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Grant Super-Admin if requested
  if (superAdminEmail && !dryRun) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`👑 Granting Super-Admin to: ${superAdminEmail}`);
    console.log(`${"=".repeat(70)}`);

    try {
      const user = await userRepo.findByEmail(superAdminEmail);

      if (!user) {
        console.error(`❌ User not found: ${superAdminEmail}`);
      } else {
        await permRepo.grantPermission({
          userId: user.id,
          scopeType: "global",
          role: UserRole.SUPER_ADMIN
        });

        console.log(`✅ Super-Admin granted to ${superAdminEmail} (${user.id})`);
      }
    } catch (error) {
      console.error(`❌ Failed to grant Super-Admin:`, error);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 Migration Summary`);
  console.log(`${"=".repeat(70)}`);
  console.log(`✅ Migrated: ${migratedCount}`);
  console.log(`⏭️  Skipped:  ${skippedCount}`);
  console.log(`❌ Errors:   ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const error of errors) {
      console.log(`  - ${error.email}: ${error.error}`);
    }
  }

  console.log("");
}

async function main() {
  try {
    const dryRun = args.includes("--dry-run");

    if (dryRun) {
      console.log("\n🔍 DRY RUN MODE - No changes will be made\n");
    }

    await migrateUsers(dryRun);

    if (!dryRun && superAdminEmail) {
      console.log(`\n✅ Migration complete! Super-Admin granted to ${superAdminEmail}`);
    } else if (!dryRun) {
      console.log(`\n✅ Migration complete!`);
    } else {
      console.log(`\n✅ Dry run complete! Run without --dry-run to perform actual migration.`);
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
