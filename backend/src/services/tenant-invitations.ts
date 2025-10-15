import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import { slugify } from "./workspace.js";

export type TenantInvitationStatus = "pending" | "accepted" | "cancelled";

export type TenantInvitationRecord = {
  id: string;
  tenantSlug: string;
  email: string;
  invitedBy: string;
  invitedByEmail?: string;
  token: string;
  status: TenantInvitationStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  cancelledAt?: string;
};

const INVITATIONS_FILE = join(config.workspaceRoot, "tenant-invitations.json");

async function ensureFileDirectory(): Promise<void> {
  await fs.mkdir(dirname(INVITATIONS_FILE), { recursive: true });
}

async function loadInvitations(): Promise<TenantInvitationRecord[]> {
  try {
    const raw = await fs.readFile(INVITATIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as TenantInvitationRecord[];
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

async function saveInvitations(invitations: TenantInvitationRecord[]): Promise<void> {
  await ensureFileDirectory();
  await fs.writeFile(INVITATIONS_FILE, `${JSON.stringify(invitations, null, 2)}\n`, "utf8");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listInvitationsForTenant(tenantSlug: string): Promise<TenantInvitationRecord[]> {
  const invitations = await loadInvitations();
  const normalizedTenant = slugify(tenantSlug);
  return invitations
    .filter(invite => invite.tenantSlug === normalizedTenant)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function listInvitationsForEmail(email: string): Promise<TenantInvitationRecord[]> {
  const invitations = await loadInvitations();
  const normalizedEmail = normalizeEmail(email);
  return invitations.filter(invite => normalizeEmail(invite.email) === normalizedEmail);
}

export async function findInvitationByToken(token: string): Promise<TenantInvitationRecord | undefined> {
  const invitations = await loadInvitations();
  return invitations.find(invite => invite.token === token);
}

export async function createTenantInvitation(
  tenantSlug: string,
  email: string,
  invitedBy: string,
  invitedByEmail?: string
): Promise<TenantInvitationRecord> {
  const invitations = await loadInvitations();
  const normalizedTenant = slugify(tenantSlug);
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();

  const existingIndex = invitations.findIndex(invite =>
    invite.tenantSlug === normalizedTenant &&
    normalizeEmail(invite.email) === normalizedEmail &&
    invite.status === "pending"
  );

  const invitation: TenantInvitationRecord = existingIndex >= 0
    ? {
        ...invitations[existingIndex]!,
        invitedBy,
        invitedByEmail,
        token: randomUUID(),
        updatedAt: now
      }
    : {
        id: randomUUID(),
        tenantSlug: normalizedTenant,
        email: normalizedEmail,
        invitedBy,
        invitedByEmail,
        token: randomUUID(),
        status: "pending",
        createdAt: now,
        updatedAt: now
      };

  if (existingIndex >= 0) {
    invitations[existingIndex] = invitation;
  } else {
    invitations.push(invitation);
  }

  await saveInvitations(invitations);
  return invitation;
}

export async function acceptTenantInvitation(token: string): Promise<TenantInvitationRecord | null> {
  const invitations = await loadInvitations();
  const index = invitations.findIndex(invite => invite.token === token);

  if (index === -1) {
    return null;
  }

  const invitation = invitations[index]!;
  if (invitation.status !== "pending") {
    return null;
  }

  const now = new Date().toISOString();
  const updated: TenantInvitationRecord = {
    ...invitation,
    status: "accepted",
    acceptedAt: now,
    updatedAt: now
  };

  invitations[index] = updated;
  await saveInvitations(invitations);
  return updated;
}

export async function cancelTenantInvitation(id: string): Promise<boolean> {
  const invitations = await loadInvitations();
  const index = invitations.findIndex(invite => invite.id === id);

  if (index === -1) {
    return false;
  }

  const invitation = invitations[index]!;
  if (invitation.status !== "pending") {
    return false;
  }

  const now = new Date().toISOString();
  invitations[index] = {
    ...invitation,
    status: "cancelled",
    cancelledAt: now,
    updatedAt: now
  };

  await saveInvitations(invitations);
  return true;
}
