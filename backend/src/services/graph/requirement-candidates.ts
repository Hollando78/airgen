import { randomUUID } from "node:crypto";
import type { Node as Neo4jNode } from "neo4j-driver";
import { int as neo4jInt } from "neo4j-driver";
import { config } from "../../config.js";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";

export type RequirementCandidateStatus = "pending" | "accepted" | "rejected";

export type RequirementCandidateInput = {
  tenant: string;
  projectKey: string;
  text: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  prompt?: string;
  source?: string;
  querySessionId?: string;
};

export type RequirementCandidateRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  text: string;
  status: RequirementCandidateStatus;
  qaScore?: number;
  qaVerdict?: string;
  suggestions: string[];
  prompt?: string | null;
  source?: string | null;
  querySessionId?: string | null;
  requirementId?: string | null;
  requirementRef?: string | null;
  documentSlug?: string | null;
  sectionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapRequirementCandidate(node: Neo4jNode): RequirementCandidateRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    text: String(props.text),
    status: String(props.status) as RequirementCandidateStatus,
    qaScore:
      props.qaScore !== null && props.qaScore !== undefined
        ? Number(props.qaScore)
        : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : [],
    prompt: props.prompt ? String(props.prompt) : null,
    source: props.source ? String(props.source) : null,
    querySessionId: props.querySessionId ? String(props.querySessionId) : null,
    requirementId: props.requirementId ? String(props.requirementId) : null,
    requirementRef: props.requirementRef ? String(props.requirementRef) : null,
    documentSlug: props.documentSlug ? String(props.documentSlug) : null,
    sectionId: props.sectionId ? String(props.sectionId) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createRequirementCandidates(
  inputs: RequirementCandidateInput[]
): Promise<RequirementCandidateRecord[]> {
  if (inputs.length === 0) {return [];}

  const rows = inputs.map(input => {
    const tenantSlug = slugify(input.tenant || config.defaultTenant);
    const projectSlug = slugify(input.projectKey);
    const timestamp = new Date().toISOString();
    return {
      id: `cand-${randomUUID()}`,
      tenantSlug,
      tenantName: input.tenant,
      projectSlug,
      projectKey: input.projectKey,
      text: input.text,
      status: "pending" as RequirementCandidateStatus,
      qaScore: input.qaScore ?? null,
      qaVerdict: input.qaVerdict ?? null,
      suggestions: input.suggestions ?? [],
      prompt: input.prompt ?? null,
      source: input.source ?? "llm",
      querySessionId: input.querySessionId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });

  const session = getSession();
  try {
    const result = await session.executeWrite(async tx => {
      const query = `
        UNWIND $rows AS row
        MERGE (tenant:Tenant {slug: row.tenantSlug})
          ON CREATE SET tenant.name = row.tenantName, tenant.createdAt = row.createdAt
        MERGE (project:Project {slug: row.projectSlug, tenantSlug: row.tenantSlug})
          ON CREATE SET project.key = row.projectKey, project.createdAt = row.createdAt
        CREATE (candidate:RequirementCandidate {
          id: row.id,
          tenant: row.tenantSlug,
          projectKey: row.projectSlug,
          text: row.text,
          status: row.status,
          qaScore: row.qaScore,
          qaVerdict: row.qaVerdict,
          suggestions: row.suggestions,
          prompt: row.prompt,
          source: row.source,
          querySessionId: row.querySessionId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        })
        MERGE (project)-[:HAS_CANDIDATE]->(candidate)
        RETURN candidate
      `;

      const res = await tx.run(query, { rows });
      return res.records.map(record => mapRequirementCandidate(record.get("candidate")));
    });

    return result;
  } finally {
    await session.close();
  }
}

export interface ListOptions {
  limit?: number;     // Default 100, max 1000
  offset?: number;    // Default 0
}

export async function listRequirementCandidates(
  tenant: string,
  projectKey: string,
  options?: ListOptions
): Promise<RequirementCandidateRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const limit = parseInt(String(Math.min(options?.limit ?? 100, 1000)), 10);
  const offset = parseInt(String(options?.offset ?? 0), 10);
  const session = getSession();

  try {
    // QUERY PROFILE: expected <50ms with pagination
    const result = await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_CANDIDATE]->(candidate:RequirementCandidate)
        RETURN candidate
        ORDER BY candidate.createdAt DESC
        SKIP $offset
        LIMIT $limit
      `,
      { tenantSlug, projectSlug, offset: neo4jInt(offset), limit: neo4jInt(limit) }
    );

    return result.records.map(record => mapRequirementCandidate(record.get("candidate")));
  } finally {
    await session.close();
  }
}

export async function getRequirementCandidate(id: string): Promise<RequirementCandidateRecord | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (candidate:RequirementCandidate {id: $id})
        RETURN candidate
        LIMIT 1
      `,
      { id }
    );

    if (result.records.length === 0) {
      return null;
    }

    return mapRequirementCandidate(result.records[0].get("candidate"));
  } finally {
    await session.close();
  }
}

export async function updateRequirementCandidate(
  id: string,
  updates: Partial<Omit<RequirementCandidateRecord, "id" | "createdAt">>
): Promise<RequirementCandidateRecord | null> {
  const session = getSession();

  try {
    const result = await session.executeWrite(async tx => {
      const setClauses: string[] = ["candidate.updatedAt = $now"];
      const params: Record<string, unknown> = { id, now: new Date().toISOString() };

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setClauses.push(`candidate.${key} = $${key}`);
          params[key] = value;
        }
      }

      const query = `
        MATCH (candidate:RequirementCandidate {id: $id})
        SET ${setClauses.join(", ")}
        RETURN candidate
      `;

      const res = await tx.run(query, params);
      return res.records.length ? res.records[0].get("candidate") : null;
    });

    return result ? mapRequirementCandidate(result) : null;
  } finally {
    await session.close();
  }
}
