import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { getSession } from "./driver.js";
import { slugify } from "../workspace.js";

export type SurrogateReferenceRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  documentSlug: string;
  slug: string; // References the surrogate document by slug
  caption?: string;
  sectionId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

export function mapSurrogateReference(node: Neo4jNode): SurrogateReferenceRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    documentSlug: String(props.documentSlug),
    slug: String(props.slug),
    caption: props.caption ? String(props.caption) : undefined,
    sectionId: props.sectionId ? String(props.sectionId) : undefined,
    order: props.order !== undefined && props.order !== null ? Number(props.order) : undefined,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createSurrogateReference(params: {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  slug: string;
  caption?: string;
  sectionId?: string;
  order?: number;
}): Promise<SurrogateReferenceRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const surrogateId = `surrogate-ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document {slug: $documentSlug})
        CREATE (surrogate:SurrogateReference {
          id: $surrogateId,
          tenant: $tenant,
          projectKey: $projectKey,
          documentSlug: $documentSlug,
          slug: $slug,
          caption: $caption,
          sectionId: $sectionId,
          order: $order,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (doc)-[:HAS_SURROGATE_REFERENCE]->(surrogate)
        ${params.sectionId ? `
          WITH surrogate
          MATCH (section:DocumentSection {id: $sectionId})
          MERGE (section)-[:CONTAINS_SURROGATE_REFERENCE]->(surrogate)
        ` : ''}
        RETURN surrogate
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug: params.documentSlug,
        surrogateId,
        tenant: params.tenant,
        projectKey: params.projectKey,
        slug: params.slug,
        caption: params.caption || null,
        sectionId: params.sectionId || null,
        order: params.order ?? null,
        now
      });

      return res.records[0].get("surrogate") as Neo4jNode;
    });

    return mapSurrogateReference(result);
  } finally {
    await session.close();
  }
}

export async function deleteSurrogateReference(tenant: string, project: string, surrogateId: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document)-[:HAS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference {id: $surrogateId})
        DETACH DELETE surrogate
      `;

      await tx.run(query, { tenantSlug, projectSlug, surrogateId });
    });
  } finally {
    await session.close();
  }
}

export async function listDocumentSurrogateReferences(tenant: string, project: string, documentSlug: string): Promise<SurrogateReferenceRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document {slug: $documentSlug})-[:HAS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
        RETURN surrogate
        ORDER BY surrogate.createdAt
      `,
      { tenantSlug, projectSlug, documentSlug }
    );

    return result.records.map(record => mapSurrogateReference(record.get("surrogate")));
  } finally {
    await session.close();
  }
}

export async function listSectionSurrogateReferences(sectionId: string): Promise<SurrogateReferenceRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})-[:CONTAINS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
        RETURN surrogate
        ORDER BY coalesce(surrogate.order, 999999), surrogate.createdAt
      `,
      { sectionId }
    );

    return result.records.map(record => mapSurrogateReference(record.get("surrogate")));
  } finally {
    await session.close();
  }
}

export async function deleteAllSurrogateReferencesForDocument(tenant: string, project: string, documentSlug: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(project);

  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(doc:Document {slug: $documentSlug})-[:HAS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference)
        DETACH DELETE surrogate
      `;

      await tx.run(query, { tenantSlug, projectSlug, documentSlug });
    });
  } finally {
    await session.close();
  }
}

export async function reorderSurrogateReferences(sectionId: string, surrogateIds: string[]): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each surrogate reference
      for (let i = 0; i < surrogateIds.length; i++) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[:CONTAINS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference {id: $surrogateId})
          SET surrogate.order = $order, surrogate.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          surrogateId: surrogateIds[i],
          order: i,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}

export async function reorderSurrogateReferencesWithOrder(
  sectionId: string,
  surrogates: Array<{ id: string; order: number }>
): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Update order for each surrogate reference with explicit order value
      for (const surrogate of surrogates) {
        const query = `
          MATCH (section:DocumentSection {id: $sectionId})-[:CONTAINS_SURROGATE_REFERENCE]->(surrogate:SurrogateReference {id: $surrogateId})
          SET surrogate.order = $order, surrogate.updatedAt = $now
        `;
        await tx.run(query, {
          sectionId,
          surrogateId: surrogate.id,
          order: surrogate.order,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}
