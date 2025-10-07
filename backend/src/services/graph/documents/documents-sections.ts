import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import type { RequirementRecord } from "../../workspace.js";
import { getSession } from "../driver.js";
import { updateRequirementRefsForSection } from "../requirements/index.js";
import { executeMonitoredQuery } from "../../../lib/neo4j-monitor.js";
import { mapRequirement } from "../requirements/requirements-crud.js";
import { mapInfo } from "../infos.js";
import { mapSurrogateReference } from "../surrogates.js";
import type { InfoRecord } from "../infos.js";
import type { SurrogateReferenceRecord } from "../surrogates.js";

export type DocumentSectionRecord = {
  id: string;
  name: string;
  description?: string | null;
  shortCode?: string | null;
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
    shortCode: props.shortCode ? String(props.shortCode) : null,
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

/**
 * Extended section record with related requirements, infos, and surrogates
 */
export type DocumentSectionWithRelations = DocumentSectionRecord & {
  requirements: RequirementRecord[];
  infos: InfoRecord[];
  surrogates: SurrogateReferenceRecord[];
};

/**
 * List document sections with all related requirements, infos, and surrogates in a single optimized query
 *
 * This function batches what would normally be N+1 queries (1 for sections + 3*N for each section's data)
 * into a single Neo4j query, following the optimization pattern from commit f7736f8.
 *
 * Performance: 10 sections with mixed content: 30 API calls → 1 API call (~97% reduction)
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key
 * @param documentSlug - Document slug
 * @returns Array of sections with their requirements, infos, and surrogates
 */
export async function listDocumentSectionsWithRelations(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<DocumentSectionWithRelations[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    // Single batched query that fetches sections and all related data
    // This is much more efficient than making separate API calls for each section
    const query = `
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_DOCUMENT]->(document:Document {slug: $documentSlug})-[:HAS_SECTION]->(section:DocumentSection)

      // Get all requirements, infos, and surrogates for each section
      OPTIONAL MATCH (section)-[reqRel:HAS_REQUIREMENT]->(req:Requirement)
      WHERE (req.deleted IS NULL OR req.deleted = false)
        AND (req.archived IS NULL OR req.archived = false)
      OPTIONAL MATCH (section)-[infoRel:CONTAINS_INFO]->(info:Info)
      OPTIONAL MATCH (section)-[surRel:CONTAINS_SURROGATE_REFERENCE]->(sur:SurrogateReference)

      // Aggregate all related data per section
      WITH section,
           COLLECT(DISTINCT {node: req, order: reqRel.order, createdAt: req.createdAt}) as reqs,
           COLLECT(DISTINCT {node: info, order: infoRel.order, createdAt: info.createdAt}) as infos,
           COLLECT(DISTINCT {node: sur, order: surRel.order, createdAt: sur.createdAt}) as surs

      // Sort sections
      ORDER BY section.order, section.createdAt

      // Return sections with sorted related data
      RETURN section,
             [r IN reqs WHERE r.node IS NOT NULL | r.node] as requirements,
             [i IN infos WHERE i.node IS NOT NULL | i.node] as infos,
             [s IN surs WHERE s.node IS NOT NULL | s.node] as surrogates
    `;

    const result = await executeMonitoredQuery(
      session,
      query,
      { tenantSlug, projectSlug, documentSlug },
      'listDocumentSectionsWithRelations'
    );

    // Map the results
    return result.records.map(record => {
      const sectionNode = record.get('section') as Neo4jNode;
      const requirementNodes = (record.get('requirements') || []) as Neo4jNode[];
      const infoNodes = (record.get('infos') || []) as Neo4jNode[];
      const surrogateNodes = (record.get('surrogates') || []) as Neo4jNode[];

      return {
        ...mapDocumentSection(sectionNode),
        requirements: requirementNodes.filter(n => n !== null).map(node => mapRequirement(node)),
        infos: infoNodes.filter(n => n !== null).map(node => mapInfo(node)),
        surrogates: surrogateNodes.filter(n => n !== null).map(node => mapSurrogateReference(node))
      };
    });
  } finally {
    await session.close();
  }
}
