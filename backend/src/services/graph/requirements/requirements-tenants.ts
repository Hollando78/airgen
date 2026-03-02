import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import type { TenantRecord, ProjectRecord } from "../../workspace.js";

function mapTenant(node: Neo4jNode, projectCount: number): TenantRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    slug: String(props.slug),
    name: props.name ? String(props.name) : null,
    createdAt: props.createdAt ? String(props.createdAt) : null,
    projectCount,
    isOwner: false
  };
}

function mapProject(node: Neo4jNode, requirementCount: number): ProjectRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    slug: String(props.slug),
    tenantSlug: String(props.tenantSlug),
    key: props.key ? String(props.key) : null,
    name: props.name ? String(props.name) : null,
    description: props.description ? String(props.description) : null,
    code: props.code ? String(props.code) : null,
    createdAt: props.createdAt ? String(props.createdAt) : null,
    requirementCount
  };
}

export async function listTenants(filterSlugs?: string[]): Promise<TenantRecord[]> {
  const normalizedSlugs = Array.isArray(filterSlugs)
    ? Array.from(new Set(filterSlugs.map(slug => slugify(slug))))
    : null;

  if (normalizedSlugs && normalizedSlugs.length === 0) {
    return [];
  }

  const session = getSession();

  try {
    const query = normalizedSlugs
      ? `
        MATCH (tenant:Tenant)
        WHERE tenant.slug IN $tenantSlugs
        OPTIONAL MATCH (tenant)-[:OWNS]->(project:Project)
        RETURN tenant, count(project) AS projectCount
        ORDER BY tenant.slug
      `
      : `
        MATCH (tenant:Tenant)
        OPTIONAL MATCH (tenant)-[:OWNS]->(project:Project)
        RETURN tenant, count(project) AS projectCount
        ORDER BY tenant.slug
      `;

    const result = await session.run(query, normalizedSlugs ? { tenantSlugs: normalizedSlugs } : undefined);

    const tenants: TenantRecord[] = [];
    for (const record of result.records) {
      const node = record.get("tenant") as Neo4jNode;
      const projectCount = Number(record.get("projectCount")) || 0;
      tenants.push(mapTenant(node, projectCount));
    }

    return tenants;
  } finally {
    await session.close();
  }
}

export async function listProjects(tenant: string): Promise<ProjectRecord[]> {
  const tenantSlug = slugify(tenant);
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project)
        OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT directReq) + collect(DISTINCT docReq) AS reqs
        WITH project, [req IN reqs WHERE req IS NOT NULL] AS requirements
        RETURN project, size(requirements) AS requirementCount
        ORDER BY project.slug
      `,
      { tenantSlug }
    );

    const projects: ProjectRecord[] = [];
    for (const record of result.records) {
      const node = record.get("project") as Neo4jNode;
      const requirementCount = Number(record.get("requirementCount")) || 0;
      projects.push(mapProject(node, requirementCount));
    }

    return projects;
  } finally {
    await session.close();
  }
}

export async function createTenant(input: { slug: string; name?: string }): Promise<TenantRecord> {
  const tenantSlug = slugify(input.slug);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        CREATE (tenant:Tenant {slug: $tenantSlug, name: $name, createdAt: $now})
        RETURN tenant
      `;

      const createResult = await tx.run(query, {
        tenantSlug,
        name: input.name || null,
        now
      });

      if (createResult.records.length === 0) {
        throw new Error("Failed to create tenant");
      }

      return createResult.records[0]!.get("tenant") as Neo4jNode;
    });

    return mapTenant(result, 0);
  } finally {
    await session.close();
  }
}

export async function createProject(input: {
  tenantSlug: string;
  slug: string;
  key?: string;
  name?: string;
  description?: string;
  code?: string;
}): Promise<ProjectRecord> {
  const tenantSlug = slugify(input.tenantSlug);
  const projectSlug = slugify(input.slug);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})
        CREATE (tenant)-[:OWNS]->(project:Project {
          slug: $projectSlug,
          tenantSlug: $tenantSlug,
          key: $key,
          name: $name,
          description: $description,
          code: $code,
          createdAt: $now
        })
        RETURN project
      `;

      const createResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        key: input.key || null,
        name: input.name || null,
        description: input.description || null,
        code: input.code || null,
        now
      });

      if (createResult.records.length === 0) {
        throw new Error("Failed to create project or tenant not found");
      }

      return createResult.records[0]!.get("project") as Neo4jNode;
    });

    return mapProject(result, 0);
  } finally {
    await session.close();
  }
}

export async function updateProject(
  tenantSlug: string,
  projectSlug: string,
  updates: { name?: string; description?: string; code?: string; key?: string },
): Promise<ProjectRecord> {
  const normalizedTenant = slugify(tenantSlug);
  const normalizedProject = slugify(projectSlug);

  const setClauses: string[] = [];
  const params: Record<string, unknown> = {
    tenantSlug: normalizedTenant,
    projectSlug: normalizedProject,
  };

  if (updates.name !== undefined) {
    setClauses.push("project.name = $name");
    params.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push("project.description = $description");
    params.description = updates.description;
  }
  if (updates.code !== undefined) {
    setClauses.push("project.code = $code");
    params.code = updates.code;
  }
  if (updates.key !== undefined) {
    setClauses.push("project.key = $key");
    params.key = updates.key;
  }

  if (setClauses.length === 0) {
    throw new Error("No fields to update");
  }

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        SET ${setClauses.join(", ")}
        WITH project
        OPTIONAL MATCH (project)-[:CONTAINS]->(directReq:Requirement)
        OPTIONAL MATCH (project)-[:HAS_DOCUMENT]->(:Document)-[:CONTAINS]->(docReq:Requirement)
        WITH project, collect(DISTINCT directReq) + collect(DISTINCT docReq) AS reqs
        RETURN project, size([r IN reqs WHERE r IS NOT NULL]) AS requirementCount
      `;

      const updateResult = await tx.run(query, params);

      if (updateResult.records.length === 0) {
        throw new Error("Project not found");
      }

      return {
        node: updateResult.records[0]!.get("project") as Neo4jNode,
        count: Number(updateResult.records[0]!.get("requirementCount")) || 0,
      };
    });

    return mapProject(result.node, result.count);
  } finally {
    await session.close();
  }
}

export async function deleteTenant(slug: string): Promise<boolean> {
  const tenantSlug = slugify(slug);

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})
        OPTIONAL MATCH (tenant)-[:OWNS]->(project:Project)
        OPTIONAL MATCH (project)-[:CONTAINS]->(requirement:Requirement)
        DETACH DELETE tenant, project, requirement
        RETURN COUNT(tenant) as deletedCount
      `;

      const deleteResult = await tx.run(query, { tenantSlug });
      return Number(deleteResult.records[0]?.get("deletedCount") || 0);
    });

    return result > 0;
  } finally {
    await session.close();
  }
}

export async function deleteProject(tenantSlug: string, slug: string): Promise<boolean> {
  const normalizedTenantSlug = slugify(tenantSlug);
  const projectSlug = slugify(slug);

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:CONTAINS]->(requirement:Requirement)
        DETACH DELETE project, requirement
        RETURN COUNT(project) as deletedCount
      `;

      const deleteResult = await tx.run(query, {
        tenantSlug: normalizedTenantSlug,
        projectSlug
      });
      return Number(deleteResult.records[0]?.get("deletedCount") || 0);
    });

    return result > 0;
  } finally {
    await session.close();
  }
}
