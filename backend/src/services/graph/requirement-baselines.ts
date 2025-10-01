import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import type { BaselineRecord} from "../workspace.js";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";

function mapBaseline(node: Neo4jNode): BaselineRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    createdAt: String(props.createdAt),
    author: props.author ? String(props.author) : null,
    label: props.label ? String(props.label) : null,
    requirementRefs: Array.isArray(props.requirementRefs)
      ? (props.requirementRefs as string[])
      : []
  };
}

export async function createBaseline(params: {
  tenant: string;
  projectKey: string;
  label?: string;
  author?: string;
}): Promise<BaselineRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        SET project.baselineCounter = coalesce(project.baselineCounter, 0) + 1
        WITH tenant, project, project.baselineCounter AS counter
        WITH tenant, project, counter,
             right('000' + toString(counter), 3) AS padded,
             toUpper(replace($projectSlug, '-', '')) AS upper
        WITH tenant, project, padded, upper,
             'BL-' + upper + '-' + padded AS ref
        OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH tenant, project, ref, collect(DISTINCT directReq) + collect(DISTINCT docReq) AS reqs
        WITH tenant, project, ref, [req IN reqs WHERE req IS NOT NULL] AS requirements
        CREATE (baseline:Baseline {
          id: $tenantSlug + ':' + $projectSlug + ':' + ref,
          ref: ref,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          createdAt: $now,
          author: $author,
          label: $label,
          requirementRefs: [req IN requirements | req.ref]
        })
        MERGE (project)-[:HAS_BASELINE]->(baseline)
        FOREACH (req IN requirements | MERGE (baseline)-[:SNAPSHOT_OF]->(req))
        RETURN baseline
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        projectKey: params.projectKey,
        author: params.author ?? null,
        label: params.label ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create baseline node");
      }

      const node = res.records[0].get("baseline") as Neo4jNode;
      return mapBaseline(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listBaselines(tenant: string, projectKey: string): Promise<BaselineRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_BASELINE]->(baseline:Baseline)
        RETURN baseline
        ORDER BY baseline.createdAt DESC
      `,
      { tenantSlug, projectSlug }
    );

    const baselines: BaselineRecord[] = [];
    for (const record of result.records) {
      const node = record.get("baseline") as Neo4jNode;
      baselines.push(mapBaseline(node));
    }

    return baselines;
  } finally {
    await session.close();
  }
}
