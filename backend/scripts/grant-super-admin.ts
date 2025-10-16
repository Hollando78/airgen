#!/usr/bin/env node
/**
 * Grant Super-Admin Role Script
 *
 * Grants Super-Admin role to a specific user.
 * This is a convenience script for promoting a user to Super-Admin.
 *
 * Usage:
 *   pnpm tsx backend/scripts/grant-super-admin.ts <email>
 *
 * Example:
 *   pnpm tsx backend/scripts/grant-super-admin.ts info@airgen.studio
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.js";
import type { DevUserRecord } from "../src/services/dev-users.js";
import { UserRole } from "../src/types/roles.js";
import type { UserPermissions } from "../src/types/permissions.js";

const USERS_FILE = join(config.workspaceRoot, "dev-users.json");

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
 * Grant Super-Admin role to a user
 */
async function grantSuperAdmin(email: string): Promise<void> {
  console.log("🔐 Grant Super-Admin Role\n");
  console.log(`Target user: ${email}`);
  console.log(`Users file: ${USERS_FILE}\n`);

  // Load users
  console.log("📖 Loading users...");
  const users = await loadUsers();
  console.log(`Found ${users.length} users\n`);

  // Find user by email
  const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (userIndex === -1) {
    throw new Error(`User not found: ${email}`);
  }

  const user = users[userIndex];
  console.log(`✓ Found user: ${user.email} (${user.id})`);
  console.log(`  Name: ${user.name ?? "N/A"}`);
  console.log(`  Created: ${user.createdAt}\n`);

  // Check if already Super-Admin
  if (user.permissions?.globalRole === UserRole.SUPER_ADMIN) {
    console.log("⊘ User is already Super-Admin\n");
    return;
  }

  // Check legacy roles
  if (user.roles?.some(r => r.toLowerCase() === 'super-admin')) {
    console.log("⊘ User already has super-admin in legacy roles");
    console.log("💡 Run the migration script to update to new permission structure\n");
    return;
  }

  // Grant Super-Admin
  console.log("🔧 Granting Super-Admin role...");
  const now = new Date().toISOString();

  const permissions: UserPermissions = {
    globalRole: UserRole.SUPER_ADMIN
  };

  users[userIndex] = {
    ...user,
    permissions,
    updatedAt: now
  };

  // Create backup
  const backupPath = `${USERS_FILE}.backup.${now.replace(/:/g, "-")}`;
  console.log(`Creating backup: ${backupPath}`);
  await fs.copyFile(USERS_FILE, backupPath);

  // Save updated users
  console.log("💾 Saving changes...");
  await saveUsers(users);

  console.log("\n✓ Super-Admin role granted successfully!\n");
  console.log("═".repeat(60));
  console.log("Updated permissions:");
  console.log("═".repeat(60));
  console.log(JSON.stringify(permissions, null, 2));
  console.log("═".repeat(60));
  console.log(`\nBackup: ${backupPath}\n`);
}

/**
 * Display usage information
 */
function showUsage(): void {
  console.log(`
Grant Super-Admin Role Script

Usage:
  pnpm tsx backend/scripts/grant-super-admin.ts <email>

Arguments:
  email    Email address of the user to promote to Super-Admin

Examples:
  pnpm tsx backend/scripts/grant-super-admin.ts info@airgen.studio
  pnpm tsx backend/scripts/grant-super-admin.ts admin@example.com

Notes:
  - A backup of the users file is created before making changes
  - If the user already has Super-Admin, no changes are made
  - If the user has legacy super-admin role, run the migration script instead
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const email = args[0];

  if (!email || !email.includes("@")) {
    console.error("❌ Invalid email address\n");
    showUsage();
    process.exit(1);
  }

  try {
    await grantSuperAdmin(email);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to grant Super-Admin:");
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
