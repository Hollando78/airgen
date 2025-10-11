import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import {
  hashPassword,
  verifyPassword,
  verifyLegacySHA256,
  verifyLegacyScrypt
} from "../lib/password.js";

export type DevUserRecord = {
  id: string;
  email: string;
  name?: string;
  password?: string;        // Legacy SHA256 hash (deprecated)
  passwordHash?: string;    // Legacy scrypt hash or Argon2id hash
  passwordSalt?: string;    // Legacy scrypt salt (deprecated)
  emailVerified?: boolean;  // Email verification status
  roles: string[];
  tenantSlugs: string[];
  createdAt: string;
  updatedAt: string;
};

const USERS_FILE = join(config.workspaceRoot, "dev-users.json");

async function ensureDirectory(): Promise<void> {
  await fs.mkdir(dirname(USERS_FILE), { recursive: true });
}

async function loadUsers(): Promise<DevUserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw) as DevUserRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveUsers(users: DevUserRecord[]): Promise<void> {
  await ensureDirectory();
  await fs.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

export async function listDevUsers(): Promise<DevUserRecord[]> {
  const users = await loadUsers();
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

type CreateDevUserInput = {
  email: string;
  name?: string;
  password?: string;
  roles?: string[];
  tenantSlugs?: string[];
};

/**
 * Apply Argon2id hash to a user record.
 * Clears legacy password fields.
 */
async function applyArgon2Hash(record: DevUserRecord, password: string): Promise<void> {
  const hash = await hashPassword(password);
  record.passwordHash = hash;
  // Clear legacy fields
  delete record.password;
  delete record.passwordSalt;
}

/**
 * Verify a user's password against stored hashes.
 * Supports Argon2id, legacy scrypt, and legacy SHA256.
 *
 * Priority order:
 * 1. Argon2id (passwordHash without passwordSalt)
 * 2. Scrypt (passwordHash with passwordSalt)
 * 3. SHA256 (password field)
 */
export async function verifyDevUserPassword(
  user: DevUserRecord,
  candidate: string
): Promise<boolean> {
  // Check Argon2id hash (no salt field = Argon2id)
  if (user.passwordHash && !user.passwordSalt) {
    return verifyPassword(user.passwordHash, candidate);
  }

  // Check legacy scrypt hash (has both hash and salt)
  if (user.passwordHash && user.passwordSalt) {
    return verifyLegacyScrypt(user.passwordHash, user.passwordSalt, candidate);
  }

  // Check legacy SHA256 hash (deprecated)
  if (user.password) {
    return verifyLegacySHA256(user.password, candidate);
  }

  return false;
}

/**
 * Migrate a user's password to Argon2id if they have legacy hashes.
 * This is called after successful authentication.
 */
async function migrateLegacyPasswordIfNeeded(userId: string, plainPassword: string): Promise<void> {
  const users = await loadUsers();
  const index = users.findIndex(user => user.id === userId);
  if (index === -1) {
    return;
  }

  const target = users[index];

  // Skip if already using Argon2id (passwordHash exists without passwordSalt)
  if (target.passwordHash && !target.passwordSalt && !target.password) {
    return;
  }

  // Upgrade to Argon2id
  await applyArgon2Hash(target, plainPassword);
  target.updatedAt = new Date().toISOString();
  users[index] = target;
  await saveUsers(users);
}

/**
 * Ensure a user's password is upgraded to Argon2id after successful authentication.
 * Call this after verifying the password.
 */
export async function ensureLegacyPasswordUpgrade(
  user: DevUserRecord,
  plainPassword: string
): Promise<void> {
  // Upgrade if using legacy SHA256 or scrypt
  const needsUpgrade =
    user.password || // Has legacy SHA256
    (user.passwordHash && user.passwordSalt); // Has legacy scrypt

  if (needsUpgrade) {
    await migrateLegacyPasswordIfNeeded(user.id, plainPassword);
  }
}

export async function createDevUser(input: CreateDevUserInput): Promise<DevUserRecord> {
  const users = await loadUsers();
  const emailLower = input.email.toLowerCase();
  if (users.some(user => user.email.toLowerCase() === emailLower)) {
    const error = new Error("User with this email already exists");
    (error as NodeJS.ErrnoException).code = "EUSER_EXISTS";
    throw error;
  }

  const now = new Date().toISOString();
  const record: DevUserRecord = {
    id: randomUUID(),
    email: input.email,
    name: input.name,
    roles: Array.isArray(input.roles) && input.roles.length ? input.roles : ["user"],
    tenantSlugs: Array.isArray(input.tenantSlugs) ? input.tenantSlugs : [],
    createdAt: now,
    updatedAt: now
  };

  if (input.password) {
    await applyArgon2Hash(record, input.password);
  }

  users.push(record);
  await saveUsers(users);
  return record;
}

type UpdateDevUserInput = {
  email?: string;
  name?: string | null;
  password?: string;
  roles?: string[];
  tenantSlugs?: string[];
};

export async function updateDevUser(id: string, input: UpdateDevUserInput): Promise<DevUserRecord | null> {
  const users = await loadUsers();
  const index = users.findIndex(user => user.id === id);
  if (index === -1) {
    return null;
  }

  const user = users[index];

  if (input.email && input.email.toLowerCase() !== user.email.toLowerCase()) {
    const emailLower = input.email.toLowerCase();
    if (users.some(candidate => candidate.id !== id && candidate.email.toLowerCase() === emailLower)) {
      const error = new Error("User with this email already exists");
      (error as NodeJS.ErrnoException).code = "EUSER_EXISTS";
      throw error;
    }
    user.email = input.email;
  }

  if (typeof input.name !== "undefined") {
    user.name = input.name ?? undefined;
  }

  if (input.password) {
    await applyArgon2Hash(user, input.password);
  }

  if (Array.isArray(input.roles)) {
    user.roles = input.roles.length ? input.roles : ["user"];
  }

  if (Array.isArray(input.tenantSlugs)) {
    user.tenantSlugs = input.tenantSlugs;
  }

  user.updatedAt = new Date().toISOString();
  users[index] = user;
  await saveUsers(users);
  return user;
}

export async function deleteDevUser(id: string): Promise<boolean> {
  const users = await loadUsers();
  const next = users.filter(user => user.id !== id);
  if (next.length === users.length) {
    return false;
  }
  await saveUsers(next);
  return true;
}

export async function getDevUser(id: string): Promise<DevUserRecord | null> {
  const users = await loadUsers();
  return users.find(user => user.id === id) ?? null;
}

/**
 * Mark a user's email as verified
 */
export async function markEmailVerified(userId: string): Promise<DevUserRecord | null> {
  const users = await loadUsers();
  const index = users.findIndex(user => user.id === userId);
  if (index === -1) {
    return null;
  }

  const user = users[index];
  user.emailVerified = true;
  user.updatedAt = new Date().toISOString();

  users[index] = user;
  await saveUsers(users);
  return user;
}

/**
 * Get user by email
 */
export async function getDevUserByEmail(email: string): Promise<DevUserRecord | null> {
  const users = await loadUsers();
  return users.find(user => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}
