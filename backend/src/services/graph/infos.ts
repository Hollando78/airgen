import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { getSession } from "./driver.js";
import { slugify } from "../workspace.js";

export type InfoRecord = {
  id: string;
  ref: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export function mapInfo(node: Neo4jNode): InfoRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    documentSlug: String(props.documentSlug),
    text: String(props.text),
    title: props.title ? String(props.title) : undefined,
    sectionId: props.sectionId ? String(props.sectionId) : undefined,
    order: props.order !== undefined && props.order !== null ? Number(props.order) : undefined,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createInfo(params: {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  ref: string;
  text: string;
  title?: string;
  sectionId?: string;
  order?: number;
}): Promise<InfoRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const infoId = `info-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document {slug: $documentSlug})
        CREATE (info:Info {
          id: $infoId,
          ref: $ref,
          tenant: $tenant,
          projectKey: $projectKey,
          documentSlug: $documentSlug,
          text: $text,
          title: $title,
          sectionId: $sectionId,
          order: $order,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (doc)-[:HAS_INFO]->(info)
        ${params.sectionId ? `
          WITH info
          MATCH (section:DocumentSection {id: $sectionId})
          MERGE (section)-[:CONTAINS_INFO]->(info)
        ` : ''}
        RETURN info
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug: params.documentSlug,
        infoId,
        ref: params.ref,
        tenant: params.tenant,
        projectKey: params.projectKey,
        text: params.text,
        title: params.title || null,
        sectionId: params.sectionId || null,
        order: params.order ?? null,
        now
      });

      return res.records[0].get("info") as Neo4jNode;
    });

    return mapInfo(result);
  } finally {
    await session.close();
  }
}

export async function updateInfo(
  tenant: string,
  project: string,
  ref: string,
  updates: {
    text?: string;
    title?: string;
    sectionId?: string;
    order?: number;
  }
): Promise<InfoRecord> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClauses: string[] = ["info.updatedAt = $now"];
      const params: Record<string, unknown> = { tenantSlug, projectSlug, ref, now };

      if (updates.text !== undefined) {
        setClauses.push("info.text = $text");
        params.text = updates.text;
      }
      if (updates.title !== undefined) {
        setClauses.push("info.title = $title");
        params.title = updates.title;
      }
      if (updates.sectionId !== undefined) {
        setClauses.push("info.sectionId = $sectionId");
        params.sectionId = updates.sectionId;
      }
      if (updates.order !== undefined) {
        setClauses.push("info.order = $order");
        params.order = updates.order;
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_INFO]->(info:Info {ref: $ref})
        SET ${setClauses.join(", ")}
        ${updates.sectionId !== undefined ? `
          WITH info
          OPTIONAL MATCH (info)<-[oldRel:CONTAINS_INFO]-(oldSection:DocumentSection)
          DELETE oldRel
          WITH info
          MATCH (section:DocumentSection {id: $sectionId})
          MERGE (section)-[:CONTAINS_INFO]->(info)
        ` : ''}
        RETURN info
      `;

      const res = await tx.run(query, params);
      if (res.records.length === 0) {
        throw new Error("Info not found");
      }

      return res.records[0].get("info") as Neo4jNode;
    });

    return mapInfo(result);
  } finally {
    await session.close();
  }
}

export async function deleteInfo(tenant: string, project: string, ref: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_INFO]->(info:Info {ref: $ref})
        DETACH DELETE info
      `;

      await tx.run(query, { tenantSlug, projectSlug, ref });
    });
  } finally {
    await session.close();
  }
}

export async function listDocumentInfos(tenant: string, project: string, documentSlug: string): Promise<InfoRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document {slug: $documentSlug})-[:HAS_INFO]->(info:Info)
        RETURN info
        ORDER BY info.createdAt
      `,
      { tenantSlug, projectSlug, documentSlug }
    );

    return result.records.map(record => mapInfo(record.get("info")));
  } finally {
    await session.close();
  }
}

export async function listSectionInfos(sectionId: string): Promise<InfoRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})-[:CONTAINS_INFO]->(info:Info)
        RETURN info
        ORDER BY coalesce(info.order, 999999), info.createdAt
      `,
      { sectionId }
    );

    return result.records.map(record => mapInfo(record.get("info")));
  } finally {
    await session.close();
  }
}
