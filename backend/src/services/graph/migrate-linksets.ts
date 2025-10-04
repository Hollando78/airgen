import type { ManagedTransaction } from "neo4j-driver";
import { getSession } from "./driver.js";
import { slugify } from "../workspace.js";

/**
 * Migrates orphaned TraceLink nodes into DocumentLinkset structures.
 * This is a one-time migration to ensure all trace links are associated with linksets.
 */
export async function migrateOrphanedTraceLinks(): Promise<{
  migratedLinks: number;
  createdLinksets: number;
  errors: string[];
}> {
  const session = getSession();
  const errors: string[] = [];
  let migratedLinks = 0;
  let createdLinksets = 0;

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get all orphaned TraceLink nodes
      const orphanedLinksQuery = `
        MATCH (tl:TraceLink)
        RETURN tl
      `;

      const orphanedLinks = await tx.run(orphanedLinksQuery);

      if (orphanedLinks.records.length === 0) {
        return { migratedLinks: 0, createdLinksets: 0 };
      }

      // Group links by source/target document pair
      const linksByDocumentPair = new Map<string, any[]>();

      for (const record of orphanedLinks.records) {
        const tl = record.get("tl");
        const props = tl.properties as any;

        // Extract document slugs from requirement IDs
        // Format: "tenant:project:documentSlug:requirementRef"
        const sourceParts = props.sourceRequirementId.split(":");
        const targetParts = props.targetRequirementId.split(":");

        if (sourceParts.length < 3 || targetParts.length < 3) {
          errors.push(`Invalid requirement ID format: ${props.sourceRequirementId} or ${props.targetRequirementId}`);
          continue;
        }

        const sourceDocSlug = sourceParts[2];
        const targetDocSlug = targetParts[2];
        const key = `${sourceDocSlug}→${targetDocSlug}`;

        if (!linksByDocumentPair.has(key)) {
          linksByDocumentPair.set(key, []);
        }

        linksByDocumentPair.get(key)!.push({
          id: props.id,
          sourceRequirementId: props.sourceRequirementId,
          targetRequirementId: props.targetRequirementId,
          linkType: props.linkType,
          description: props.description || null,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
          tenant: props.tenant,
          projectKey: props.projectKey,
          sourceDocSlug,
          targetDocSlug
        });
      }

      // Create DocumentLinksets for each document pair
      for (const [key, links] of linksByDocumentPair.entries()) {
        const firstLink = links[0];
        const { tenant, projectKey, sourceDocSlug, targetDocSlug } = firstLink;
        const now = new Date().toISOString();

        try {
          const createLinksetQuery = `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            MATCH (sourceDoc:Document {slug: $sourceDocSlug, tenant: $tenantSlug, projectKey: $projectSlug})
            MATCH (targetDoc:Document {slug: $targetDocSlug, tenant: $tenantSlug, projectKey: $projectSlug})
            CREATE (linkset:DocumentLinkset {
              id: $id,
              tenant: $tenantSlug,
              projectKey: $projectSlug,
              sourceDocumentSlug: $sourceDocSlug,
              targetDocumentSlug: $targetDocSlug,
              linkCount: $linkCount,
              links: $links,
              createdAt: $now,
              updatedAt: $now
            })
            MERGE (project)-[:HAS_LINKSET]->(linkset)
            MERGE (linkset)-[:FROM_DOCUMENT]->(sourceDoc)
            MERGE (linkset)-[:TO_DOCUMENT]->(targetDoc)
            MERGE (sourceDoc)-[:LINKED_TO {linksetId: linkset.id}]->(targetDoc)
            RETURN linkset.id as linksetId
          `;

          const res = await tx.run(createLinksetQuery, {
            tenantSlug: slugify(tenant),
            projectSlug: slugify(projectKey),
            id: `linkset-migrated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sourceDocSlug,
            targetDocSlug,
            linkCount: links.length,
            links: links.map(link => ({
              id: link.id,
              sourceRequirementId: link.sourceRequirementId,
              targetRequirementId: link.targetRequirementId,
              linkType: link.linkType,
              description: link.description,
              createdAt: link.createdAt,
              updatedAt: link.updatedAt
            })),
            now
          });

          if (res.records.length > 0) {
            createdLinksets++;
            migratedLinks += links.length;
          } else {
            errors.push(`Failed to create linkset for ${sourceDocSlug} → ${targetDocSlug}`);
          }
        } catch (error) {
          errors.push(`Error creating linkset for ${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Delete the orphaned TraceLink nodes and their relationships
      const deleteOrphanedQuery = `
        MATCH (tl:TraceLink)
        DETACH DELETE tl
      `;
      await tx.run(deleteOrphanedQuery);

      return { migratedLinks, createdLinksets };
    });

    return {
      migratedLinks: result.migratedLinks,
      createdLinksets: result.createdLinksets,
      errors
    };
  } finally {
    await session.close();
  }
}

/**
 * Checks for orphaned TraceLink nodes that need migration
 */
export async function checkOrphanedTraceLinks(): Promise<number> {
  const session = getSession();
  try {
    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tl:TraceLink)
        RETURN count(tl) as count
      `;
      return tx.run(query);
    });

    if (result.records.length === 0) {
      return 0;
    }

    const count = result.records[0].get("count");
    return typeof count === "number" ? count : count.toNumber();
  } finally {
    await session.close();
  }
}
