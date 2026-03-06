/**
 * Resolve any requirement identifier to its full ID.
 *
 * Accepts: full ID, ref, short ID (REQ-XXX), or hashId.
 * Returns the full colon-separated ID (tenant:project:REQ-XXX).
 */

import type { AirgenClient } from "./client.js";

interface RequirementRecord {
  id: string;
  ref?: string;
  hashId?: string;
}

export async function resolveRequirementId(
  client: AirgenClient,
  tenant: string,
  project: string,
  identifier: string,
): Promise<string> {
  // Already a full ID (contains colons)
  if (identifier.includes(":")) {
    return identifier;
  }

  // Try as ref first (GET /requirements/{tenant}/{project}/{ref})
  try {
    const data = await client.get<{ record: RequirementRecord }>(
      `/requirements/${tenant}/${project}/${identifier}`,
    );
    if (data.record?.id) return data.record.id;
  } catch {
    // Not found by ref — continue
  }

  // Search through requirements for short ID or hashId match
  let page = 1;
  const limit = 100;
  while (true) {
    const data = await client.get<{
      data: RequirementRecord[];
      meta: { totalPages: number };
    }>(`/requirements/${tenant}/${project}`, { page: String(page), limit: String(limit) });

    const reqs = data.data ?? [];
    for (const r of reqs) {
      // Match by short ID (the REQ-XXX part of tenant:project:REQ-XXX)
      if (r.id?.endsWith(`:${identifier}`)) return r.id;
      // Match by hashId
      if (r.hashId === identifier) return r.id;
    }

    if (page >= (data.meta?.totalPages ?? 1)) break;
    page++;
  }

  // Nothing found — return as-is and let the API error
  return identifier;
}
