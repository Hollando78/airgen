#!/usr/bin/env node
/**
 * User Permissions Migration Script
 *
 * Migrates users from legacy permission structure to new RBAC system.
 *
 * Legacy structure:
 * - roles: string[]
 * - tenantSlugs: string[]
 * - ownedTenantSlugs: string[]
 *
 * New structure:
 * - permissions: {
 *     globalRole?: UserRole.SUPER_ADMIN
 *     tenantPermissions?: { [slug]: { role, isOwner, grantedAt } }
 *     projectPermissions?: { [tenant]: { [project]: { role, grantedAt } } }
 *   }
 *
 * Usage:
 *   pnpm tsx backend/scripts/migrate-user-permissions.ts [--dry-run] [--backup]
 *
 * Options:
 *   --dry-run     Preview changes without modifying files
 *   --backup      Create a backup before modifying (default: true)
 *   --no-backup   Skip backup creation
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.js";
import type { DevUserRecord } from "../src/services/dev-users.js";
import { UserRole } from "../src/types/roles.js";
import type { UserPermissions } from "../src/types/permissions.js";

const USERS_FILE = join(config.workspaceRoot, "dev-users.json");
const BACKUP_SUFFIX = `.backup.${new Date().toISOString().replace(/:/g, "-")}`;

interface MigrationStats {
  total: number;
  migrated: number;
  alreadyMigrated: number;
  skipped: number;
  errors: string[];
}

/**
 * Migrate a single user from legacy to new permission structure
 */
function migrateUserPermissions(user: DevUserRecord, migrationDate: string): { migrated: boolean; permissions?: UserPermissions } {
  // Skip if user already has new permissions structure
  if (user.permissions && Object.keys(user.permissions).length > 0) {
    return { migrated: false };
  }

  const permissions: UserPermissions = {};
  let hasMigrated = false;

  // Check for super-admin in legacy roles
  if (user.roles?.some(r => r.toLowerCase() === 'super-admin')) {
    permissions.globalRole = UserRole.SUPER_ADMIN;
    hasMigrated = true;
    console.log(`  → Found super-admin role for ${user.email}`);
    return { migrated: true, permissions };
  }

  // Convert tenantSlugs to tenant permissions
  if (user.tenantSlugs && user.tenantSlugs.length > 0) {
    permissions.tenantPermissions = {};
    hasMigrated = true;

    for (const tenantSlug of user.tenantSlugs) {
      const isOwner = user.ownedTenantSlugs?.includes(tenantSlug) ?? false;

      // Determine role from legacy data
      let role: UserRole;
      if (isOwner) {
        role = UserRole.TENANT_ADMIN; // Owners become tenant-admins
        console.log(`  → ${user.email}: ${tenantSlug} (Tenant-Admin, owner)`);
      } else if (user.roles?.includes('admin')) {
        role = UserRole.ADMIN; // Admin role → Project Admin
        console.log(`  → ${user.email}: ${tenantSlug} (Admin)`);
      } else {
        role = UserRole.AUTHOR; // Default to author
        console.log(`  → ${user.email}: ${tenantSlug} (Author)`);
      }

      permissions.tenantPermissions[tenantSlug] = {
        role,
        isOwner,
        grantedAt: migrationDate
      };
    }
  }

  return { migrated: hasMigrated, permissions: hasMigrated ? permissions : undefined };
}

/**
 * Create a backup of the users file
 */
async function createBackup(): Promise<string> {
  const backupPath = `${USERS_FILE}${BACKUP_SUFFIX}`;
  try {
    await fs.copyFile(USERS_FILE, backupPath);
    console.log(`✓ Backup created: ${backupPath}\n`);
    return backupPath;
  } catch (error) {
    throw new Error(`Failed to create backup: ${(error as Error).message}`);
  }
}

/**
 * Load users from file
 */
async function loadUsers(): Promise<DevUserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as DevUserRecord[];
    if (!Array.isArray(parsed)) {
      throw new Error("Users file does not contain an array");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Users file not found: ${USERS_FILE}`);
    }
    throw error;
  }
}

/**
 * Save users to file
 */
async function saveUsers(users: DevUserRecord[]): Promise<void> {
  await fs.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

/**
 * Main migration function
 */
async function migrate(options: { dryRun: boolean; backup: boolean }): Promise<void> {
  console.log("🔄 User Permissions Migration Script\n");
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`);
  console.log(`Users file: ${USERS_FILE}\n`);

  // Load users
  console.log("📖 Loading users...");
  const users = await loadUsers();
  console.log(`Found ${users.length} users\n`);

  if (users.length === 0) {
    console.log("✓ No users to migrate\n");
    return;
  }

  // Create backup if not dry-run and backup enabled
  if (!options.dryRun && options.backup) {
    await createBackup();
  }

  // Migrate users
  console.log("🔧 Migrating users...\n");
  const migrationDate = new Date().toISOString();
  const stats: MigrationStats = {
    total: users.length,
    migrated: 0,
    alreadyMigrated: 0,
    skipped: 0,
    errors: []
  };

  const migratedUsers: DevUserRecord[] = [];

  for (const user of users) {
    console.log(`Processing: ${user.email} (${user.id})`);

    try {
      const result = migrateUserPermissions(user, migrationDate);

      if (result.migrated && result.permissions) {
        // Update user with new permissions
        const updatedUser: DevUserRecord = {
          ...user,
          permissions: result.permissions,
          updatedAt: migrationDate
        };
        migratedUsers.push(updatedUser);
        stats.migrated++;
        console.log(`  ✓ Migrated\n`);
      } else if (user.permissions) {
        // Already has new permissions
        migratedUsers.push(user);
        stats.alreadyMigrated++;
        console.log(`  ⊘ Already migrated\n`);
      } else {
        // No permissions to migrate (e.g., no tenants)
        migratedUsers.push(user);
        stats.skipped++;
        console.log(`  ⊘ No permissions to migrate\n`);
      }
    } catch (error) {
      const errorMsg = `Failed to migrate ${user.email}: ${(error as Error).message}`;
      stats.errors.push(errorMsg);
      console.error(`  ✗ ${errorMsg}\n`);
      migratedUsers.push(user); // Keep original user
    }
  }

  // Save migrated users (if not dry-run)
  if (!options.dryRun) {
    console.log("💾 Saving migrated users...");
    await saveUsers(migratedUsers);
    console.log("✓ Users saved\n");
  } else {
    console.log("⊘ Dry run - no changes saved\n");
  }

  // Print summary
  console.log("═".repeat(60));
  console.log("📊 Migration Summary");
  console.log("═".repeat(60));
  console.log(`Total users:         ${stats.total}`);
  console.log(`Migrated:            ${stats.migrated} ✓`);
  console.log(`Already migrated:    ${stats.alreadyMigrated}`);
  console.log(`Skipped:             ${stats.skipped}`);
  console.log(`Errors:              ${stats.errors.length}`);
  console.log("═".repeat(60));

  if (stats.errors.length > 0) {
    console.log("\n⚠️  Errors:");
    for (const error of stats.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (options.dryRun && stats.migrated > 0) {
    console.log("\n💡 Run without --dry-run to apply changes");
  }

  if (!options.dryRun && stats.migrated > 0) {
    console.log("\n✓ Migration completed successfully!");
    if (options.backup) {
      console.log(`  Backup available at: ${USERS_FILE}${BACKUP_SUFFIX}`);
    }
  }

  console.log();
}

/**
 * Parse command line arguments
 */
function parseArgs(): { dryRun: boolean; backup: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    backup: !args.includes("--no-backup")
  };
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log(`
User Permissions Migration Script

Usage:
  pnpm tsx backend/scripts/migrate-user-permissions.ts [options]

Options:
  --dry-run     Preview changes without modifying files
  --backup      Create a backup before modifying (default)
  --no-backup   Skip backup creation
  --help        Show this help message

Examples:
  # Preview migration without making changes
  pnpm tsx backend/scripts/migrate-user-permissions.ts --dry-run

  # Run migration with backup (default)
  pnpm tsx backend/scripts/migrate-user-permissions.ts

  # Run migration without backup (not recommended)
  pnpm tsx backend/scripts/migrate-user-permissions.ts --no-backup
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  const options = parseArgs();

  try {
    await migrate(options);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error((error as Error).message);
    if ((error as Error).stack) {
      console.error("\nStack trace:");
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
