/**
 * Neo4j Cypher Query Builder Utilities
 *
 * This module provides helper functions for building parameterized Neo4j queries.
 * While @neo4j/cypher-builder is installed, this module uses a simpler approach
 * with parameterized string templates for better compatibility and maintainability.
 *
 * Benefits:
 * - Security: All queries use parameters to prevent injection attacks
 * - Maintainability: Centralized query construction logic
 * - Testability: Query logic can be unit tested independently
 */

import type { Session, ManagedTransaction } from "neo4j-driver";
import { int as neo4jInt } from "neo4j-driver";

/**
 * Query result with cypher and parameters
 */
export interface CypherQuery {
  cypher: string;
  params: Record<string, unknown>;
}

/**
 * Execute a parameterized Cypher query
 *
 * @param session - Neo4j session or transaction
 * @param query - Built Cypher query
 * @returns Query result
 */
export async function executeCypherQuery<T = unknown>(
  sessionOrTx: Session | ManagedTransaction,
  query: CypherQuery
) {
  return await sessionOrTx.run(query.cypher, query.params);
}

/**
 * Build a query to list requirements with pagination and sorting
 * Uses parameterized Cypher with CASE expression for safe ordering
 */
export function buildListRequirementsQuery(params: {
  tenantSlug: string;
  projectSlug: string;
  orderBy: "ref" | "createdAt" | "qaScore";
  orderDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
}): CypherQuery {
  const cypher = `
    MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
    OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
    OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
    WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
    UNWIND reqs AS requirement
    WITH DISTINCT requirement
    WHERE requirement IS NOT NULL
      AND (requirement.deleted IS NULL OR requirement.deleted = false)
      AND (requirement.archived IS NULL OR requirement.archived = false)
    RETURN requirement
    ORDER BY
      CASE $orderBy
        WHEN 'createdAt' THEN requirement.createdAt
        WHEN 'qaScore' THEN requirement.qaScore
        ELSE requirement.ref
      END ${params.orderDirection},
      requirement.ref ASC
    SKIP $offset
    LIMIT $limit
  `;

  return {
    cypher,
    params: {
      tenantSlug: params.tenantSlug,
      projectSlug: params.projectSlug,
      orderBy: params.orderBy,
      offset: neo4jInt(params.offset),
      limit: neo4jInt(params.limit)
    }
  };
}

/**
 * Build a query to suggest requirement links based on text search
 */
export function buildSuggestLinksQuery(params: {
  tenantSlug: string;
  projectSlug: string;
  searchText: string;
  limit: number;
}): CypherQuery {
  const cypher = `
    MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement)
    WHERE toLower(requirement.text) CONTAINS $searchText
    RETURN requirement.ref AS ref, requirement.title AS title, requirement.path AS path
    LIMIT $limit
  `;

  return {
    cypher,
    params: {
      tenantSlug: params.tenantSlug,
      projectSlug: params.projectSlug,
      searchText: params.searchText.toLowerCase(),
      limit: params.limit
    }
  };
}
