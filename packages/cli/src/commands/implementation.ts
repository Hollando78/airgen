import { Command } from "commander";
import { readFileSync } from "node:fs";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";
import { resolveRequirementId } from "../resolve.js";

// ── Types ────────────────────────────────────────────────────

interface Requirement {
  id?: string;
  ref?: string;
  text?: string;
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  qaScore?: number | null;
  deleted?: boolean;
  deletedAt?: string | null;
}

interface ArtifactEntry {
  type: string;
  path: string;
  label?: string;
  line?: number;
}

const IMPL_STATUSES = ["not_started", "in_progress", "implemented", "verified", "blocked"] as const;
type ImplStatus = (typeof IMPL_STATUSES)[number];

const IMPL_TAG_PREFIX = "impl:";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

// ── Helpers ──────────────────────────────────────────────────

async function fetchAllRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
): Promise<Requirement[]> {
  const all: Requirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const items = data.data ?? [];
    all.push(...items);
    const totalPages = data.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
  }
  return all.filter((r) => !r.deleted && !r.deletedAt);
}

/** Fetch a single requirement by its resolved ID (ref or full colon ID). */
async function fetchRequirement(
  client: AirgenClient,
  tenant: string,
  project: string,
  resolvedId: string,
): Promise<Requirement | null> {
  // Try direct GET by ref/ID first (works for both ref and full colon ID)
  try {
    const data = await client.get<{ record: Requirement }>(`/requirements/${tenant}/${project}/${resolvedId}`);
    if (data.record) return data.record;
  } catch {
    // Not found via direct endpoint — fall through to paginated search
  }

  // Paginated search as fallback
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      data: Requirement[];
      meta: { totalPages: number };
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const items = data.data ?? [];
    const found = items.find(r => r.id === resolvedId);
    if (found) return found;
    const totalPages = data.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
  }
  return null;
}

function getImplStatus(tags?: string[]): ImplStatus | null {
  if (!tags) return null;
  const implTag = tags.find((t) => t.startsWith(IMPL_TAG_PREFIX));
  if (!implTag) return null;
  const status = implTag.slice(IMPL_TAG_PREFIX.length);
  return IMPL_STATUSES.includes(status as ImplStatus) ? (status as ImplStatus) : null;
}

function parseArtifacts(attributes?: Record<string, string | number | boolean | null>): ArtifactEntry[] {
  if (!attributes?.artifacts || typeof attributes.artifacts !== "string") return [];
  try {
    const parsed = JSON.parse(attributes.artifacts);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function statusEmoji(status: ImplStatus | null): string {
  switch (status) {
    case "not_started": return "[ ]";
    case "in_progress": return "[~]";
    case "implemented": return "[x]";
    case "verified": return "[v]";
    case "blocked": return "[!]";
    default: return "[-]";
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

// ── Command registration ─────────────────────────────────────

export function registerImplementationCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("impl").description("Implementation tracking");

  // ── impl status ──────────────────────────────────────────
  cmd
    .command("status")
    .description("Set implementation status on a requirement (syncs tags + attributes)")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<requirement>", "Requirement ref, ID, or hashId")
    .requiredOption("--status <s>", "Status: not_started, in_progress, implemented, verified, blocked")
    .option("--notes <text>", "Notes")
    .action(async (tenant: string, project: string, requirement: string, opts: { status: string; notes?: string }) => {
      if (!IMPL_STATUSES.includes(opts.status as ImplStatus)) {
        console.error(`Invalid status: ${opts.status}. Must be one of: ${IMPL_STATUSES.join(", ")}`);
        process.exit(1);
      }

      const resolvedId = await resolveRequirementId(client, tenant, project, requirement);
      const req = await fetchRequirement(client, tenant, project, resolvedId);
      if (!req) {
        console.error(`Requirement ${requirement} not found.`);
        process.exit(1);
      }

      const now = new Date().toISOString();

      // Update tags: remove existing impl:* tags, add new one
      const currentTags = (req.tags ?? []).filter(t => !t.startsWith(IMPL_TAG_PREFIX));
      currentTags.push(`${IMPL_TAG_PREFIX}${opts.status}`);

      // Update attributes (matching MCP server's field names)
      const updatedAttributes: Record<string, string | number | boolean | null> = {
        ...(req.attributes ?? {}),
        impl_status: opts.status,
        impl_updated_at: now,
      };
      if (opts.notes !== undefined) {
        updatedAttributes.impl_notes = opts.notes || null;
      }

      await client.patch(`/requirements/${tenant}/${project}/${resolvedId}`, {
        tags: currentTags,
        attributes: updatedAttributes,
      });

      if (isJsonMode()) {
        output({ ok: true, id: resolvedId, status: opts.status, tags: currentTags });
      } else {
        console.log(`Implementation status set to ${opts.status} on ${req.ref ?? resolvedId}.`);
      }
    });

  // ── impl summary ─────────────────────────────────────────
  cmd
    .command("summary")
    .description("Implementation coverage report for a project")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const requirements = await fetchAllRequirements(client, tenant, project);
      const total = requirements.length;

      if (total === 0) {
        console.log("No requirements found.");
        return;
      }

      const statusCounts: Record<string, number> = {};
      for (const s of IMPL_STATUSES) statusCounts[s] = 0;
      statusCounts["unset"] = 0;
      let withArtifactCount = 0;

      for (const req of requirements) {
        const status = getImplStatus(req.tags);
        if (status) {
          statusCounts[status]++;
        } else {
          statusCounts["unset"]++;
        }
        const artifacts = parseArtifacts(req.attributes);
        if (artifacts.length > 0) withArtifactCount++;
      }

      const done = (statusCounts["implemented"] ?? 0) + (statusCounts["verified"] ?? 0);
      const inProgress = statusCounts["in_progress"] ?? 0;
      const blocked = statusCounts["blocked"] ?? 0;

      if (isJsonMode()) {
        output({ total, statusCounts, done, inProgress, blocked, withArtifacts: withArtifactCount });
        return;
      }

      console.log(`Implementation Report (${total} requirements)\n`);
      console.log(`Coverage: ${pct(done, total)}  |  Artifacts: ${pct(withArtifactCount, total)}\n`);

      printTable(
        ["Status", "Count", "%", ""],
        [...IMPL_STATUSES, "unset" as const].map(s => {
          const count = statusCounts[s] ?? 0;
          const bar = "\u2588".repeat(Math.round((count / total) * 30));
          const emoji = s === "unset" ? "[-]" : statusEmoji(s as ImplStatus);
          return [`${emoji} ${s}`, String(count), pct(count, total), bar];
        }),
      );

      console.log(`\nDone (implemented + verified): ${done}`);
      console.log(`In progress: ${inProgress}`);
      console.log(`Blocked: ${blocked}`);
      console.log(`Not started / unset: ${total - done - inProgress - blocked}`);
      console.log(`With artifact links: ${withArtifactCount}`);
    });

  // ── impl list ────────────────────────────────────────────
  cmd
    .command("list")
    .description("List requirements filtered by implementation status")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--status <s>", "Filter by status: not_started, in_progress, implemented, verified, blocked, unset")
    .action(async (tenant: string, project: string, opts: { status?: string }) => {
      const requirements = await fetchAllRequirements(client, tenant, project);
      let filtered = requirements;

      if (opts.status) {
        if (opts.status === "unset") {
          filtered = requirements.filter(r => getImplStatus(r.tags) === null);
        } else {
          filtered = requirements.filter(r => getImplStatus(r.tags) === opts.status);
        }
      }

      if (isJsonMode()) {
        output(filtered.map(r => ({
          ref: r.ref,
          id: r.id,
          text: r.text,
          status: getImplStatus(r.tags) ?? "unset",
          artifacts: parseArtifacts(r.attributes).length,
        })));
        return;
      }

      console.log(`Implementation status: ${opts.status ?? "all"} (${filtered.length} requirements)\n`);
      if (filtered.length === 0) {
        console.log("No matching requirements.");
        return;
      }

      printTable(
        ["Ref", "Status", "Text", "Artifacts"],
        filtered.map(r => [
          r.ref ?? "?",
          statusEmoji(getImplStatus(r.tags)) + " " + (getImplStatus(r.tags) ?? "unset"),
          truncate(r.text ?? "", 50),
          String(parseArtifacts(r.attributes).length),
        ]),
      );
    });

  // ── impl bulk-update ─────────────────────────────────────
  cmd
    .command("bulk-update")
    .description("Bulk update implementation status from a JSON file")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .requiredOption("--file <path>", "JSON file with array of {ref, status, notes?}")
    .action(async (tenant: string, project: string, opts: { file: string }) => {
      let items: Array<{ ref: string; status: string; notes?: string }>;
      try {
        const raw = readFileSync(opts.file, "utf-8");
        items = JSON.parse(raw);
        if (!Array.isArray(items)) throw new Error("File must contain a JSON array");
      } catch (err) {
        console.error(`Failed to read file: ${(err as Error).message}`);
        process.exit(1);
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const item of items) {
        if (!IMPL_STATUSES.includes(item.status as ImplStatus)) {
          errors.push(`${item.ref}: invalid status "${item.status}"`);
          failed++;
          continue;
        }

        try {
          const resolvedId = await resolveRequirementId(client, tenant, project, item.ref);
          const req = await fetchRequirement(client, tenant, project, resolvedId);
          if (!req) {
            errors.push(`${item.ref}: not found`);
            failed++;
            continue;
          }

          const now = new Date().toISOString();
          const currentTags = (req.tags ?? []).filter(t => !t.startsWith(IMPL_TAG_PREFIX));
          currentTags.push(`${IMPL_TAG_PREFIX}${item.status}`);

          const updatedAttributes: Record<string, string | number | boolean | null> = {
            ...(req.attributes ?? {}),
            impl_status: item.status,
            impl_updated_at: now,
          };
          if (item.notes !== undefined) {
            updatedAttributes.impl_notes = item.notes || null;
          }

          await client.patch(`/requirements/${tenant}/${project}/${resolvedId}`, {
            tags: currentTags,
            attributes: updatedAttributes,
          });
          updated++;
        } catch (err) {
          errors.push(`${item.ref}: ${(err as Error).message}`);
          failed++;
        }
      }

      if (isJsonMode()) {
        output({ total: items.length, updated, failed, errors });
      } else {
        console.log(`Bulk update: ${updated} updated, ${failed} failed (${items.length} total)`);
        for (const e of errors) {
          console.error(`  - ${e}`);
        }
      }
    });

  // ── impl link ────────────────────────────────────────────
  cmd
    .command("link")
    .description("Link a code artifact to a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<requirement>", "Requirement ref, ID, or hashId")
    .requiredOption("--type <type>", "Artifact type: file, commit, pr, issue, test, url")
    .requiredOption("--path <path>", "Artifact path/reference")
    .option("--label <text>", "Label")
    .option("--line <n>", "Line number (for file type)")
    .action(async (tenant: string, project: string, requirement: string, opts: {
      type: string; path: string; label?: string; line?: string;
    }) => {
      const resolvedId = await resolveRequirementId(client, tenant, project, requirement);
      const req = await fetchRequirement(client, tenant, project, resolvedId);
      if (!req) {
        console.error(`Requirement ${requirement} not found.`);
        process.exit(1);
      }

      const artifacts = parseArtifacts(req.attributes);
      const newArtifact: ArtifactEntry = { type: opts.type, path: opts.path };
      if (opts.label) newArtifact.label = opts.label;
      if (opts.line) newArtifact.line = parseInt(opts.line, 10);

      // Check for duplicates
      const exists = artifacts.some(a => a.type === newArtifact.type && a.path === newArtifact.path);
      if (exists) {
        console.log("Artifact already linked.");
        return;
      }

      artifacts.push(newArtifact);
      const updatedAttributes: Record<string, string | number | boolean | null> = {
        ...(req.attributes ?? {}),
        artifacts: JSON.stringify(artifacts),
      };

      await client.patch(`/requirements/${tenant}/${project}/${resolvedId}`, {
        attributes: updatedAttributes,
      });
      console.log("Artifact linked.");
    });

  // ── impl unlink ──────────────────────────────────────────
  cmd
    .command("unlink")
    .description("Remove an artifact link from a requirement")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .argument("<requirement>", "Requirement ref, ID, or hashId")
    .requiredOption("--type <type>", "Artifact type")
    .requiredOption("--path <path>", "Artifact path")
    .action(async (tenant: string, project: string, requirement: string, opts: { type: string; path: string }) => {
      const resolvedId = await resolveRequirementId(client, tenant, project, requirement);
      const req = await fetchRequirement(client, tenant, project, resolvedId);
      if (!req) {
        console.error(`Requirement ${requirement} not found.`);
        process.exit(1);
      }

      const artifacts = parseArtifacts(req.attributes);
      const filtered = artifacts.filter(a => !(a.type === opts.type && a.path === opts.path));

      if (filtered.length === artifacts.length) {
        console.log("No matching artifact found.");
        return;
      }

      const updatedAttributes: Record<string, string | number | boolean | null> = {
        ...(req.attributes ?? {}),
        artifacts: filtered.length > 0 ? JSON.stringify(filtered) : null,
      };

      await client.patch(`/requirements/${tenant}/${project}/${resolvedId}`, {
        attributes: updatedAttributes,
      });
      console.log("Artifact unlinked.");
    });
}
