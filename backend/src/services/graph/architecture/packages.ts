import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import type { PackageRecord } from "./package-types.js";

function mapPackage(node: Neo4jNode): PackageRecord {
  const props = node.properties;
  return {
    id: String(props.id),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    parentId: props.parentId ? String(props.parentId) : null,
    order: Number(props.order ?? 0),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createPackage(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  parentId?: string | null;
  order?: number;
}): Promise<PackageRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const packageId = `package-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // If parentId is provided, verify it exists
      if (params.parentId) {
        const parentCheck = await tx.run(
          `
          MATCH (parent:Package {id: $parentId, tenant: $tenant, projectKey: $projectKey})
          RETURN parent
          `,
          { parentId: params.parentId, tenant: params.tenant, projectKey: params.projectKey }
        );

        if (parentCheck.records.length === 0) {
          throw new Error("Parent package not found");
        }
      }

      const query = params.parentId
        ? `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
          MERGE (tenant)-[:OWNS]->(project)
          MATCH (parent:Package {id: $parentId, tenant: $tenant, projectKey: $projectKey})
          CREATE (package:Package {
            id: $packageId,
            name: $name,
            description: $description,
            tenant: $tenant,
            projectKey: $projectKey,
            parentId: $parentId,
            order: $order,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (parent)-[:CONTAINS]->(package)
          RETURN package
        `
        : `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
          MERGE (tenant)-[:OWNS]->(project)
          CREATE (package:Package {
            id: $packageId,
            name: $name,
            description: $description,
            tenant: $tenant,
            projectKey: $projectKey,
            parentId: null,
            order: $order,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (project)-[:HAS_PACKAGE]->(package)
          RETURN package
        `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        packageId,
        name: params.name,
        description: params.description ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        parentId: params.parentId ?? null,
        order: params.order ?? 0,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create package");
      }

      const node = queryResult.records[0].get("package") as Neo4jNode;
      return mapPackage(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function getPackages(params: {
  tenant: string;
  projectKey: string;
}): Promise<PackageRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:HAS_PACKAGE|CONTAINS*]->(package:Package)
        WHERE package.tenant = $tenant AND package.projectKey = $projectKey
        RETURN DISTINCT package
        ORDER BY package.order, package.createdAt
      `,
      { tenantSlug, projectSlug, tenant: params.tenant, projectKey: params.projectKey }
    );

    return result.records
      .map(record => record.get("package") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapPackage);
  } finally {
    await session.close();
  }
}

export async function updatePackage(params: {
  tenant: string;
  projectKey: string;
  packageId: string;
  name?: string;
  description?: string;
  order?: number;
}): Promise<PackageRecord> {
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updates: string[] = ["package.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenant: params.tenant,
        projectKey: params.projectKey,
        packageId: params.packageId,
        now: new Date().toISOString()
      };

      if (params.name !== undefined) {
        updates.push("package.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updates.push("package.description = $description");
        queryParams.description = params.description;
      }
      if (params.order !== undefined) {
        updates.push("package.order = $order");
        queryParams.order = params.order;
      }

      if (updates.length === 1) {
        throw new Error("No fields provided for update");
      }

      const query = `
        MATCH (package:Package {id: $packageId, tenant: $tenant, projectKey: $projectKey})
        SET ${updates.join(", ")}
        RETURN package
      `;

      const res = await tx.run(query, queryParams);

      if (res.records.length === 0) {
        throw new Error("Package not found");
      }

      return mapPackage(res.records[0].get("package") as Neo4jNode);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function moveToPackage(params: {
  tenant: string;
  projectKey: string;
  itemId: string;
  itemType: 'package' | 'block' | 'diagram';
  targetPackageId: string | null;
  order?: number;
}): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const itemLabel = params.itemType === 'package' ? 'Package'
                      : params.itemType === 'block' ? 'ArchitectureBlockDefinition'
                      : 'ArchitectureDiagram';

      // Remove existing CONTAINS relationships
      await tx.run(
        `
        MATCH ()-[rel:CONTAINS]->(item:${itemLabel} {id: $itemId, tenant: $tenant, projectKey: $projectKey})
        DELETE rel
        `,
        { itemId: params.itemId, tenant: params.tenant, projectKey: params.projectKey }
      );

      if (params.targetPackageId) {
        // Add to target package
        const query = `
          MATCH (item:${itemLabel} {id: $itemId, tenant: $tenant, projectKey: $projectKey})
          MATCH (target:Package {id: $targetPackageId, tenant: $tenant, projectKey: $projectKey})
          SET item.order = $order, item.updatedAt = $now
          ${params.itemType === 'package' ? ', item.parentId = $targetPackageId' : ''}
          MERGE (target)-[:CONTAINS]->(item)
        `;

        await tx.run(query, {
          itemId: params.itemId,
          targetPackageId: params.targetPackageId,
          tenant: params.tenant,
          projectKey: params.projectKey,
          order: params.order ?? 0,
          now: new Date().toISOString()
        });
      } else {
        // Move to project root
        const tenantSlug = slugify(params.tenant);
        const projectSlug = slugify(params.projectKey);

        const relationshipType = params.itemType === 'package' ? 'HAS_PACKAGE'
                               : params.itemType === 'block' ? 'HAS_BLOCK_DEFINITION'
                               : 'HAS_ARCHITECTURE_DIAGRAM';

        const query = `
          MATCH (item:${itemLabel} {id: $itemId, tenant: $tenant, projectKey: $projectKey})
          MATCH (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          SET item.order = $order, item.updatedAt = $now
          ${params.itemType === 'package' ? ', item.parentId = null' : ''}
          MERGE (project)-[:${relationshipType}]->(item)
        `;

        await tx.run(query, {
          itemId: params.itemId,
          tenant: params.tenant,
          projectKey: params.projectKey,
          tenantSlug,
          projectSlug,
          order: params.order ?? 0,
          now: new Date().toISOString()
        });
      }
    });
  } finally {
    await session.close();
  }
}

export async function reorderInPackage(params: {
  tenant: string;
  projectKey: string;
  packageId: string | null;
  itemIds: string[];
}): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      for (let i = 0; i < params.itemIds.length; i++) {
        const itemId = params.itemIds[i];

        // Update order for each item (works for any node type with id property)
        await tx.run(
          `
          MATCH (item {id: $itemId, tenant: $tenant, projectKey: $projectKey})
          SET item.order = $order, item.updatedAt = $now
          `,
          {
            itemId,
            tenant: params.tenant,
            projectKey: params.projectKey,
            order: i,
            now: new Date().toISOString()
          }
        );
      }
    });
  } finally {
    await session.close();
  }
}

export async function deletePackage(params: {
  tenant: string;
  projectKey: string;
  packageId: string;
  cascade?: boolean;
}): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.cascade) {
        // Delete package and all nested packages recursively
        const query = `
          MATCH (package:Package {id: $packageId, tenant: $tenant, projectKey: $projectKey})
          OPTIONAL MATCH (package)-[:CONTAINS*]->(child)
          DETACH DELETE child, package
        `;

        await tx.run(query, {
          packageId: params.packageId,
          tenant: params.tenant,
          projectKey: params.projectKey
        });
      } else {
        // Check if package has children
        const childCheck = await tx.run(
          `
          MATCH (package:Package {id: $packageId, tenant: $tenant, projectKey: $projectKey})-[:CONTAINS]->(child)
          RETURN COUNT(child) as count
          `,
          {
            packageId: params.packageId,
            tenant: params.tenant,
            projectKey: params.projectKey
          }
        );

        const childCount = childCheck.records[0]?.get("count")?.toNumber() ?? 0;
        if (childCount > 0) {
          throw new Error("Cannot delete package with children. Use cascade=true or move children first.");
        }

        // Delete empty package
        await tx.run(
          `
          MATCH (package:Package {id: $packageId, tenant: $tenant, projectKey: $projectKey})
          DETACH DELETE package
          `,
          {
            packageId: params.packageId,
            tenant: params.tenant,
            projectKey: params.projectKey
          }
        );
      }
    });
  } finally {
    await session.close();
  }
}
