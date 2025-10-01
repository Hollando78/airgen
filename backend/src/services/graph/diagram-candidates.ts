import { randomUUID } from "node:crypto";
import type { Node as Neo4jNode } from "neo4j-driver";
import { config } from "../../config.js";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";

export type DiagramCandidateStatus = "pending" | "accepted" | "rejected";
export type DiagramCandidateAction = "create" | "update" | "extend";

export type DiagramCandidateBlock = {
  id?: string;
  name: string;
  kind: string;
  stereotype?: string;
  description?: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: Array<{
    id: string;
    name: string;
    direction: string;
  }>;
  action?: string;
};

export type DiagramCandidateConnector = {
  id?: string;
  source: string;
  target: string;
  kind: string;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  action?: string;
};

export type DiagramCandidateInput = {
  tenant: string;
  projectKey: string;
  status: DiagramCandidateStatus;
  action: DiagramCandidateAction;
  diagramId?: string;
  diagramName?: string;
  diagramDescription?: string;
  diagramView?: string;
  blocks: DiagramCandidateBlock[];
  connectors: DiagramCandidateConnector[];
  reasoning: string;
  prompt?: string;
  querySessionId?: string;
};

export type DiagramCandidateRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  status: DiagramCandidateStatus;
  action: DiagramCandidateAction;
  diagramId?: string | null;
  diagramName?: string | null;
  diagramDescription?: string | null;
  diagramView?: string | null;
  blocks: DiagramCandidateBlock[];
  connectors: DiagramCandidateConnector[];
  reasoning: string;
  prompt?: string | null;
  querySessionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function mapDiagramCandidate(node: Neo4jNode): DiagramCandidateRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    status: String(props.status) as DiagramCandidateStatus,
    action: String(props.action) as DiagramCandidateAction,
    diagramId: props.diagramId ? String(props.diagramId) : null,
    diagramName: props.diagramName ? String(props.diagramName) : null,
    diagramDescription: props.diagramDescription ? String(props.diagramDescription) : null,
    diagramView: props.diagramView ? String(props.diagramView) : null,
    blocks: props.blocksJson ? JSON.parse(String(props.blocksJson)) : [],
    connectors: props.connectorsJson ? JSON.parse(String(props.connectorsJson)) : [],
    reasoning: String(props.reasoning),
    prompt: props.prompt ? String(props.prompt) : null,
    querySessionId: props.querySessionId ? String(props.querySessionId) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createDiagramCandidate(
  input: DiagramCandidateInput
): Promise<DiagramCandidateRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const timestamp = new Date().toISOString();
  
  const row = {
    id: `diag-cand-${randomUUID()}`,
    tenantSlug,
    tenantName: input.tenant,
    projectSlug,
    projectKey: input.projectKey,
    status: input.status,
    action: input.action,
    diagramId: input.diagramId ?? null,
    diagramName: input.diagramName ?? null,
    diagramDescription: input.diagramDescription ?? null,
    diagramView: input.diagramView ?? "block",
    blocksJson: JSON.stringify(input.blocks),
    connectorsJson: JSON.stringify(input.connectors),
    reasoning: input.reasoning,
    prompt: input.prompt ?? null,
    querySessionId: input.querySessionId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const session = getSession();
  try {
    const result = await session.executeWrite(async tx => {
      const query = `
        MERGE (tenant:Tenant {slug: $row.tenantSlug})
          ON CREATE SET tenant.name = $row.tenantName, tenant.createdAt = $row.createdAt
        MERGE (project:Project {slug: $row.projectSlug, tenantSlug: $row.tenantSlug})
          ON CREATE SET project.key = $row.projectKey, project.createdAt = $row.createdAt
        CREATE (candidate:DiagramCandidate {
          id: $row.id,
          tenant: $row.tenantSlug,
          projectKey: $row.projectSlug,
          status: $row.status,
          action: $row.action,
          diagramId: $row.diagramId,
          diagramName: $row.diagramName,
          diagramDescription: $row.diagramDescription,
          diagramView: $row.diagramView,
          blocksJson: $row.blocksJson,
          connectorsJson: $row.connectorsJson,
          reasoning: $row.reasoning,
          prompt: $row.prompt,
          querySessionId: $row.querySessionId,
          createdAt: $row.createdAt,
          updatedAt: $row.updatedAt
        })
        MERGE (project)-[:HAS_DIAGRAM_CANDIDATE]->(candidate)
        RETURN candidate
      `;

      const res = await tx.run(query, { row });
      return mapDiagramCandidate(res.records[0].get("candidate"));
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listDiagramCandidates(
  tenant: string,
  projectKey: string
): Promise<DiagramCandidateRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})-[:HAS_DIAGRAM_CANDIDATE]->(candidate:DiagramCandidate)
        RETURN candidate
        ORDER BY candidate.createdAt DESC
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => mapDiagramCandidate(record.get("candidate")));
  } finally {
    await session.close();
  }
}

export async function getDiagramCandidate(id: string): Promise<DiagramCandidateRecord | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (candidate:DiagramCandidate {id: $id})
        RETURN candidate
        LIMIT 1
      `,
      { id }
    );

    if (result.records.length === 0) {
      return null;
    }

    return mapDiagramCandidate(result.records[0].get("candidate"));
  } finally {
    await session.close();
  }
}

export async function updateDiagramCandidate(
  id: string,
  updates: Partial<Omit<DiagramCandidateRecord, "id" | "createdAt">>
): Promise<DiagramCandidateRecord | null> {
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
        MATCH (candidate:DiagramCandidate {id: $id})
        SET ${setClauses.join(", ")}
        RETURN candidate
      `;

      const res = await tx.run(query, params);
      return res.records.length ? res.records[0].get("candidate") : null;
    });

    return result ? mapDiagramCandidate(result) : null;
  } finally {
    await session.close();
  }
}