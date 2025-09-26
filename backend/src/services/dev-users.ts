import { promises as fs } from "node:fs";
import {
  randomUUID,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.js";

export type DevUserRecord = {
  id: string;
  email: string;
  name?: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
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

type DerivedPassword = { hash: string; salt: string };

function derivePassword(password: string): DerivedPassword {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function applyDerivedPassword(record: DevUserRecord, password: string): void {
  const { hash, salt } = derivePassword(password);
  record.passwordHash = hash;
  record.passwordSalt = salt;
  if (record.password) {
    delete record.password;
  }
}

function safeEqualHex(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyDevUserPassword(user: DevUserRecord, candidate: string): boolean {
  if (user.passwordHash && user.passwordSalt) {
    const derived = scryptSync(candidate, user.passwordSalt, 64).toString("hex");
    return safeEqualHex(user.passwordHash, derived);
  }

  if (user.password) {
    const legacy = createHash("sha256").update(candidate).digest("hex");
    return safeEqualHex(user.password, legacy);
  }

  return false;
}

async function migrateLegacyPasswordIfNeeded(userId: string, plainPassword: string): Promise<void> {
  const users = await loadUsers();
  const index = users.findIndex(user => user.id === userId);
  if (index === -1) {
    return;
  }

  const target = users[index];
  if (!target.password || (target.passwordHash && target.passwordSalt)) {
    return;
  }

  applyDerivedPassword(target, plainPassword);
  target.updatedAt = new Date().toISOString();
  users[index] = target;
  await saveUsers(users);
}

export async function ensureLegacyPasswordUpgrade(
  user: DevUserRecord,
  plainPassword: string
): Promise<void> {
  if (user.password && (!user.passwordHash || !user.passwordSalt)) {
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
    applyDerivedPassword(record, input.password);
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
    applyDerivedPassword(user, input.password);
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
