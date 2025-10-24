import type { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
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
import { createDocumentSectionVersion, generateDocumentSectionContentHash } from "./sections-versions.js";

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
  userId: string;
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
        WHERE (document.deletedAt IS NULL)
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

      // Create version 1 for the new section
      const contentHash = generateDocumentSectionContentHash({
        name: params.name,
        description: params.description,
        shortCode: params.shortCode,
        order: params.order
      });

      await createDocumentSectionVersion(tx, {
        sectionId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        name: params.name,
        description: params.description,
        shortCode: params.shortCode,
        order: params.order,
        contentHash
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
        WHERE (document.deletedAt IS NULL)
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
  },
  userId: string
): Promise<DocumentSectionRecord> {
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state
      const getCurrentQuery = `
        MATCH (section:DocumentSection {id: $sectionId})
        RETURN section
      `;
      const currentResult = await tx.run(getCurrentQuery, { sectionId });
      if (currentResult.records.length === 0) {
        throw new Error("Section not found");
      }

      const currentSection = currentResult.records[0].get("section");
      const currentProps = currentSection.properties;

      // Determine new values (merge updates with current values)
      const newName = params.name !== undefined ? params.name : String(currentProps.name);
      const newDescription = params.description !== undefined ? params.description : (currentProps.description ? String(currentProps.description) : undefined);
      const newShortCode = params.shortCode !== undefined ? params.shortCode : (currentProps.shortCode ? String(currentProps.shortCode) : undefined);
      const newOrder = params.order !== undefined ? params.order : (typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber());

      // Check if content changed
      const oldContentHash = generateDocumentSectionContentHash({
        name: String(currentProps.name),
        description: currentProps.description ? String(currentProps.description) : undefined,
        shortCode: currentProps.shortCode ? String(currentProps.shortCode) : undefined,
        order: typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber()
      });
      const newContentHash = generateDocumentSectionContentHash({
        name: newName,
        description: newDescription,
        shortCode: newShortCode,
        order: newOrder
      });

      const contentChanged = oldContentHash !== newContentHash;

      // Update the section node
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

      // Create new version only if content changed
      if (contentChanged) {
        // Get tenant/project from section's document
        const getContextQuery = `
          MATCH (section:DocumentSection {id: $sectionId})
          RETURN section.tenant as tenant, section.projectKey as projectKey
        `;
        const contextResult = await tx.run(getContextQuery, { sectionId });
        const tenantSlug = slugify(String(contextResult.records[0].get("tenant")));
        const projectSlug = slugify(String(contextResult.records[0].get("projectKey")));

        await createDocumentSectionVersion(tx, {
          sectionId,
          tenantSlug,
          projectSlug,
          changedBy: userId,
          changeType: 'updated',
          name: newName,
          description: newDescription,
          shortCode: newShortCode,
          order: newOrder,
          contentHash: newContentHash
        });
      }

      return res.records[0].get("section") as Neo4jNode;
    });

    return mapDocumentSection(result);
  } finally {
    await session.close();
  }
}

export async function deleteDocumentSection(sectionId: string, userId: string): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state to create a deletion version
      const getCurrentQuery = `
        MATCH (section:DocumentSection {id: $sectionId})
        RETURN section
      `;
      const currentResult = await tx.run(getCurrentQuery, { sectionId });
      if (currentResult.records.length > 0) {
        const currentSection = currentResult.records[0].get("section");
        const currentProps = currentSection.properties;

        // Get tenant/project from section
        const tenantSlug = slugify(String(currentProps.tenant));
        const projectSlug = slugify(String(currentProps.projectKey));

        // Create deletion version
        const contentHash = generateDocumentSectionContentHash({
          name: String(currentProps.name),
          description: currentProps.description ? String(currentProps.description) : undefined,
          shortCode: currentProps.shortCode ? String(currentProps.shortCode) : undefined,
          order: typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber()
        });

        await createDocumentSectionVersion(tx, {
          sectionId,
          tenantSlug,
          projectSlug,
          changedBy: userId,
          changeType: 'deleted',
          name: String(currentProps.name),
          description: currentProps.description ? String(currentProps.description) : undefined,
          shortCode: currentProps.shortCode ? String(currentProps.shortCode) : undefined,
          order: typeof currentProps.order === 'number' ? currentProps.order : currentProps.order.toNumber(),
          contentHash
        });
      }

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
      WHERE (document.deletedAt IS NULL)

      // Get all requirements, infos, and surrogates for each section
      OPTIONAL MATCH (section)-[reqRel:CONTAINS]->(req:Requirement)
      WHERE (req.deleted IS NULL OR req.deleted = false)
        AND (req.archived IS NULL OR req.archived = false)
      OPTIONAL MATCH (section)-[infoRel:CONTAINS]->(info:Info)
      OPTIONAL MATCH (section)-[surRel:CONTAINS]->(sur:SurrogateReference)

      // Return each section with its requirements sorted by ref
      WITH section,
           req, reqRel, info, infoRel, sur, surRel
      ORDER BY section.order, section.createdAt, req.ref

      // Aggregate all related data per section
      WITH section,
           COLLECT(DISTINCT {node: req, rel: reqRel}) as requirements,
           COLLECT(DISTINCT {node: info, rel: infoRel}) as infos,
           COLLECT(DISTINCT {node: sur, rel: surRel}) as surrogates

      // Return sections with sorted related data
      RETURN section,
             [r IN requirements WHERE r.node IS NOT NULL] as requirements,
             [i IN infos WHERE i.node IS NOT NULL] as infos,
             [s IN surrogates WHERE s.node IS NOT NULL] as surrogates
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
      const requirements = (record.get('requirements') || []) as Array<{node: Neo4jNode, rel: Neo4jRelationship}>;
      const infos = (record.get('infos') || []) as Array<{node: Neo4jNode, rel: Neo4jRelationship}>;
      const surrogates = (record.get('surrogates') || []) as Array<{node: Neo4jNode, rel: Neo4jRelationship}>;

      return {
        ...mapDocumentSection(sectionNode),
        requirements: requirements
          .filter(item => item.node !== null)
          .map(item => ({
            ...mapRequirement(item.node),
            order: item.rel?.properties?.order ?? 999999
          }))
          .sort((a, b) => a.order - b.order), // Ensure correct requirement ordering
        infos: infos
          .filter(item => item.node !== null)
          .map(item => ({
            ...mapInfo(item.node),
            order: item.rel?.properties?.order ?? 999999
          }))
          .sort((a, b) => a.order - b.order), // Ensure correct info ordering
        surrogates: surrogates
          .filter(item => item.node !== null)
          .map(item => ({
            ...mapSurrogateReference(item.node),
            order: item.rel?.properties?.order ?? 999999
          }))
          .sort((a, b) => a.order - b.order) // Ensure correct surrogate ordering
      };
    });
  } finally {
    await session.close();
  }
}
