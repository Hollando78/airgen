import type { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship } from "neo4j-driver";
import { getSession } from "../driver.js";
import { randomUUID } from "node:crypto";
import type {
  SysmlElement,
  SysmlElementRelationship,
  SysmlElementType,
  SysmlBlockData,
  SysmlInterfaceData,
  SysmlPortData
} from "./types.js";

type ListParams = {
  tenant: string;
  projectKey: string;
  elementType?: SysmlElementType;
  packageId?: string;
  search?: string;
  limit?: number;
};

type GetParams = {
  tenant: string;
  projectKey: string;
  elementId: string;
};

function mapSysmlElement(node: Neo4jNode): SysmlElement {
  const props = node.properties;
  let blockData: SysmlBlockData | null = null;
  let interfaceData: SysmlInterfaceData | null = null;
  let portData: SysmlPortData | null = null;

  if ((props.elementType ?? "block") === "block") {
    const defaultSize = props.defaultSize ?? props.defaultDiagramStyle ?? null;
    blockData = {
      blockKind: props.blockKind ? String(props.blockKind) : null,
      isAbstract: props.isAbstract ?? null,
      defaultSize: defaultSize
        ? {
            width: defaultSize.width ?? defaultSize.sizeWidth ?? null,
            height: defaultSize.height ?? defaultSize.sizeHeight ?? null
          }
        : null,
      defaultStyle: props.defaultStyle ?? props.defaultDiagramStyle ?? null
    };
  }
  if ((props.elementType ?? "") === "interface") {
    interfaceData = {
      protocol: props.protocol ? String(props.protocol) : null,
      direction: props.direction ? String(props.direction) : null,
      rate: props.rate !== undefined && props.rate !== null ? Number(props.rate) : null,
      stereotype: props.stereotype ? String(props.stereotype) : null
    };
  }
  if ((props.elementType ?? "") === "port") {
    portData = {
      direction: props.direction ? String(props.direction) : null,
      portType: props.portType ? String(props.portType) : null,
      conjugated: props.isConjugated ?? props.conjugated ?? null,
      typeRef: props.typeRef ? String(props.typeRef) : null,
      protocol: props.protocol ? String(props.protocol) : null,
      rate: props.rate !== undefined && props.rate !== null ? Number(props.rate) : null
    };
  }

  return {
    id: String(props.id),
    sysmlId: String(props.sysmlId ?? props.id),
    name: String(props.name ?? ""),
    elementType: String(props.elementType ?? "block") as SysmlElementType,
    packageId: props.packageId ? String(props.packageId) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    lifecycleState: (props.lifecycleState ?? "draft") as SysmlElement["lifecycleState"],
    versionId: props.versionId ? String(props.versionId) : null,
    stereotype: props.stereotype ? String(props.stereotype) : null,
    documentation: props.documentation ? String(props.documentation) : null,
    metadata: props.metadata ?? null,
    createdAt: String(props.createdAt ?? ""),
    updatedAt: String(props.updatedAt ?? ""),
    block: blockData,
    interface: interfaceData,
    port: portData
  };
}

function mapRelationships(records: Array<{
  rel: Neo4jRelationship | null;
  target: Neo4jNode | null;
  direction: "outgoing" | "incoming";
}>): SysmlElementRelationship[] {
  return records
    .filter(record => record.rel !== null && record.target !== null)
    .map(record => ({
      id: record.rel!.properties.id ? String(record.rel!.properties.id) : undefined,
      type: record.rel!.type,
      direction: record.direction,
      targetId: String(record.target!.properties.id),
      metadata: record.rel!.properties.metadata ?? null
    }));
}

export async function listSysmlElements(params: ListParams): Promise<SysmlElement[]> {
  const session = getSession();
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const search = params.search ? params.search.toLowerCase() : null;

  try {
    const result = await session.run(
      `
        MATCH (elem:SYSML_ELEMENT)
        WHERE elem.tenant = $tenant
          AND elem.projectKey = $projectKey
          AND ($elementType IS NULL OR elem.elementType = $elementType)
          AND ($packageId IS NULL OR elem.packageId = $packageId)
          AND ($search IS NULL OR toLower(elem.name) CONTAINS $search)
        RETURN elem
        ORDER BY elem.name ASC
        LIMIT $limit
      `,
      {
        tenant: params.tenant,
        projectKey: params.projectKey,
        elementType: params.elementType ?? null,
        packageId: params.packageId ?? null,
        search,
        limit
      }
    );

    return result.records
      .map(record => record.get("elem") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapSysmlElement);
  } finally {
    await session.close();
  }
}

export async function getSysmlElement(params: GetParams): Promise<{ element: SysmlElement; relationships: SysmlElementRelationship[] }> {
  const session = getSession();

  try {
    const result = await session.run(
      `
        MATCH (elem:SYSML_ELEMENT {id: $elementId, tenant: $tenant, projectKey: $projectKey})
        OPTIONAL MATCH (elem)-[rel]->(outTarget:SYSML_ELEMENT)
        OPTIONAL MATCH (inTarget:SYSML_ELEMENT)-[inRel]->(elem)
        RETURN elem,
          collect(DISTINCT { rel: rel, target: outTarget, direction: 'outgoing' }) +
          collect(DISTINCT { rel: inRel, target: inTarget, direction: 'incoming' }) AS rels
      `,
      {
        elementId: params.elementId,
        tenant: params.tenant,
        projectKey: params.projectKey
      }
    );

    if (result.records.length === 0) {
      throw new Error("SysML element not found");
    }

    const record = result.records[0];
    const elementNode = record.get("elem") as Neo4jNode;
    const rels = record.get("rels") as Array<{ rel: Neo4jRelationship | null; target: Neo4jNode | null; direction: "outgoing" | "incoming" }>;

    return {
      element: mapSysmlElement(elementNode),
      relationships: mapRelationships(rels)
    };
  } finally {
    await session.close();
  }
}

type BlockPayload = {
  blockKind?: string | null;
  isAbstract?: boolean | null;
  defaultSize?: { width?: number | null; height?: number | null } | null;
  defaultStyle?: Record<string, unknown> | null;
};

type InterfacePayload = {
  protocol?: string | null;
  direction?: string | null;
  rate?: number | null;
};

type PortPayload = {
  direction?: string | null;
  portType?: string | null;
  isConjugated?: boolean | null;
  typeRef?: string | null;
  protocol?: string | null;
  rate?: number | null;
};

type CreateBlockParams = {
  tenant: string;
  projectKey: string;
  elementType: "block";
  name: string;
  packageId?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  block: BlockPayload;
};

type CreateInterfaceParams = {
  tenant: string;
  projectKey: string;
  elementType: "interface";
  name: string;
  packageId?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  interface: InterfacePayload;
};

type CreatePortParams = {
  tenant: string;
  projectKey: string;
  elementType: "port";
  name: string;
  packageId?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  port: PortPayload;
};

type CreateParams = CreateBlockParams | CreateInterfaceParams | CreatePortParams;

type UpdateParams = {
  tenant: string;
  projectKey: string;
  elementId: string;
  name?: string;
  stereotype?: string | null;
  documentation?: string | null;
  metadata?: Record<string, unknown> | null;
  block?: BlockPayload | null;
  interface?: InterfacePayload | null;
  port?: PortPayload | null;
};

type RelationshipCreateParams = {
  tenant: string;
  projectKey: string;
  sourceElementId: string;
  targetElementId: string;
  type: string;
  metadata?: Record<string, unknown> | null;
};

type RelationshipDeleteParams = {
  tenant: string;
  projectKey: string;
  elementId: string;
  relationshipId: string;
};

export async function createSysmlElement(params: CreateParams): Promise<SysmlElement> {
  const session = getSession();
  const now = new Date().toISOString();
  const elementId = randomUUID();
  const sysmlId = elementId;

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

      const baseParams: Record<string, unknown> = {
        id: elementId,
        sysmlId,
        name: params.name,
        packageId: params.packageId ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        stereotype: ("stereotype" in params ? params.stereotype ?? null : null),
        documentation: ("documentation" in params ? params.documentation ?? null : null),
        metadata: params.metadata ?? null,
        now
      };

      let createQuery: string;

      switch (params.elementType) {
        case "block": {
          const block = params.block;
          baseParams.blockKind = block.blockKind ?? null;
          baseParams.isAbstract = block.isAbstract ?? null;
          baseParams.defaultStyle = block.defaultStyle ?? null;
          baseParams.defaultSize = block.defaultSize ?? null;
          createQuery = `
            CREATE (elem:SYSML_ELEMENT:SYSML_BLOCK {
              id: $id,
              sysmlId: $sysmlId,
              name: $name,
              elementType: 'block',
              packageId: $packageId,
              tenant: $tenant,
              projectKey: $projectKey,
              lifecycleState: 'draft',
              stereotype: $stereotype,
              documentation: $documentation,
              metadata: $metadata,
              blockKind: $blockKind,
              isAbstract: $isAbstract,
              defaultStyle: $defaultStyle,
              defaultSize: $defaultSize,
              createdAt: $now,
              updatedAt: $now
            })
            RETURN elem
          `;
          break;
        }

        case "interface": {
          const iface = params.interface;
          baseParams.protocol = iface.protocol ?? null;
          baseParams.direction = iface.direction ?? null;
          baseParams.rate = iface.rate ?? null;
          createQuery = `
            CREATE (elem:SYSML_ELEMENT:SYSML_INTERFACE {
              id: $id,
              sysmlId: $sysmlId,
              name: $name,
              elementType: 'interface',
              packageId: $packageId,
              tenant: $tenant,
              projectKey: $projectKey,
              lifecycleState: 'draft',
              stereotype: $stereotype,
              documentation: $documentation,
              metadata: $metadata,
              protocol: $protocol,
              direction: $direction,
              rate: $rate,
              createdAt: $now,
              updatedAt: $now
            })
            RETURN elem
          `;
          break;
        }

        case "port": {
          const port = params.port;
          baseParams.direction = port.direction ?? null;
          baseParams.portType = port.portType ?? null;
          baseParams.isConjugated = port.isConjugated ?? null;
          baseParams.typeRef = port.typeRef ?? null;
          baseParams.protocol = port.protocol ?? null;
          baseParams.rate = port.rate ?? null;
          createQuery = `
            CREATE (elem:SYSML_ELEMENT:SYSML_PORT {
              id: $id,
              sysmlId: $sysmlId,
              name: $name,
              elementType: 'port',
              packageId: $packageId,
              tenant: $tenant,
              projectKey: $projectKey,
              lifecycleState: 'draft',
              stereotype: $stereotype,
              documentation: $documentation,
              metadata: $metadata,
              direction: $direction,
              portType: $portType,
              isConjugated: $isConjugated,
              typeRef: $typeRef,
              protocol: $protocol,
              rate: $rate,
              createdAt: $now,
              updatedAt: $now
            })
            RETURN elem
          `;
          break;
        }

        default:
          throw new Error(`Unsupported SysML element type: ${(params as { elementType: string }).elementType}`);
      }

      const createResult = await tx.run(createQuery, baseParams);
      const elementNode = createResult.records[0].get("elem") as Neo4jNode;

      if (params.packageId) {
        await tx.run(
          `
            MATCH (pkg:SYSML_PACKAGE {id: $packageId, tenant: $tenant, projectKey: $projectKey})
            MATCH (elem:SYSML_ELEMENT {id: $id, tenant: $tenant, projectKey: $projectKey})
            MERGE (pkg)-[:CONTAINS]->(elem)
          `,
          {
            packageId: params.packageId,
            tenant: params.tenant,
            projectKey: params.projectKey,
            id: elementId
          }
        );
      }

      return mapSysmlElement(elementNode);
    });
  } finally {
    await session.close();
  }
}

export async function updateSysmlElement(params: UpdateParams): Promise<SysmlElement> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const matchResult = await tx.run(
        `
          MATCH (elem:SYSML_ELEMENT {id: $elementId, tenant: $tenant, projectKey: $projectKey})
          RETURN elem
        `,
        {
          tenant: params.tenant,
          projectKey: params.projectKey,
          elementId: params.elementId
        }
      );

      if (matchResult.records.length === 0) {
        throw new Error("SysML element not found");
      }

      const elementNode = matchResult.records[0].get("elem") as Neo4jNode;
      const elementType = String(elementNode.properties.elementType ?? "block") as SysmlElementType;

      const updates: string[] = ["elem.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenant: params.tenant,
        projectKey: params.projectKey,
        elementId: params.elementId,
        now
      };

      if (params.name !== undefined) {
        updates.push("elem.name = $name");
        queryParams.name = params.name;
      }
      if (params.stereotype !== undefined) {
        updates.push("elem.stereotype = $stereotype");
        queryParams.stereotype = params.stereotype;
      }
      if (params.documentation !== undefined) {
        updates.push("elem.documentation = $documentation");
        queryParams.documentation = params.documentation;
      }
      if (params.metadata !== undefined) {
        updates.push("elem.metadata = $metadata");
        queryParams.metadata = params.metadata;
      }

      switch (elementType) {
        case "block": {
          if (params.block !== undefined) {
            const block = params.block;
            if (block) {
              if (block.blockKind !== undefined) {
                updates.push("elem.blockKind = $blockKind");
                queryParams.blockKind = block.blockKind;
              }
              if (block.isAbstract !== undefined) {
                updates.push("elem.isAbstract = $isAbstract");
                queryParams.isAbstract = block.isAbstract;
              }
              if (block.defaultStyle !== undefined) {
                updates.push("elem.defaultStyle = $defaultStyle");
                queryParams.defaultStyle = block.defaultStyle;
              }
              if (block.defaultSize !== undefined) {
                updates.push("elem.defaultSize = $defaultSize");
                queryParams.defaultSize = block.defaultSize ?? null;
              }
            }
          }
          break;
        }

        case "interface": {
          if (params.interface !== undefined) {
            const iface = params.interface;
            if (iface) {
              if (iface.protocol !== undefined) {
                updates.push("elem.protocol = $protocol");
                queryParams.protocol = iface.protocol;
              }
              if (iface.direction !== undefined) {
                updates.push("elem.direction = $direction");
                queryParams.direction = iface.direction;
              }
              if (iface.rate !== undefined) {
                updates.push("elem.rate = $rate");
                queryParams.rate = iface.rate;
              }
            }
          }
          break;
        }

        case "port": {
          if (params.port !== undefined) {
            const port = params.port;
            if (port) {
              if (port.direction !== undefined) {
                updates.push("elem.direction = $direction");
                queryParams.direction = port.direction;
              }
              if (port.portType !== undefined) {
                updates.push("elem.portType = $portType");
                queryParams.portType = port.portType;
              }
              if (port.isConjugated !== undefined) {
                updates.push("elem.isConjugated = $isConjugated");
                queryParams.isConjugated = port.isConjugated;
              }
              if (port.typeRef !== undefined) {
                updates.push("elem.typeRef = $typeRef");
                queryParams.typeRef = port.typeRef;
              }
              if (port.protocol !== undefined) {
                updates.push("elem.protocol = $portProtocol");
                queryParams.portProtocol = port.protocol;
              }
              if (port.rate !== undefined) {
                updates.push("elem.rate = $portRate");
                queryParams.portRate = port.rate;
              }
            }
          }
          break;
        }

        default:
          throw new Error(`Unsupported SysML element type: ${elementType}`);
      }

      if (updates.length === 1) {
        throw new Error("No fields provided for update");
      }

      const updateResult = await tx.run(
        `
          MATCH (elem:SYSML_ELEMENT {id: $elementId, tenant: $tenant, projectKey: $projectKey})
          SET ${updates.join(", ")}
          RETURN elem
        `,
        queryParams
      );

      return mapSysmlElement(updateResult.records[0].get("elem") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

type DeleteParams = {
  tenant: string;
  projectKey: string;
  elementId: string;
};

export async function deleteSysmlElement(params: DeleteParams): Promise<void> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const result = await tx.run(
        `
          MATCH (elem:SYSML_ELEMENT {id: $elementId, tenant: $tenant, projectKey: $projectKey})
          SET elem.lifecycleState = 'retired',
              elem.updatedAt = $now
          RETURN elem
        `,
        {
          ...params,
          now
        }
      );

      if (result.records.length === 0) {
        throw new Error("SysML element not found");
      }
    });
  } finally {
    await session.close();
  }
}

export async function createSysmlElementRelationship(params: RelationshipCreateParams): Promise<SysmlElementRelationship> {
  const session = getSession();
  const now = new Date().toISOString();
  const relationshipId = randomUUID();

  try {
    return await session.executeWrite(async (tx) => {
      const elementMatch = await tx.run(
        `
          MATCH (source:SYSML_ELEMENT {id: $sourceId, tenant: $tenant, projectKey: $projectKey})
          MATCH (target:SYSML_ELEMENT {id: $targetId, tenant: $tenant, projectKey: $projectKey})
          RETURN source, target
        `,
        {
          tenant: params.tenant,
          projectKey: params.projectKey,
          sourceId: params.sourceElementId,
          targetId: params.targetElementId
        }
      );

      if (elementMatch.records.length === 0) {
        throw new Error("SysML element not found");
      }

      const relationResult = await tx.run(
        `
          MATCH (source:SYSML_ELEMENT {id: $sourceId, tenant: $tenant, projectKey: $projectKey})
          MATCH (target:SYSML_ELEMENT {id: $targetId, tenant: $tenant, projectKey: $projectKey})
          MERGE (source)-[rel:${params.type} { id: $relId }]->(target)
          ON CREATE SET rel.createdAt = $now
          SET rel.updatedAt = $now,
              rel.metadata = $metadata
          RETURN rel
        `,
        {
          tenant: params.tenant,
          projectKey: params.projectKey,
          sourceId: params.sourceElementId,
          targetId: params.targetElementId,
          relId: relationshipId,
          metadata: params.metadata ?? null,
          now
        }
      );

      const rel = relationResult.records[0].get("rel") as Neo4jRelationship;

      return {
        id: relationshipId,
        type: params.type,
        direction: "outgoing",
        targetId: params.targetElementId,
        metadata: rel.properties.metadata ?? null
      };
    });
  } finally {
    await session.close();
  }
}

export async function deleteSysmlElementRelationship(params: RelationshipDeleteParams): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async tx => {
      const result = await tx.run(
        `
          MATCH (source:SYSML_ELEMENT {id: $elementId, tenant: $tenant, projectKey: $projectKey})
                -[rel {id: $relationshipId}]->(:SYSML_ELEMENT)
          DELETE rel
          RETURN source
        `,
        params
      );

      if (result.records.length === 0) {
        throw new Error("SysML relationship not found");
      }
    });
  } finally {
    await session.close();
  }
}
