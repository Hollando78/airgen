import { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";
import { mapRequirement } from "./requirements.js";

export type TraceLinkRecord = {
  id: string;
  sourceRequirementId: string;
  sourceRequirement: ReturnType<typeof mapRequirement>;
  targetRequirementId: string;
  targetRequirement: ReturnType<typeof mapRequirement>;
  linkType: "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";
  description?: string | null;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

function mapTraceLink(
  node: Neo4jNode,
  sourceRequirement: ReturnType<typeof mapRequirement>,
  targetRequirement: ReturnType<typeof mapRequirement>,
  sourceDocument?: Neo4jNode | null,
  targetDocument?: Neo4jNode | null
): TraceLinkRecord {
  const props = node.properties as Record<string, unknown>;
  
  // Add document slug information to requirements if available
  const enhancedSourceRequirement = sourceDocument ? {
    ...sourceRequirement,
    documentSlug: String(sourceDocument.properties.slug)
  } : sourceRequirement;
  
  const enhancedTargetRequirement = targetDocument ? {
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
}): Promise<TraceLinkRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (source:Requirement {id: $sourceRequirementId, tenant: $tenantSlug, projectKey: $projectSlug})
        MATCH (target:Requirement {id: $targetRequirementId, tenant: $tenantSlug, projectKey: $projectSlug})
        CREATE (link:TraceLink {
          id: $id,
          sourceRequirementId: source.id,
          targetRequirementId: target.id,
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
        MERGE (source)-[:LINKS_TO {type: $linkType}]->(target)
        WITH link, source, target
        OPTIONAL MATCH (sourceDoc:Document)-[:CONTAINS]->(source)
        OPTIONAL MATCH (targetDoc:Document)-[:CONTAINS]->(target)
        RETURN link, source, target, sourceDoc, targetDoc
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        id: `trace-${Date.now()}`,
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkType: params.linkType,
        description: params.description ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error(`Failed to create trace link. Check that tenant '${params.tenant}', project '${params.projectKey}', source requirement '${params.sourceRequirementId}', and target requirement '${params.targetRequirementId}' all exist.`);
      }

      const record = res.records[0];
      return mapTraceLink(
        record.get("link") as Neo4jNode,
        mapRequirement(record.get("source")),
        mapRequirement(record.get("target")),
        record.get("sourceDoc"),
        record.get("targetDoc")
      );
    });

    return result;
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
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        OPTIONAL MATCH (sourceDoc:Document)-[:CONTAINS]->(sourceReq)
        OPTIONAL MATCH (targetDoc:Document)-[:CONTAINS]->(targetReq)
        RETURN link, sourceReq, targetReq, sourceDoc, targetDoc
        ORDER BY link.createdAt DESC
      `;

      return tx.run(query, { tenantSlug, projectSlug });
    });

    return result.records.map(record =>
      mapTraceLink(
        record.get("link"),
        mapRequirement(record.get("sourceReq")),
        mapRequirement(record.get("targetReq")),
        record.get("sourceDoc"),
        record.get("targetDoc")
      )
    );
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
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_TRACE_LINK]->(link:TraceLink)
        MATCH (link)-[:FROM_REQUIREMENT]->(sourceReq:Requirement)
        MATCH (link)-[:TO_REQUIREMENT]->(targetReq:Requirement)
        WHERE sourceReq.id = $requirementId OR targetReq.id = $requirementId
        OPTIONAL MATCH (sourceDoc:Document)-[:CONTAINS]->(sourceReq)
        OPTIONAL MATCH (targetDoc:Document)-[:CONTAINS]->(targetReq)
        RETURN link, sourceReq, targetReq, sourceDoc, targetDoc
        ORDER BY link.createdAt DESC
      `;

      return tx.run(query, {
        tenantSlug,
        projectSlug,
        requirementId: params.requirementId
      });
    });

    return result.records.map(record =>
      mapTraceLink(
        record.get("link"),
        mapRequirement(record.get("sourceReq")),
        mapRequirement(record.get("targetReq")),
        record.get("sourceDoc"),
        record.get("targetDoc")
      )
    );
  } finally {
    await session.close();
  }
}

export async function deleteTraceLink(params: {
  tenant: string;
  projectKey: string;
  linkId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
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
