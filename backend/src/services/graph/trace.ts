import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";
import { mapRequirement } from "./requirements/index.js";
import { getLinkset, addLinkToLinkset } from "./linksets.js";
import { createTraceLinkVersion, generateTraceLinkContentHash, type TraceLinkVersionRecord } from "./trace-versions.js";

export type TraceLinkRecord = {
  id: string;
  sourceRequirementId: string;
  sourceRequirement: ReturnType<typeof mapRequirement> | null;
  targetRequirementId: string;
  targetRequirement: ReturnType<typeof mapRequirement> | null;
  linkType: "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";
  description?: string | null;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

function mapTraceLink(
  node: Neo4jNode,
  sourceRequirement: ReturnType<typeof mapRequirement> | null,
  targetRequirement: ReturnType<typeof mapRequirement> | null,
  sourceDocument?: Neo4jNode | null,
  targetDocument?: Neo4jNode | null
): TraceLinkRecord {
  const props = node.properties as Record<string, unknown>;

  // Add document slug information to requirements if available
  const enhancedSourceRequirement = sourceRequirement && sourceDocument ? {
    ...sourceRequirement,
    documentSlug: String(sourceDocument.properties.slug)
  } : sourceRequirement;

  const enhancedTargetRequirement = targetRequirement && targetDocument ? {
    ...targetRequirement,
    documentSlug: String(targetDocument.properties.slug)
  } : targetRequirement;

  return {
    id: String(props.id),
    sourceRequirementId: String(props.sourceRequirementId),
    sourceRequirement: enhancedSourceRequirement,
    targetRequirementId: String(props.targetRequirementId),
    targetRequirement: enhancedTargetRequirement,
    linkType: String(props.linkType) as TraceLinkRecord["linkType"],
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createTraceLink(params: {
  tenant: string;
  projectKey: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkRecord["linkType"];
  description?: string;
  userId: string;
}): Promise<TraceLinkRecord> {
  // First, look up the requirements to find their document slugs
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();

  // Get document slugs from requirements
  // Check both paths: section-based (Document->Section->Requirement) and direct (Document->Requirement)
  const docResult = await session.executeRead(async (tx: ManagedTransaction) => {
    const query = `
      MATCH (source:Requirement {id: $sourceRequirementId})
      MATCH (target:Requirement {id: $targetRequirementId})
      OPTIONAL MATCH (sourceDocViaSection:Document)-[:HAS_SECTION]->(sourceSection:DocumentSection)-[:CONTAINS]->(source)
      OPTIONAL MATCH (targetDocViaSection:Document)-[:HAS_SECTION]->(targetSection:DocumentSection)-[:CONTAINS]->(target)
      OPTIONAL MATCH (sourceDocDirect:Document)-[:CONTAINS]->(source)
      OPTIONAL MATCH (targetDocDirect:Document)-[:CONTAINS]->(target)
      RETURN coalesce(sourceDocViaSection.slug, sourceDocDirect.slug) AS sourceDocSlug,
             coalesce(targetDocViaSection.slug, targetDocDirect.slug) AS targetDocSlug
    `;

    return tx.run(query, {
      sourceRequirementId: params.sourceRequirementId,
      targetRequirementId: params.targetRequirementId
    });
  });

  if (docResult.records.length === 0) {
    await session.close();
    throw new Error("Requirements not found");
  }

  const sourceDocSlug = docResult.records[0].get("sourceDocSlug");
  const targetDocSlug = docResult.records[0].get("targetDocSlug");

  if (!sourceDocSlug || !targetDocSlug) {
    await session.close();
    throw new Error("Requirements must be contained in documents");
  }

  // Only require a linkset for inter-document links
  let linksetId: string | null = null;
  if (sourceDocSlug !== targetDocSlug) {
    const linkset = await getLinkset({
      tenant: params.tenant,
      projectKey: params.projectKey,
      sourceDocumentSlug: sourceDocSlug,
      targetDocumentSlug: targetDocSlug
    });

    if (!linkset) {
      await session.close();
      throw new Error(`No linkset exists between ${sourceDocSlug} and ${targetDocSlug}. Please create a linkset first.`);
    }
    linksetId = linkset.id;
  }

  const now = new Date().toISOString();
  const linkId = `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // For inter-document links, link to the linkset. For intra-document links, skip linkset.
      const query = linksetId
        ? `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (linkset:DocumentLinkset {id: $linksetId})
          MATCH (source:Requirement {id: $sourceRequirementId})
          MATCH (target:Requirement {id: $targetRequirementId})
          OPTIONAL MATCH (sourceDoc:Document)-[:HAS_SECTION]->(sourceSection:DocumentSection)-[:CONTAINS]->(source)
          OPTIONAL MATCH (targetDoc:Document)-[:HAS_SECTION]->(targetSection:DocumentSection)-[:CONTAINS]->(target)
          CREATE (link:TraceLink {
            id: $linkId,
            sourceRequirementId: $sourceRequirementId,
            targetRequirementId: $targetRequirementId,
            linkType: $linkType,
            description: $description,
            tenant: $tenantSlug,
            projectKey: $projectSlug,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (project)-[:HAS_TRACE_LINK]->(link)
          MERGE (linkset)-[:CONTAINS_LINK]->(link)
          MERGE (link)-[:FROM_REQUIREMENT]->(source)
          MERGE (link)-[:TO_REQUIREMENT]->(target)
          MERGE (source)-[:LINKS_TO {linkId: link.id, linkType: $linkType}]->(target)
          RETURN link, source, target, sourceDoc, targetDoc
        `
        : `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (source:Requirement {id: $sourceRequirementId})
          MATCH (target:Requirement {id: $targetRequirementId})
          OPTIONAL MATCH (sourceDoc:Document)-[:HAS_SECTION]->(sourceSection:DocumentSection)-[:CONTAINS]->(source)
          OPTIONAL MATCH (targetDoc:Document)-[:HAS_SECTION]->(targetSection:DocumentSection)-[:CONTAINS]->(target)
          CREATE (link:TraceLink {
            id: $linkId,
            sourceRequirementId: $sourceRequirementId,
            targetRequirementId: $targetRequirementId,
            linkType: $linkType,
            description: $description,
            tenant: $tenantSlug,
            projectKey: $projectSlug,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (project)-[:HAS_TRACE_LINK]->(link)
          MERGE (link)-[:FROM_REQUIREMENT]->(source)
          MERGE (link)-[:TO_REQUIREMENT]->(target)
          MERGE (source)-[:LINKS_TO {linkId: link.id, linkType: $linkType}]->(target)
          RETURN link, source, target, sourceDoc, targetDoc
        `;

      return tx.run(query, {
        tenantSlug,
        projectSlug,
        linksetId,
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkId,
        linkType: params.linkType,
        description: params.description || null,
        now
      });
    });

    if (result.records.length === 0) {
      throw new Error("Failed to create trace link");
    }

    const record = result.records[0];
    const link = record.get("link");

    // Create version 1 for the new trace link
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const contentHash = generateTraceLinkContentHash({
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkType: params.linkType,
        description: params.description
      });

      await createTraceLinkVersion(tx, {
        traceLinkId: linkId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkType: params.linkType,
        description: params.description,
        contentHash
      });
    });

    const mappedLink = mapTraceLink(
      link,
      mapRequirement(record.get("source")),
      mapRequirement(record.get("target")),
      record.get("sourceDoc"),
      record.get("targetDoc")
    );

    return mappedLink;
  } finally {
    await session.close();
  }
}

export async function listTraceLinks(params: {
  tenant: string;
  projectKey: string;
}): Promise<TraceLinkRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    // 1. Fetch TraceLink nodes (created via createTraceLink)
    const nodeResult = await session.executeRead(async (tx: ManagedTransaction) => {
      // QUERY PROFILE: expected <100ms - optimized to avoid cartesian products with OPTIONAL MATCH
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        OPTIONAL MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement WHERE sourceReq.archived IS NULL OR sourceReq.archived = false)
        OPTIONAL MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement WHERE targetReq.archived IS NULL OR targetReq.archived = false)
        OPTIONAL MATCH (sourceDoc:Document)-[:HAS_SECTION]->(sourceSection:DocumentSection)-[:CONTAINS]->(sourceReq)
        OPTIONAL MATCH (targetDoc:Document)-[:HAS_SECTION]->(targetSection:DocumentSection)-[:CONTAINS]->(targetReq)
        RETURN link, sourceReq, targetReq, sourceDoc, targetDoc
        ORDER BY link.createdAt DESC
      `;

      return tx.run(query, { tenantSlug, projectSlug });
    });

    const traceLinkNodeIds = new Set<string>();
    const results: TraceLinkRecord[] = nodeResult.records.map(record => {
      const link = record.get("link");
      traceLinkNodeIds.add(String(link.properties.id));
      const sourceReq = record.get("sourceReq");
      const targetReq = record.get("targetReq");
      return mapTraceLink(
        link,
        sourceReq ? mapRequirement(sourceReq) : null,
        targetReq ? mapRequirement(targetReq) : null,
        record.get("sourceDoc"),
        record.get("targetDoc")
      );
    });

    // 2. Fetch links embedded in DocumentLinkset nodes (created via addLinkToLinkset)
    const linksetResult = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)
        WHERE linkset.links IS NOT NULL AND size(linkset.links) > 0
        RETURN linkset.links AS links, linkset.sourceDocumentSlug AS sourceDocSlug, linkset.targetDocumentSlug AS targetDocSlug
      `;
      return tx.run(query, { tenantSlug, projectSlug });
    });

    for (const record of linksetResult.records) {
      const embeddedLinks = record.get("links") as any[];
      if (!Array.isArray(embeddedLinks)) continue;

      for (const link of embeddedLinks) {
        const linkId = String(link.id);
        // Skip if already present as a TraceLink node
        if (traceLinkNodeIds.has(linkId)) continue;

        const sourceReqId = String(link.sourceRequirementId);
        const targetReqId = String(link.targetRequirementId);

        results.push({
          id: linkId,
          sourceRequirementId: sourceReqId,
          sourceRequirement: null,
          targetRequirementId: targetReqId,
          targetRequirement: null,
          linkType: String(link.linkType) as TraceLinkRecord["linkType"],
          description: link.description ? String(link.description) : null,
          tenant: tenantSlug,
          projectKey: projectSlug,
          createdAt: String(link.createdAt ?? ""),
          updatedAt: String(link.updatedAt ?? ""),
        });
      }
    }

    return results;
  } finally {
    await session.close();
  }
}

export async function listTraceLinksByRequirement(params: {
  tenant: string;
  projectKey: string;
  requirementId: string;
}): Promise<TraceLinkRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    // 1. Fetch TraceLink nodes
    const nodeResult = await session.executeRead(async (tx: ManagedTransaction) => {
      // QUERY PROFILE: expected <50ms - optimized with OPTIONAL MATCH to avoid cartesian products
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        WHERE link.sourceRequirementId = $requirementId OR link.targetRequirementId = $requirementId
        OPTIONAL MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement WHERE sourceReq.archived IS NULL OR sourceReq.archived = false)
        OPTIONAL MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement WHERE targetReq.archived IS NULL OR targetReq.archived = false)
        OPTIONAL MATCH (sourceDoc:Document)-[:HAS_SECTION]->(sourceSection:DocumentSection)-[:CONTAINS]->(sourceReq)
        OPTIONAL MATCH (targetDoc:Document)-[:HAS_SECTION]->(targetSection:DocumentSection)-[:CONTAINS]->(targetReq)
        RETURN link, sourceReq, targetReq, sourceDoc, targetDoc
        ORDER BY link.createdAt DESC
      `;

      return tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId: params.requirementId
      });
    });

    const traceLinkNodeIds = new Set<string>();
    const results: TraceLinkRecord[] = nodeResult.records.map(record => {
      const link = record.get("link");
      traceLinkNodeIds.add(String(link.properties.id));
      const sourceReq = record.get("sourceReq");
      const targetReq = record.get("targetReq");
      return mapTraceLink(
        link,
        sourceReq ? mapRequirement(sourceReq) : null,
        targetReq ? mapRequirement(targetReq) : null,
        record.get("sourceDoc"),
        record.get("targetDoc")
      );
    });

    // 2. Fetch matching links embedded in DocumentLinkset nodes
    const linksetResult = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)
        WHERE linkset.links IS NOT NULL AND size(linkset.links) > 0
        RETURN linkset.links AS links
      `;
      return tx.run(query, { tenantSlug, projectSlug });
    });

    for (const record of linksetResult.records) {
      const embeddedLinks = record.get("links") as any[];
      if (!Array.isArray(embeddedLinks)) continue;

      for (const link of embeddedLinks) {
        const linkId = String(link.id);
        if (traceLinkNodeIds.has(linkId)) continue;

        const sourceReqId = String(link.sourceRequirementId);
        const targetReqId = String(link.targetRequirementId);

        // Only include links that reference the requested requirement
        if (sourceReqId !== params.requirementId && targetReqId !== params.requirementId) continue;

        results.push({
          id: linkId,
          sourceRequirementId: sourceReqId,
          sourceRequirement: null,
          targetRequirementId: targetReqId,
          targetRequirement: null,
          linkType: String(link.linkType) as TraceLinkRecord["linkType"],
          description: link.description ? String(link.description) : null,
          tenant: tenantSlug,
          projectKey: projectSlug,
          createdAt: String(link.createdAt ?? ""),
          updatedAt: String(link.updatedAt ?? ""),
        });
      }
    }

    return results;
  } finally {
    await session.close();
  }
}

export async function deleteTraceLink(params: {
  tenant: string;
  projectKey: string;
  linkId: string;
  userId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state to create a deletion version
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink {id: $linkId})
        RETURN link
      `;
      const currentResult = await tx.run(getCurrentQuery, { tenantSlug, projectSlug, linkId: params.linkId });

      if (currentResult.records.length > 0) {
        const currentLink = currentResult.records[0].get("link");
        const currentProps = currentLink.properties;

        // Create deletion version
        const contentHash = generateTraceLinkContentHash({
          sourceRequirementId: String(currentProps.sourceRequirementId),
          targetRequirementId: String(currentProps.targetRequirementId),
          linkType: String(currentProps.linkType),
          description: currentProps.description ? String(currentProps.description) : undefined
        });

        await createTraceLinkVersion(tx, {
          traceLinkId: params.linkId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'deleted',
          sourceRequirementId: String(currentProps.sourceRequirementId),
          targetRequirementId: String(currentProps.targetRequirementId),
          linkType: String(currentProps.linkType) as TraceLinkVersionRecord["linkType"],
          description: currentProps.description ? String(currentProps.description) : undefined,
          contentHash
        });
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink {id: $linkId})
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        MATCH (sourceReq)-[rel:LINKS_TO]->(targetReq)
        DELETE rel
        DETACH DELETE link
      `;

      const result = await tx.run(query, {
        tenantSlug,
        projectSlug,
        linkId: params.linkId
      });

      const deleted = result.summary.counters.updates().nodesDeleted ?? 0;
      if (deleted === 0) {
        throw new Error("Trace link not found");
      }
    });
  } finally {
    await session.close();
  }
}
