import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import { updateRequirementRefsForSection } from "../requirements/index.js";

export type DocumentSectionRecord = {
  id: string;
  name: string;
  description?: string | null;
  documentSlug: string;
  tenant: string;
  projectKey: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export function mapDocumentSection(node: Neo4jNode): DocumentSectionRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    documentSlug: String(props.documentSlug),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    order: Number(props.order),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createDocumentSection(params: {
  tenant: string;
  projectKey: string;
  documentSlug: string;
  name: string;
  description?: string;
  shortCode?: string;
  order: number;
}): Promise<DocumentSectionRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const sectionId = `section-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})
        CREATE (section:DocumentSection {
          id: $sectionId,
          name: $name,
          description: $description,
          shortCode: $shortCode,
          documentSlug: $documentSlug,
          tenant: $tenant,
          projectKey: $projectKey,
          order: $order,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (document)-[:HAS_SECTION]->(section)
        RETURN section
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        documentSlug: params.documentSlug,
        sectionId,
        name: params.name,
        description: params.description ?? null,
        shortCode: params.shortCode ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        order: params.order,
        now
      });

      return res.records[0].get("section") as Neo4jNode;
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function listDocumentSections(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<DocumentSectionRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})-[:HAS_SECTION]->(section:DocumentSection)
        RETURN section
        ORDER BY section.order, section.createdAt
      `,
      { tenantSlug, projectSlug, documentSlug }
    );

    return result.records.map(record => mapDocumentSection(record.get("section")));
  } finally {
    await session.close();
  }
}

export async function updateDocumentSection(
  sectionId: string,
  params: {
    name?: string;
    description?: string;
    order?: number;
    shortCode?: string;
  }
): Promise<DocumentSectionRecord> {
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updateClauses: string[] = [];
      const queryParams: Record<string, unknown> = { sectionId, now };

      if (params.name !== undefined) {
        updateClauses.push("section.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updateClauses.push("section.description = $description");
        queryParams.description = params.description;
      }
      if (params.order !== undefined) {
        updateClauses.push("section.order = $order");
        queryParams.order = params.order;
      }
      if (params.shortCode !== undefined) {
        updateClauses.push("section.shortCode = $shortCode");
        queryParams.shortCode = params.shortCode;
      }

      if (updateClauses.length === 0) {
        throw new Error("No fields to update");
      }

      const query = `
        MATCH (section:DocumentSection {id: $sectionId})
        SET ${updateClauses.join(", ")}, section.updatedAt = $now
        RETURN section
      `;

      const res = await tx.run(query, queryParams);

      if (res.records.length === 0) {
        throw new Error("Section not found");
      }

      if (params.shortCode !== undefined || params.name !== undefined) {
        await updateRequirementRefsForSection(tx, sectionId);
      }

      return res.records[0].get("section") as Neo4jNode;
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function deleteDocumentSection(sectionId: string): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (section:DocumentSection {id: $sectionId})
        DETACH DELETE section
      `;

      await tx.run(query, { sectionId });
    });
  } finally {
    await session.close();
  }
}
