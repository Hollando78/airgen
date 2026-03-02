import { randomUUID } from "node:crypto";
import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { getSession } from "../driver.js";
import { slugify } from "../../workspace.js";
import type { SysmlPackage, SysmlPackageKind } from "./types.js";

function mapSysmlPackage(node: Neo4jNode): SysmlPackage {
  const props = node.properties;
  const defaultViewpoints = props.defaultViewpoints
    ? (Array.isArray(props.defaultViewpoints)
      ? props.defaultViewpoints.map((value: unknown) => String(value))
      : [])
    : undefined;

  return {
    id: String(props.id),
    name: String(props.name),
    packageKind: String(props.packageKind) as SysmlPackageKind,
    parentId: props.parentId ? String(props.parentId) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    isRoot: Boolean(props.isRoot ?? false),
    defaultViewpoints,
    metadata: props.metadata ?? null,
    lifecycleState: props.lifecycleState ? String(props.lifecycleState) as SysmlPackage["lifecycleState"] : undefined,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

type ListParams = {
  tenant: string;
  projectKey: string;
  includeArchived?: boolean;
};

export async function listSysmlPackages(params: ListParams): Promise<SysmlPackage[]> {
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (pkg:SYSML_PACKAGE)
        WHERE pkg.tenant = $tenant
          AND pkg.projectKey = $projectKey
          AND ($includeArchived = true OR pkg.lifecycleState IS NULL OR pkg.lifecycleState <> 'archived')
        RETURN pkg
        ORDER BY pkg.isRoot DESC, pkg.createdAt ASC
      `,
      {
        tenant: params.tenant,
        projectKey: params.projectKey,
        includeArchived: Boolean(params.includeArchived)
      }
    );

    return result.records
      .map(record => record.get("pkg") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapSysmlPackage);
  } finally {
    await session.close();
  }
}

type CreateParams = {
  tenant: string;
  projectKey: string;
  name: string;
  packageKind: SysmlPackage["packageKind"];
  parentId?: string | null;
  defaultViewpoints?: string[];
  metadata?: Record<string, unknown> | null;
};

export async function createSysmlPackage(params: CreateParams): Promise<SysmlPackage> {
  const session = getSession();
  const now = new Date().toISOString();
  const packageId = randomUUID();
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.parentId) {
        const parent = await tx.run(
          `
            MATCH (parent:SYSML_PACKAGE {id: $parentId, tenant: $tenant, projectKey: $projectKey})
            RETURN parent
          `,
          {
            parentId: params.parentId,
            tenant: params.tenant,
            projectKey: params.projectKey
          }
        );

        if (parent.records.length === 0) {
          throw new Error("Parent package not found");
        }
      }

      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
        MERGE (tenant)-[:OWNS]->(project)
        CREATE (pkg:SYSML_PACKAGE {
          id: $packageId,
          name: $name,
          packageKind: $packageKind,
          parentId: $parentId,
          tenant: $tenant,
          projectKey: $projectKey,
          isRoot: $isRoot,
          defaultViewpoints: $defaultViewpoints,
          metadata: $metadata,
          lifecycleState: 'active',
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_SYSML_PACKAGE]->(pkg)
        WITH pkg
        OPTIONAL MATCH (parent:SYSML_PACKAGE {id: $parentId, tenant: $tenant, projectKey: $projectKey})
        FOREACH (_ IN CASE WHEN parent IS NULL THEN [] ELSE [1] END |
          MERGE (parent)-[:CONTAINS]->(pkg)
        )
        RETURN pkg
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        packageId,
        name: params.name,
        packageKind: params.packageKind,
        parentId: params.parentId ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        isRoot: params.parentId ? false : true,
        defaultViewpoints: params.defaultViewpoints ?? [],
        metadata: params.metadata ?? null,
        now
      });

      if (res.records.length === 0) {
        throw new Error("Failed to create SysML package");
      }

      const node = res.records[0].get("pkg") as Neo4jNode;
      return mapSysmlPackage(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

type UpdateParams = {
  tenant: string;
  projectKey: string;
  packageId: string;
  name?: string;
  packageKind?: SysmlPackage["packageKind"];
  defaultViewpoints?: string[];
  metadata?: Record<string, unknown> | null;
};

export async function updateSysmlPackage(params: UpdateParams): Promise<SysmlPackage> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClauses = ["pkg.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenant: params.tenant,
        projectKey: params.projectKey,
        packageId: params.packageId,
        now
      };

      if (params.name !== undefined) {
        setClauses.push("pkg.name = $name");
        queryParams.name = params.name;
      }

      if (params.packageKind !== undefined) {
        setClauses.push("pkg.packageKind = $packageKind");
        queryParams.packageKind = params.packageKind;
      }

      if (params.defaultViewpoints !== undefined) {
        setClauses.push("pkg.defaultViewpoints = $defaultViewpoints");
        queryParams.defaultViewpoints = params.defaultViewpoints;
      }

      if (params.metadata !== undefined) {
        setClauses.push("pkg.metadata = $metadata");
        queryParams.metadata = params.metadata;
      }

      if (setClauses.length === 1) {
        throw new Error("No fields provided for update");
      }

      const res = await tx.run(
        `
          MATCH (pkg:SYSML_PACKAGE {id: $packageId, tenant: $tenant, projectKey: $projectKey})
          SET ${setClauses.join(", ")}
          RETURN pkg
        `,
        queryParams
      );

      if (res.records.length === 0) {
        throw new Error("SysML package not found");
      }

      return mapSysmlPackage(res.records[0].get("pkg") as Neo4jNode);
    });

    return result;
  } finally {
    await session.close();
  }
}

type DeleteParams = {
  tenant: string;
  projectKey: string;
  packageId: string;
};

export async function deleteSysmlPackage(params: DeleteParams): Promise<void> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(
        `
          MATCH (pkg:SYSML_PACKAGE {id: $packageId, tenant: $tenant, projectKey: $projectKey})
          SET pkg.lifecycleState = 'archived',
              pkg.updatedAt = $now
          RETURN pkg
        `,
        {
          packageId: params.packageId,
          tenant: params.tenant,
          projectKey: params.projectKey,
          now
        }
      );

      if (res.records.length === 0) {
        throw new Error("SysML package not found");
      }
    });
  } finally {
    await session.close();
  }
}
