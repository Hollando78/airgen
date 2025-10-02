import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";
import { mapDocument } from "./documents/index.js";

export type TraceLinkItem = {
  id: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: "satisfies" | "derives" | "verifies" | "implements" | "refines" | "conflicts";
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentLinksetRecord = {
  id: string;
  tenant: string;
  projectKey: string;
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  sourceDocument: ReturnType<typeof mapDocument>;
  targetDocument: ReturnType<typeof mapDocument>;
  linkCount: number;
  links: TraceLinkItem[];
  createdAt: string;
  updatedAt: string;
};

function mapLinkset(
  node: Neo4jNode,
  sourceDocument: ReturnType<typeof mapDocument>,
  targetDocument: ReturnType<typeof mapDocument>
): DocumentLinksetRecord {
  const props = node.properties as Record<string, unknown>;
  
  return {
    id: String(props.id),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    sourceDocumentSlug: String(props.sourceDocumentSlug),
    targetDocumentSlug: String(props.targetDocumentSlug),
    sourceDocument,
    targetDocument,
    linkCount: Number(props.linkCount || 0),
    links: Array.isArray(props.links) ? props.links.map((link: any) => ({
      id: String(link.id),
      sourceRequirementId: String(link.sourceRequirementId),
      targetRequirementId: String(link.targetRequirementId),
      linkType: String(link.linkType) as TraceLinkItem["linkType"],
      description: link.description ? String(link.description) : null,
      createdAt: String(link.createdAt),
      updatedAt: String(link.updatedAt)
    })) : [],
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createLinkset(params: {
  tenant: string;
  projectKey: string;
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  links?: TraceLinkItem[];
}): Promise<DocumentLinksetRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const links = params.links || [];
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (sourceDoc:Document {slug: $sourceDocumentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
        MATCH (targetDoc:Document {slug: $targetDocumentSlug, tenant: $tenantSlug, projectKey: $projectSlug})
        CREATE (linkset:DocumentLinkset {
          id: $id,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          sourceDocumentSlug: $sourceDocumentSlug,
          targetDocumentSlug: $targetDocumentSlug,
          linkCount: $linkCount,
          links: $links,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_LINKSET]->(linkset)
        MERGE (linkset)-[:FROM_DOCUMENT]->(sourceDoc)
        MERGE (linkset)-[:TO_DOCUMENT]->(targetDoc)
        MERGE (sourceDoc)-[:LINKED_TO {linksetId: linkset.id}]->(targetDoc)
        RETURN linkset, sourceDoc, targetDoc
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        id: `linkset-${Date.now()}`,
        sourceDocumentSlug: params.sourceDocumentSlug,
        targetDocumentSlug: params.targetDocumentSlug,
        linkCount: links.length,
        links: links.map(link => ({
          id: link.id || `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sourceRequirementId: link.sourceRequirementId,
          targetRequirementId: link.targetRequirementId,
          linkType: link.linkType,
          description: link.description || null,
          createdAt: link.createdAt || now,
          updatedAt: link.updatedAt || now
        })),
        now
      });

      if (res.records.length === 0) {
        throw new Error(`Failed to create linkset. Check that tenant '${params.tenant}', project '${params.projectKey}', source document '${params.sourceDocumentSlug}', and target document '${params.targetDocumentSlug}' all exist.`);
      }

      const record = res.records[0];
      return mapLinkset(
        record.get("linkset") as Neo4jNode,
        mapDocument(record.get("sourceDoc")),
        mapDocument(record.get("targetDoc"))
      );
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listLinksets(params: {
  tenant: string;
  projectKey: string;
}): Promise<DocumentLinksetRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document)
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document)
        OPTIONAL MATCH (linkset)-[:CONTAINS_LINK]->(link:TraceLink)
        WITH linkset, sourceDoc, targetDoc, collect(link) AS links
        RETURN linkset, sourceDoc, targetDoc, links
        ORDER BY linkset.createdAt DESC
      `;

      return tx.run(query, { tenantSlug, projectSlug });
    });

    return result.records.map(record => {
      const linksetNode = record.get("linkset");
      const links = record.get("links");

      // Build links array from TraceLink nodes
      const linkItems = links
        .filter((link: any) => link !== null)
        .map((link: any) => ({
          id: String(link.properties.id),
          sourceRequirementId: String(link.properties.sourceRequirementId),
          targetRequirementId: String(link.properties.targetRequirementId),
          linkType: String(link.properties.linkType),
          description: link.properties.description ? String(link.properties.description) : null,
          createdAt: String(link.properties.createdAt),
          updatedAt: String(link.properties.updatedAt)
        }));

      // Override the links property with actual TraceLink nodes
      const linksetWithLinks = {
        ...linksetNode,
        properties: {
          ...linksetNode.properties,
          links: linkItems,
          linkCount: linkItems.length
        }
      };

      return mapLinkset(
        linksetWithLinks,
        mapDocument(record.get("sourceDoc")),
        mapDocument(record.get("targetDoc"))
      );
    });
  } finally {
    await session.close();
  }
}

export async function getLinkset(params: {
  tenant: string;
  projectKey: string;
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
}): Promise<DocumentLinksetRecord | null> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset)
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document {slug: $sourceDocumentSlug})
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document {slug: $targetDocumentSlug})
        OPTIONAL MATCH (linkset)-[:CONTAINS_LINK]->(link:TraceLink)
        WITH linkset, sourceDoc, targetDoc, collect(link) AS links
        RETURN linkset, sourceDoc, targetDoc, links
      `;

      return tx.run(query, {
        tenantSlug,
        projectSlug,
        sourceDocumentSlug: params.sourceDocumentSlug,
        targetDocumentSlug: params.targetDocumentSlug
      });
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const linksetNode = record.get("linkset");
    const links = record.get("links");

    // Build links array from TraceLink nodes
    const linkItems = links
      .filter((link: any) => link !== null)
      .map((link: any) => ({
        id: String(link.properties.id),
        sourceRequirementId: String(link.properties.sourceRequirementId),
        targetRequirementId: String(link.properties.targetRequirementId),
        linkType: String(link.properties.linkType),
        description: link.properties.description ? String(link.properties.description) : null,
        createdAt: String(link.properties.createdAt),
        updatedAt: String(link.properties.updatedAt)
      }));

    // Override the links property with actual TraceLink nodes
    const linksetWithLinks = {
      ...linksetNode,
      properties: {
        ...linksetNode.properties,
        links: linkItems,
        linkCount: linkItems.length
      }
    };

    return mapLinkset(
      linksetWithLinks,
      mapDocument(record.get("sourceDoc")),
      mapDocument(record.get("targetDoc"))
    );
  } finally {
    await session.close();
  }
}

export async function addLinkToLinkset(params: {
  tenant: string;
  projectKey: string;
  linksetId: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkItem["linkType"];
  description?: string;
}): Promise<DocumentLinksetRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const linkId = `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // First, fetch the existing linkset to get current links
      const fetchQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset {id: $linksetId})
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document)
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document)
        RETURN linkset, sourceDoc, targetDoc
      `;

      const fetchRes = await tx.run(fetchQuery, {
        tenantSlug,
        projectSlug,
        linksetId: params.linksetId
      });

      if (fetchRes.records.length === 0) {
        throw new Error("Linkset not found. Please create a linkset between these documents first before adding trace links.");
      }

      const linksetNode = fetchRes.records[0].get("linkset");
      const existingLinks = linksetNode.properties.links || [];

      // Convert existing links from Neo4j Maps to plain objects
      const plainLinks = existingLinks.map((link: any) => ({
        id: String(link.id),
        sourceRequirementId: String(link.sourceRequirementId),
        targetRequirementId: String(link.targetRequirementId),
        linkType: String(link.linkType),
        description: link.description ? String(link.description) : null,
        createdAt: String(link.createdAt),
        updatedAt: String(link.updatedAt)
      }));

      // Create the new link
      const newLink = {
        id: linkId,
        sourceRequirementId: params.sourceRequirementId,
        targetRequirementId: params.targetRequirementId,
        linkType: params.linkType,
        description: params.description || null,
        createdAt: now,
        updatedAt: now
      };

      // Append the new link to existing links
      const updatedLinks = [...plainLinks, newLink];

      // Update the linkset with the new links array
      // Build Cypher map literals inline to avoid Neo4j driver Map conversion
      const linkLiterals = updatedLinks.map(link =>
        `{id: "${link.id}", sourceRequirementId: "${link.sourceRequirementId}", targetRequirementId: "${link.targetRequirementId}", linkType: "${link.linkType}", description: ${link.description ? `"${link.description.replace(/"/g, '\\"')}"` : "null"}, createdAt: "${link.createdAt}", updatedAt: "${link.updatedAt}"}`
      ).join(", ");

      const updateQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset {id: $linksetId})
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document)
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document)
        SET linkset.links = [${linkLiterals}]
        SET linkset.linkCount = ${updatedLinks.length}
        SET linkset.updatedAt = $now
        RETURN linkset, sourceDoc, targetDoc
      `;

      const res = await tx.run(updateQuery, {
        tenantSlug,
        projectSlug,
        linksetId: params.linksetId,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Linkset not found. Please create a linkset between these documents first before adding trace links.");
      }

      const record = res.records[0];
      return mapLinkset(
        record.get("linkset"),
        mapDocument(record.get("sourceDoc")),
        mapDocument(record.get("targetDoc"))
      );
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function removeLinkFromLinkset(params: {
  tenant: string;
  projectKey: string;
  linksetId: string;
  linkId: string;
}): Promise<DocumentLinksetRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset {id: $linksetId})
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document)
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document)
        SET linkset.links = [link IN linkset.links WHERE link.id <> $linkId]
        SET linkset.linkCount = size(linkset.links)
        SET linkset.updatedAt = $now
        RETURN linkset, sourceDoc, targetDoc
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        linksetId: params.linksetId,
        linkId: params.linkId,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Linkset not found");
      }

      const record = res.records[0];
      return mapLinkset(
        record.get("linkset"),
        mapDocument(record.get("sourceDoc")),
        mapDocument(record.get("targetDoc"))
      );
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function deleteLinkset(params: {
  tenant: string;
  projectKey: string;
  linksetId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_LINKSET]->(linkset:DocumentLinkset {id: $linksetId})
        MATCH (linkset)-[:FROM_DOCUMENT]->(sourceDoc:Document)
        MATCH (linkset)-[:TO_DOCUMENT]->(targetDoc:Document)
        MATCH (sourceDoc)-[rel:LINKED_TO]->(targetDoc)
        WHERE rel.linksetId = linkset.id
        DELETE rel
        DETACH DELETE linkset
      `;

      const result = await tx.run(query, {
        tenantSlug,
        projectSlug,
        linksetId: params.linksetId
      });

      const deleted = result.summary.counters.updates().nodesDeleted ?? 0;
      if (deleted === 0) {
        throw new Error("Linkset not found");
      }
    });
  } finally {
    await session.close();
  }
}