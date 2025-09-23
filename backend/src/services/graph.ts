import neo4j, { Driver, Session, ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { config } from "../config.js";
import {
  RequirementRecord,
  BaselineRecord,
  RequirementPattern,
  VerificationMethod,
  slugify
} from "./workspace.js";

let driver: Driver | null = null;

function getEncryption(): "ENCRYPTION_ON" | "ENCRYPTION_OFF" {
  return config.graph.encrypted ? "ENCRYPTION_ON" : "ENCRYPTION_OFF";
}

export async function initGraph(): Promise<void> {
  if (!driver) {
    driver = neo4j.driver(
      config.graph.url,
      neo4j.auth.basic(config.graph.username, config.graph.password),
      { encrypted: getEncryption() }
    );
  }

  await driver.verifyConnectivity();
}

export async function closeGraph(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

function getSession(): Session {
  if (!driver) {
    throw new Error("Graph driver not initialized. Call initGraph() first.");
  }
  return driver.session({ database: config.graph.database });
}

export type RequirementInput = {
  tenant: string;
  projectKey: string;
  title: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
};

function mapRequirement(node: Neo4jNode): RequirementRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    title: String(props.title),
    text: String(props.text),
    pattern: props.pattern ? (props.pattern as RequirementPattern) : undefined,
    verification: props.verification ? (props.verification as VerificationMethod) : undefined,
    qaScore: props.qaScore !== null && props.qaScore !== undefined ? Number(props.qaScore) : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : undefined,
    tags: Array.isArray(props.tags) ? (props.tags as string[]) : undefined,
    path: String(props.path),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

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

export async function createRequirement(input: RequirementInput): Promise<RequirementRecord> {
  const tenantSlug = slugify(input.tenant || config.defaultTenant);
  const projectSlug = slugify(input.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.name = $tenantName, tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = $now
        SET project.requirementCounter = coalesce(project.requirementCounter, 0) + 1
        WITH tenant, project, project.requirementCounter AS counter
        WITH tenant, project, counter,
             right('000' + toString(counter), 3) AS padded,
             toUpper(replace($projectSlug, '-', '')) AS upper
        WITH tenant, project, counter, padded, upper,
             'REQ-' + upper + '-' + padded AS ref
        CREATE (requirement:Requirement {
          id: $tenantSlug + ':' + $projectSlug + ':' + ref,
          ref: ref,
          tenant: $tenantSlug,
          projectKey: $projectSlug,
          title: $title,
          text: $text,
          pattern: $pattern,
          verification: $verification,
          qaScore: $qaScore,
          qaVerdict: $qaVerdict,
          suggestions: $suggestions,
          tags: $tags,
          path: $tenantSlug + '/' + $projectSlug + '/requirements/' + ref + '.md',
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (tenant)-[:OWNS]->(project)
        MERGE (project)-[:CONTAINS]->(requirement)
        RETURN requirement
      `;

      const res = await tx.run(query, {
        tenantSlug,
        tenantName: input.tenant,
        projectSlug,
        projectKey: input.projectKey,
        title: input.title,
        text: input.text,
        pattern: input.pattern ?? null,
        verification: input.verification ?? null,
        qaScore: input.qaScore ?? null,
        qaVerdict: input.qaVerdict ?? null,
        suggestions: input.suggestions ?? [],
        tags: input.tags ?? [],
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create requirement node");
      }

      const node = res.records[0].get("requirement") as Neo4jNode;
      return mapRequirement(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function listRequirements(tenant: string, projectKey: string): Promise<RequirementRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement)
        RETURN requirement
        ORDER BY requirement.ref
      `,
      { tenantSlug, projectSlug }
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

export async function getRequirement(tenant: string, projectKey: string, ref: string): Promise<RequirementRecord | null> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement {ref: $ref})
        RETURN requirement
      `,
      { tenantSlug, projectSlug, ref }
    );

    if (result.records.length === 0) return null;
    const node = result.records[0].get("requirement") as Neo4jNode;
    return mapRequirement(node);
  } finally {
    await session.close();
  }
}

export async function updateRequirementTimestamp(tenant: string, projectKey: string, ref: string): Promise<void> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:CONTAINS]->(requirement:Requirement {ref: $ref})
        SET requirement.updatedAt = $now
      `,
      { tenantSlug, projectSlug, ref, now }
    );
  } finally {
    await session.close();
  }
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
        MATCH (project)-[:CONTAINS]->(requirement:Requirement)
        WITH tenant, project, ref, collect(requirement) AS requirements
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

  if (!needle) return [];

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
