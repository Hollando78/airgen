import type { Node as Neo4jNode, ManagedTransaction } from "neo4j-driver";
import { int as neo4jInt } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import { mapRequirement } from "./requirements-crud.js";
import type { RequirementRecord } from "../../workspace.js";
import { getCached, CacheKeys, CacheInvalidation } from "../../../lib/cache.js";

export interface ListOptions {
  limit?: number;     // Default 100, max 1000
  offset?: number;    // Default 0
}

export async function listRequirements(
  tenant: string,
  projectKey: string,
  options?: ListOptions
): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const limit = parseInt(String(Math.min(options?.limit ?? 100, 1000)), 10);
  const offset = parseInt(String(options?.offset ?? 0), 10);

  // Cache for 1 minute (60 seconds) - invalidate on update
  const cacheKey = CacheKeys.requirements(tenantSlug, projectSlug, limit, offset);

  return getCached(
    cacheKey,
    async () => {
      const session = getSession();
      try {
        // QUERY PROFILE: expected <100ms for typical datasets with pagination
        const result = await session.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
            OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
            OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
            WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
            UNWIND reqs AS requirement
            WITH DISTINCT requirement
            WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
            RETURN requirement
            ORDER BY requirement.ref
            SKIP $offset
            LIMIT $limit
          `,
          { tenantSlug, projectSlug, offset: neo4jInt(offset), limit: neo4jInt(limit) }
        );

        return result.records.map(record => {
          const node = record.get("requirement") as Neo4jNode;
          return mapRequirement(node);
        });
      } finally {
        await session.close();
      }
    },
    60 // 1 minute TTL
  );
}

export async function listSectionRequirements(sectionId: string): Promise<RequirementRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (section:DocumentSection {id: $sectionId})-[:HAS_REQUIREMENT]->(requirement:Requirement)
        WHERE requirement.deleted IS NULL OR requirement.deleted = false
        RETURN requirement
        ORDER BY requirement.ref
      `,
      { sectionId }
    );

    const items: RequirementRecord[] = [];
    for (const record of result.records) {
      const node = record.get("requirement") as Neo4jNode;
      items.push(mapRequirement(node));
    }

    return items;
  } finally {
    await session.close();
  }
}

export async function suggestLinks(params: {
  tenant: string;
  projectKey: string;
  text: string;
  limit?: number;
}): Promise<Array<{ ref: string; title: string; path: string }>> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const limit = params.limit ?? 3;
  const needle = params.text.split(/\s+/)[0]?.toLowerCase() ?? "";

  if (!needle) {return [];}

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement)
        WHERE toLower(requirement.text) CONTAINS $needle
        RETURN requirement.ref AS ref, requirement.title AS title, requirement.path AS path
        LIMIT $limit
      `,
      { tenantSlug, projectSlug, needle, limit }
    );

    const suggestions: Array<{ ref: string; title: string; path: string }> = [];
    for (const record of result.records) {
      suggestions.push({
        ref: String(record.get("ref")),
        title: String(record.get("title")),
        path: String(record.get("path"))
      });
    }

    return suggestions;
  } finally {
    await session.close();
  }
}

export async function findDuplicateRequirementRefs(
  tenant: string,
  projectKey: string
): Promise<{ ref: string; count: number; requirements: RequirementRecord[] }[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
        UNWIND reqs AS requirement
        WITH DISTINCT requirement
        WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
        WITH requirement.ref AS ref, collect(requirement) AS requirements
        WHERE size(requirements) > 1
        RETURN ref, size(requirements) AS count, requirements
        ORDER BY ref
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => ({
      ref: record.get("ref"),
      count: Number(record.get("count")),
      requirements: record.get("requirements").map((node: Neo4jNode) => mapRequirement(node))
    }));
  } finally {
    await session.close();
  }
}

export async function fixDuplicateRequirementRefs(
  tenant: string,
  projectKey: string
): Promise<{ fixed: number; changes: Array<{ oldRef: string; newRef: string; requirementId: string }> }> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const now = new Date().toISOString();
      const changes: Array<{ oldRef: string; newRef: string; requirementId: string }> = [];

      const duplicateQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT direct) + collect(DISTINCT docReq) AS reqs
        UNWIND reqs AS requirement
        WITH DISTINCT requirement
        WHERE requirement IS NOT NULL AND (requirement.deleted IS NULL OR requirement.deleted = false)
        WITH requirement.ref AS ref, collect(requirement) AS requirements
        WHERE size(requirements) > 1
        RETURN ref, requirements
        ORDER BY ref
      `;

      const duplicateResult = await tx.run(duplicateQuery, { tenantSlug, projectSlug });

      for (const record of duplicateResult.records) {
        const duplicateRef = record.get("ref");
        const requirements = record.get("requirements") as Neo4jNode[];

        const refParts = duplicateRef.split('-');
        const prefix = refParts.slice(0, -1).join('-');

        const maxQuery = `
          MATCH (req:Requirement)
          WHERE req.ref STARTS WITH $prefix + '-' AND req.ref =~ ($prefix + '-[0-9]{3}')
          WITH max(toInteger(split(req.ref, '-')[size(split(req.ref, '-'))-1])) AS maxExisting
          RETURN maxExisting
        `;

        const maxResult = await tx.run(maxQuery, { prefix });
        const maxExisting = maxResult.records[0]?.get("maxExisting");
        let nextNumber = (maxExisting ? Number(maxExisting) : 0) + 1;

        for (let i = 1; i < requirements.length; i++) {
          const requirement = requirements[i];
          const newRef = prefix + '-' + String(nextNumber).padStart(3, '0');

          const updateQuery = `
            MATCH (requirement:Requirement {id: $requirementId})
            SET requirement.ref = $newRef,
                requirement.updatedAt = $now,
                requirement.path = $tenantSlug + '/' + $projectSlug + '/requirements/' + $newRef + '.md'
            RETURN requirement.id AS id
          `;

          await tx.run(updateQuery, {
            requirementId: (requirement.properties as Record<string, unknown>).id,
            newRef,
            now,
            tenantSlug,
            projectSlug
          });

          changes.push({
            oldRef: duplicateRef,
            newRef,
            requirementId: String((requirement.properties as Record<string, unknown>).id)
          });

          nextNumber++;
        }
      }

      return changes;
    });

    return {
      fixed: result.length,
      changes: result
    };
  } finally {
    await session.close();
  }
}
