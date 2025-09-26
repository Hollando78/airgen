import { promises as fs } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.js";

export type DevUserRecord = {
  id: string;
  email: string;
  name?: string;
  password?: string;
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

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
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
    password: input.password ? hashPassword(input.password) : undefined,
    roles: Array.isArray(input.roles) && input.roles.length ? input.roles : ["user"],
    tenantSlugs: Array.isArray(input.tenantSlugs) ? input.tenantSlugs : [],
    createdAt: now,
    updatedAt: now
  };

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
    user.password = hashPassword(input.password);
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
