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
export interface ListRequirementsFilters {
  tags?: string[];
  documentSlug?: string;
  sectionId?: string;
  pattern?: string;
  verification?: string;
  textContains?: string;
  complianceStatus?: string;
  qaScoreMin?: number;
  qaScoreMax?: number;
}

export function buildListRequirementsQuery(params: {
  tenantSlug: string;
  projectSlug: string;
  orderBy: "ref" | "createdAt" | "qaScore";
  orderDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  filters?: ListRequirementsFilters;
}): CypherQuery {
  const filters = params.filters;
  const filterByDoc = filters?.documentSlug;
  const filterBySection = filters?.sectionId;

  // When filtering by document or section, use a targeted MATCH instead of the union approach
  let matchClause: string;
  if (filterBySection) {
    matchClause = `
    MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
    MATCH (section:DocumentSection {id: $filterSectionId})-[:CONTAINS]->(requirement:Requirement)
    OPTIONAL MATCH (requirement)<-[:CONTAINS]-(doc:Document)<-[:HAS_DOCUMENT]-(project)
    WITH requirement, doc.slug AS documentSlug, section.id AS sectionId`;
  } else if (filterByDoc) {
    matchClause = `
    MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
    MATCH (project)-[:HAS_DOCUMENT]->(doc:Document {slug: $filterDocSlug})-[:CONTAINS]->(requirement:Requirement)
    OPTIONAL MATCH (requirement)<-[:CONTAINS]-(section:DocumentSection)
    WITH requirement, doc.slug AS documentSlug, section.id AS sectionId`;
  } else {
    matchClause = `
    MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
    OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
    OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)-[:CONTAINS]->(docReq:Requirement)
    WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs,
         collect(DISTINCT {req: docReq, slug: doc.slug}) AS docMap
    UNWIND reqs AS requirement
    WITH DISTINCT requirement,
         [x IN docMap WHERE x.req = requirement | x.slug][0] AS documentSlug,
         null AS sectionId`;
  }

  // Build WHERE clauses
  const whereClauses = [
    'requirement IS NOT NULL',
    '(requirement.deleted IS NULL OR requirement.deleted = false)',
    '(requirement.archived IS NULL OR requirement.archived = false)'
  ];

  if (filters?.tags?.length) {
    whereClauses.push('any(t IN $filterTags WHERE t IN coalesce(requirement.tags, []))');
  }
  if (filters?.pattern) {
    whereClauses.push('requirement.pattern = $filterPattern');
  }
  if (filters?.verification) {
    whereClauses.push('requirement.verification = $filterVerification');
  }
  if (filters?.complianceStatus) {
    whereClauses.push('requirement.complianceStatus = $filterComplianceStatus');
  }
  if (filters?.textContains) {
    whereClauses.push('toLower(requirement.text) CONTAINS $filterTextContains');
  }
  if (filters?.qaScoreMin !== undefined) {
    whereClauses.push('coalesce(requirement.qaScore, 0) >= $filterQaScoreMin');
  }
  if (filters?.qaScoreMax !== undefined) {
    whereClauses.push('coalesce(requirement.qaScore, 0) <= $filterQaScoreMax');
  }

  const cypher = `
    ${matchClause}
    WHERE ${whereClauses.join('\n      AND ')}
    RETURN requirement, documentSlug, sectionId
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

  const queryParams: Record<string, unknown> = {
    tenantSlug: params.tenantSlug,
    projectSlug: params.projectSlug,
    orderBy: params.orderBy,
    offset: neo4jInt(params.offset),
    limit: neo4jInt(params.limit)
  };

  if (filters?.tags?.length) queryParams.filterTags = filters.tags;
  if (filterByDoc) queryParams.filterDocSlug = filterByDoc;
  if (filterBySection) queryParams.filterSectionId = filterBySection;
  if (filters?.pattern) queryParams.filterPattern = filters.pattern;
  if (filters?.verification) queryParams.filterVerification = filters.verification;
  if (filters?.complianceStatus) queryParams.filterComplianceStatus = filters.complianceStatus;
  if (filters?.textContains) queryParams.filterTextContains = filters.textContains.toLowerCase();
  if (filters?.qaScoreMin !== undefined) queryParams.filterQaScoreMin = filters.qaScoreMin;
  if (filters?.qaScoreMax !== undefined) queryParams.filterQaScoreMax = filters.qaScoreMax;

  return { cypher, params: queryParams };
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
