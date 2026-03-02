import { randomUUID } from "node:crypto";
import type { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
import { getSession } from "../driver.js";
import type {
  SysmlDiagram,
  SysmlDiagramDetail,
  SysmlDiagramEdgeLayout,
  SysmlDiagramNodeLayout,
  SysmlDiagramType
} from "./types.js";

type ListParams = {
  tenant: string;
  projectKey: string;
  packageId?: string;
  diagramType?: SysmlDiagramType;
  search?: string;
};

type GetParams = {
  tenant: string;
  projectKey: string;
  diagramId: string;
};

function mapDiagram(node: Neo4jNode): SysmlDiagram {
  const props = node.properties;
  return {
    id: String(props.id),
    name: String(props.name ?? ""),
    description: props.description ? String(props.description) : null,
    diagramType: String(props.diagramType ?? "bdd") as SysmlDiagramType,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    packageId: props.packageId ? String(props.packageId) : null,
    layoutEngine: props.layoutEngine ? String(props.layoutEngine) as SysmlDiagram["layoutEngine"] : undefined,
    viewport: props.viewport ?? null,
    versionId: props.versionId ? String(props.versionId) : null,
    metadata: props.metadata ?? null,
    createdAt: String(props.createdAt ?? ""),
    updatedAt: String(props.updatedAt ?? ""),
    lifecycleState: props.lifecycleState ? String(props.lifecycleState) : null
  };
}

function mapNodeLayout(rel: Neo4jRelationship): SysmlDiagramNodeLayout {
  const props = rel.properties;
  const position = props.position ?? null;
  const size = props.size ?? null;
  const mappedPosition = position
    ? { x: position.x ?? position.positionX ?? null, y: position.y ?? position.positionY ?? null }
    : (props.positionX !== undefined || props.positionY !== undefined)
      ? { x: props.positionX ?? null, y: props.positionY ?? null }
      : null;

  const mappedSize = size
    ? { width: size.width ?? size.sizeWidth ?? null, height: size.height ?? size.sizeHeight ?? null }
    : (props.width !== undefined || props.height !== undefined)
      ? { width: props.width ?? null, height: props.height ?? null }
      : null;

  return {
    elementId: String(props.elementId ?? props.targetId ?? ""),
    position: mappedPosition,
    size: mappedSize,
    styleOverrides: props.styleOverrides ?? null,
    metadata: props.metadata ?? null
  };
}

function mapConnection(node: Neo4jNode): SysmlDiagramEdgeLayout {
  const props = node.properties;
  const controlPoints = props.controlPoints
    ? (props.controlPoints as Array<{ x: number; y: number }>)
    : null;

  return {
    connectionId: String(props.id),
    sourceId: String(props.source ?? ""),
    targetId: String(props.target ?? ""),
    controlPoints,
    style: {
      lineStyle: props.lineStyle ?? null,
      markerStart: props.markerStart ?? null,
      markerEnd: props.markerEnd ?? null,
      linePattern: props.linePattern ?? null,
      color: props.color ?? null,
      strokeWidth: props.strokeWidth ?? null,
      labelOffsetX: props.labelOffsetX ?? null,
      labelOffsetY: props.labelOffsetY ?? null
    }
  };
}

export async function listSysmlDiagrams(params: ListParams): Promise<SysmlDiagram[]> {
  const session = getSession();
  const search = params.search ? params.search.toLowerCase() : null;

  try {
    const result = await session.run(
      `
        MATCH (diag:SYSML_DIAGRAM)
        WHERE diag.tenant = $tenant
          AND diag.projectKey = $projectKey
          AND ($packageId IS NULL OR diag.packageId = $packageId)
          AND ($diagramType IS NULL OR diag.diagramType = $diagramType)
          AND ($search IS NULL OR toLower(diag.name) CONTAINS $search)
        RETURN diag
        ORDER BY diag.updatedAt DESC, diag.createdAt DESC
      `,
      {
        tenant: params.tenant,
        projectKey: params.projectKey,
        packageId: params.packageId ?? null,
        diagramType: params.diagramType ?? null,
        search
      }
    );

    return result.records
      .map(record => record.get("diag") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapDiagram);
  } finally {
    await session.close();
  }
}

export async function getSysmlDiagram(params: GetParams): Promise<SysmlDiagramDetail> {
  const session = getSession();

  try {
    return await session.executeRead(async (tx: ManagedTransaction) => {
      const diagResult = await tx.run(
        `
          MATCH (diag:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
          RETURN diag
        `,
        params
      );

      if (diagResult.records.length === 0) {
        throw new Error("SysML diagram not found");
      }

      const diagramNode = diagResult.records[0].get("diag") as Neo4jNode;

      const visualizeResult = await tx.run(
        `
          MATCH (diag:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
                -[vis:VISUALIZES]->(elem:SYSML_ELEMENT)
          RETURN vis, elem.id AS elementId
        `,
        params
      );

      const nodes: SysmlDiagramNodeLayout[] = visualizeResult.records.map(record => {
        const vis = record.get("vis") as Neo4jRelationship;
        const layout = mapNodeLayout(vis);
        return {
          ...layout,
          elementId: String(record.get("elementId"))
        };
      });

      const connectionResult = await tx.run(
        `
          MATCH (conn:SYSML_CONNECTION)
          WHERE conn.diagramId = $diagramId
            AND conn.tenant = $tenant
            AND conn.projectKey = $projectKey
          RETURN conn
        `,
        params
      );

      const connections: SysmlDiagramEdgeLayout[] = connectionResult.records
        .map(record => record.get("conn") as Neo4jNode | null)
        .filter((node): node is Neo4jNode => node !== null)
        .map(mapConnection);

      return {
        diagram: mapDiagram(diagramNode),
        nodes,
        connections
      };
    });
  } finally {
    await session.close();
  }
}

type CreateDiagramParams = {
  tenant: string;
  projectKey: string;
  name: string;
  diagramType: SysmlDiagramType;
  packageId?: string;
  description?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose";
  viewport?: { x: number; y: number; zoom: number } | null;
  metadata?: Record<string, unknown> | null;
};

export async function createSysmlDiagram(params: CreateDiagramParams): Promise<SysmlDiagram> {
  const session = getSession();
  const now = new Date().toISOString();
  const diagramId = randomUUID();

  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.packageId) {
        const pkgResult = await tx.run(
          `
            MATCH (pkg:SYSML_PACKAGE {id: $packageId, tenant: $tenant, projectKey: $projectKey})
            RETURN pkg
          `,
          {
            packageId: params.packageId,
            tenant: params.tenant,
            projectKey: params.projectKey
          }
        );

        if (pkgResult.records.length === 0) {
          throw new Error("SysML package not found");
        }
      }

      const createResult = await tx.run(
        `
          CREATE (diag:SYSML_DIAGRAM {
            id: $id,
            name: $name,
            description: $description,
            diagramType: $diagramType,
            tenant: $tenant,
            projectKey: $projectKey,
            packageId: $packageId,
            layoutEngine: $layoutEngine,
            viewport: $viewport,
            metadata: $metadata,
            lifecycleState: 'active',
            createdAt: $now,
            updatedAt: $now
          })
          RETURN diag
        `,
        {
          id: diagramId,
          name: params.name,
          description: params.description ?? null,
          diagramType: params.diagramType,
          tenant: params.tenant,
          projectKey: params.projectKey,
          packageId: params.packageId ?? null,
          layoutEngine: params.layoutEngine ?? "manual",
          viewport: params.viewport ?? null,
          metadata: params.metadata ?? null,
          now
        }
      );

      const diagramNode = createResult.records[0].get("diag") as Neo4jNode;

      if (params.packageId) {
        await tx.run(
          `
            MATCH (pkg:SYSML_PACKAGE {id: $packageId, tenant: $tenant, projectKey: $projectKey})
            MATCH (diag:SYSML_DIAGRAM {id: $id, tenant: $tenant, projectKey: $projectKey})
            MERGE (pkg)-[:CONTAINS]->(diag)
          `,
          {
            packageId: params.packageId,
            tenant: params.tenant,
            projectKey: params.projectKey,
            id: diagramId
          }
        );
      }

      return mapDiagram(diagramNode);
    });
  } finally {
    await session.close();
  }
}

type UpdateDiagramParams = {
  tenant: string;
  projectKey: string;
  diagramId: string;
  name?: string;
  description?: string | null;
  layoutEngine?: "manual" | "dagre" | "fcose" | null;
  viewport?: { x: number; y: number; zoom: number } | null;
  metadata?: Record<string, unknown> | null;
};

export async function updateSysmlDiagram(params: UpdateDiagramParams): Promise<SysmlDiagram> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const matchResult = await tx.run(
        `
          MATCH (diag:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
          RETURN diag
        `,
        params
      );

      if (matchResult.records.length === 0) {
        throw new Error("SysML diagram not found");
      }

      const updates: string[] = ["diag.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenant: params.tenant,
        projectKey: params.projectKey,
        diagramId: params.diagramId,
        now
      };

      if (params.name !== undefined) {
        updates.push("diag.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updates.push("diag.description = $description");
        queryParams.description = params.description;
      }
      if (params.layoutEngine !== undefined) {
        updates.push("diag.layoutEngine = $layoutEngine");
        queryParams.layoutEngine = params.layoutEngine;
      }
      if (params.viewport !== undefined) {
        updates.push("diag.viewport = $viewport");
        queryParams.viewport = params.viewport;
      }
      if (params.metadata !== undefined) {
        updates.push("diag.metadata = $metadata");
        queryParams.metadata = params.metadata;
      }

      if (updates.length === 1) {
        throw new Error("No fields provided for update");
      }

      const updateResult = await tx.run(
        `
          MATCH (diag:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
          SET ${updates.join(", ")}
          RETURN diag
        `,
        queryParams
      );

      return mapDiagram(updateResult.records[0].get("diag") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

type DeleteDiagramParams = {
  tenant: string;
  projectKey: string;
  diagramId: string;
};

export async function deleteSysmlDiagram(params: DeleteDiagramParams): Promise<void> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const result = await tx.run(
        `
          MATCH (diag:SYSML_DIAGRAM {id: $diagramId, tenant: $tenant, projectKey: $projectKey})
          SET diag.lifecycleState = 'archived',
              diag.updatedAt = $now
          RETURN diag
        `,
        {
          ...params,
          now
        }
      );

      if (result.records.length === 0) {
        throw new Error("SysML diagram not found");
      }
    });
  } finally {
    await session.close();
  }
}
