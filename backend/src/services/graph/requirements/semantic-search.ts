import { getSession } from "../driver.js";
import type { ManagedTransaction } from "neo4j-driver";
import { embeddingService, type Embedding } from "../../embedding.js";

export interface SimilarRequirement {
  id: string;
  ref: string;
  text: string;
  pattern?: string;
  verification?: string;
  qaScore?: number;
  similarity: number;
}

export interface SemanticSearchOptions {
  minSimilarity?: number;  // Default: 0.7 (70% similar)
  limit?: number;          // Default: 10
  excludeArchived?: boolean; // Default: true
  excludeIds?: string[];   // Exclude specific requirement IDs
}

/**
 * Find requirements similar to a given requirement
 */
export async function findSimilarRequirements(
  tenant: string,
  projectKey: string,
  requirementId: string,
  options: SemanticSearchOptions = {}
): Promise<SimilarRequirement[]> {
  const {
    minSimilarity = 0.7,
    limit = 10,
    excludeArchived = true,
    excludeIds = []
  } = options;

  const session = getSession();

  try {
    // Get the target requirement's embedding
    const targetResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(
        `
        MATCH (req:Requirement {id: $id})
        RETURN req.embedding AS embedding, req.text AS text
        `,
        { id: requirementId }
      );
    });

    if (targetResult.records.length === 0) {
      throw new Error(`Requirement ${requirementId} not found`);
    }

    const targetEmbedding = targetResult.records[0].get('embedding') as Embedding;

    if (!targetEmbedding || targetEmbedding.length === 0) {
      throw new Error(`Requirement ${requirementId} has no embedding`);
    }

    // Vector similarity search using Neo4j vector index
    const searchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      let query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
        WHERE (req.deleted IS NULL OR req.deleted = false)
          AND req.id <> $excludeId
      `;

      if (excludeArchived) {
        query += `AND (req.archived IS NULL OR req.archived = false)\n`;
      }

      if (excludeIds.length > 0) {
        query += `AND NOT req.id IN $excludeIds\n`;
      }

      // Use vector similarity function
      query += `
        WITH req,
          vector.similarity.cosine(req.embedding, $targetEmbedding) AS similarity
        WHERE similarity >= $minSimilarity
          AND req.embedding IS NOT NULL
        RETURN
          req.id AS id,
          req.ref AS ref,
          req.text AS text,
          req.pattern AS pattern,
          req.verification AS verification,
          req.qaScore AS qaScore,
          similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      return tx.run(query, {
        tenantSlug: tenant,
        projectSlug: projectKey,
        excludeId: requirementId,
        excludeIds,
        targetEmbedding,
        minSimilarity,
        limit
      });
    });

    return searchResult.records.map(record => ({
      id: record.get('id'),
      ref: record.get('ref'),
      text: record.get('text'),
      pattern: record.get('pattern') || undefined,
      verification: record.get('verification') || undefined,
      qaScore: record.get('qaScore') || undefined,
      similarity: Number(record.get('similarity'))
    }));

  } finally {
    await session.close();
  }
}

/**
 * Search requirements by natural language query
 */
export async function searchRequirementsByQuery(
  tenant: string,
  projectKey: string,
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SimilarRequirement[]> {
  const {
    minSimilarity = 0.6,  // Lower threshold for free-text queries
    limit = 20,
    excludeArchived = true
  } = options;

  // Generate embedding for the search query
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  const session = getSession();

  try {
    const searchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      let query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
        WHERE (req.deleted IS NULL OR req.deleted = false)
      `;

      if (excludeArchived) {
        query += `AND (req.archived IS NULL OR req.archived = false)\n`;
      }

      query += `
        WITH req,
          vector.similarity.cosine(req.embedding, $queryEmbedding) AS similarity
        WHERE similarity >= $minSimilarity
          AND req.embedding IS NOT NULL
        RETURN
          req.id AS id,
          req.ref AS ref,
          req.text AS text,
          req.pattern AS pattern,
          req.verification AS verification,
          req.qaScore AS qaScore,
          similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      return tx.run(query, {
        tenantSlug: tenant,
        projectSlug: projectKey,
        queryEmbedding,
        minSimilarity,
        limit
      });
    });

    return searchResult.records.map(record => ({
      id: record.get('id'),
      ref: record.get('ref'),
      text: record.get('text'),
      pattern: record.get('pattern') || undefined,
      verification: record.get('verification') || undefined,
      qaScore: record.get('qaScore') || undefined,
      similarity: Number(record.get('similarity'))
    }));

  } finally {
    await session.close();
  }
}

/**
 * Find potential duplicate requirements
 * Uses high similarity threshold (0.85+)
 */
export async function findPotentialDuplicates(
  tenant: string,
  projectKey: string,
  requirementId: string
): Promise<SimilarRequirement[]> {
  return findSimilarRequirements(tenant, projectKey, requirementId, {
    minSimilarity: 0.85,  // High threshold for duplicates
    limit: 5,
    excludeArchived: false  // Include archived (might be duplicates)
  });
}
