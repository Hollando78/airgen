import type { Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import { mapRequirement } from "./requirements-mapper.js";
import type { RequirementRecord } from "../../workspace.js";

/**
 * Fetches a single requirement by ref
 *
 * @param tenant - Tenant slug
 * @param projectKey - Project key/slug
 * @param ref - Requirement reference (e.g., "REQ-001")
 * @returns Requirement record or null if not found
 */
export async function getRequirement(
  tenant: string,
  projectKey: string,
  ref: string
): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(direct:Requirement {ref: $ref})
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement {ref: $ref})
        WITH coalesce(direct, docReq) AS requirement
        WHERE requirement IS NOT NULL
        RETURN requirement
        LIMIT 1
      `,
      { tenantSlug, projectSlug, ref }
    );

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get("requirement") as Neo4jNode;
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}
