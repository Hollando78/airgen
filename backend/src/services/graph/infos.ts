import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { getSession } from "./driver.js";
import { slugify } from "../workspace.js";
import { createInfoVersion, generateInfoContentHash } from "./infos-versions.js";

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

export function mapInfo(node: Neo4jNode, relOrder?: number): InfoRecord {
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
    order: relOrder !== undefined ? relOrder : (props.order !== undefined && props.order !== null ? Number(props.order) : undefined),
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
  userId: string;
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
          MERGE (section)-[:CONTAINS]->(info)
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

      // Create version 1 for the new info
      const contentHash = generateInfoContentHash({
        text: params.text,
        title: params.title
      });

      await createInfoVersion(tx, {
        infoId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        ref: params.ref,
        text: params.text,
        title: params.title,
        sectionId: params.sectionId,
        order: params.order,
        contentHash
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
  },
  userId: string
): Promise<InfoRecord> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_INFO]->(info:Info {ref: $ref})
        RETURN info
      `;
      const currentResult = await tx.run(getCurrentQuery, { tenantSlug, projectSlug, ref });
      if (currentResult.records.length === 0) {
        throw new Error("Info not found");
      }

      const currentInfo = currentResult.records[0].get("info");
      const currentProps = currentInfo.properties;

      // Determine new values (merge updates with current values)
      const newText = updates.text !== undefined ? updates.text : String(currentProps.text);
      const newTitle = updates.title !== undefined ? updates.title : (currentProps.title ? String(currentProps.title) : undefined);
      const newSectionId = updates.sectionId !== undefined ? updates.sectionId : (currentProps.sectionId ? String(currentProps.sectionId) : undefined);
      const newOrder = updates.order !== undefined ? updates.order : (currentProps.order !== undefined && currentProps.order !== null ? (typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber()) : undefined);

      // Check if content changed
      const oldContentHash = generateInfoContentHash({
        text: String(currentProps.text),
        title: currentProps.title ? String(currentProps.title) : undefined
      });
      const newContentHash = generateInfoContentHash({
        text: newText,
        title: newTitle
      });

      const contentChanged = oldContentHash !== newContentHash;

      // Update the info node
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
          OPTIONAL MATCH (info)<-[oldRel:CONTAINS]-(oldSection:DocumentSection)
          DELETE oldRel
          WITH info
          MATCH (section:DocumentSection {id: $sectionId})
          MERGE (section)-[:CONTAINS]->(info)
        ` : ''}
        RETURN info
      `;

      const res = await tx.run(query, params);
      if (res.records.length === 0) {
        throw new Error("Info not found");
      }

      // Create new version only if content changed
      if (contentChanged) {
        await createInfoVersion(tx, {
          infoId: String(currentProps.id),
          tenantSlug,
          projectSlug,
          changedBy: userId,
          changeType: 'updated',
          ref: String(currentProps.ref),
          text: newText,
          title: newTitle,
          sectionId: newSectionId,
          order: newOrder,
          contentHash: newContentHash
        });
      }

      return res.records[0].get("info") as Neo4jNode;
    });

    return mapInfo(result);
  } finally {
    await session.close();
  }
}

export async function deleteInfo(tenant: string, project: string, ref: string, userId: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state to create a deletion version
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_INFO]->(info:Info {ref: $ref})
        RETURN info
      `;
      const currentResult = await tx.run(getCurrentQuery, { tenantSlug, projectSlug, ref });
      if (currentResult.records.length > 0) {
        const currentInfo = currentResult.records[0].get("info");
        const currentProps = currentInfo.properties;

        // Create deletion version
        const contentHash = generateInfoContentHash({
          text: String(currentProps.text),
          title: currentProps.title ? String(currentProps.title) : undefined
        });

        await createInfoVersion(tx, {
          infoId: String(currentProps.id),
          tenantSlug,
          projectSlug,
          changedBy: userId,
          changeType: 'deleted',
          ref: String(currentProps.ref),
          text: String(currentProps.text),
          title: currentProps.title ? String(currentProps.title) : undefined,
          sectionId: currentProps.sectionId ? String(currentProps.sectionId) : undefined,
          order: currentProps.order !== undefined && currentProps.order !== null
            ? (typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber())
            : undefined,
          contentHash
        });
      }

      // Now delete the info node
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
        MATCH (section:DocumentSection {id: $sectionId})-[rel:CONTAINS]->(info:Info)
        RETURN info, rel
        ORDER BY coalesce(rel.order, 999999), info.createdAt
      `,
      { sectionId }
    );

    return result.records.map(record => {
      const node = record.get("info") as Neo4jNode;
      const rel = record.get("rel") as any;
      const relOrder = rel?.properties?.order !== undefined ? Number(rel.properties.order) : undefined;
      return mapInfo(node, relOrder);
    });
  } finally {
    await session.close();
  }
}

export async function reorderInfos(sectionId: string, infoIds: string[]): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each info
      for (let i = 0; i < infoIds.length; i++) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[rel:CONTAINS]->(info:Info {id: $infoId})
          SET rel.order = $order
          SET info.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          infoId: infoIds[i],
          order: i,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}

export async function reorderInfosWithOrder(
  sectionId: string,
  infos: Array<{ id: string; order: number }>
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each info with explicit order value
      // Update both relationship order and node property to keep them in sync
      for (const info of infos) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[rel:CONTAINS]->(info:Info {id: $infoId})
          SET rel.order = $order,
              info.order = $order,
              info.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          infoId: info.id,
          order: info.order,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}
