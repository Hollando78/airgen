import { ManagedTransaction, Node as Neo4jNode, Relationship as Neo4jRelationship, Integer } from "neo4j-driver";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";

export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type BlockPortRecord = {
  id: string;
  name: string;
  direction: "in" | "out" | "inout";
};

export type ArchitectureBlockDefinitionRecord = {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string | null;
  description?: string | null;
  tenant: string;
  projectKey: string;
  ports: BlockPortRecord[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArchitectureBlockLibraryRecord = ArchitectureBlockDefinitionRecord & {
  diagrams: Array<{ id: string; name: string }>;
};

export type ArchitectureBlockRecord = ArchitectureBlockDefinitionRecord & {
  diagramId: string;
  positionX: number;
  positionY: number;
  sizeWidth: number;
  sizeHeight: number;
  placementCreatedAt: string;
  placementUpdatedAt: string;
};

export type ConnectorKind = "association" | "flow" | "dependency" | "composition";

export type ArchitectureConnectorRecord = {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  tenant: string;
  projectKey: string;
  diagramId: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchitectureDiagramRecord = {
  id: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  view: "block" | "internal" | "deployment";
  createdAt: string;
  updatedAt: string;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === "object" && "toNumber" in value) {
    try {
      return (value as Integer).toNumber();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  try {
    return JSON.parse(String(value)) as T[];
  } catch {
    return [];
  }
}

function mapBlockDefinition(node: Neo4jNode, documentIds: string[] = []): ArchitectureBlockDefinitionRecord {
  const props = node.properties as Record<string, unknown>;
  const fallbackDocumentIds = parseJsonArray<string>(props.documentIds);
  const resolvedDocumentIds = documentIds.length ? documentIds : fallbackDocumentIds;

  return {
    id: String(props.id),
    name: String(props.name ?? ""),
    kind: String(props.kind ?? "component") as BlockKind,
    stereotype: props.stereotype ? String(props.stereotype) : null,
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant ?? ""),
    projectKey: String(props.projectKey ?? ""),
    ports: parseJsonArray<BlockPortRecord>(props.ports),
    documentIds: resolvedDocumentIds,
    createdAt: String(props.createdAt ?? new Date().toISOString()),
    updatedAt: String(props.updatedAt ?? new Date().toISOString())
  };
}

function mapBlockWithPlacement(
  node: Neo4jNode,
  rel?: Neo4jRelationship | null,
  fallbackDiagramId?: string,
  documentIds: string[] = []
): ArchitectureBlockRecord {
  const definition = mapBlockDefinition(node, documentIds);
  const relProps = rel?.properties as Record<string, unknown> | undefined;

  const diagramId = relProps?.diagramId
    ? String(relProps.diagramId)
    : fallbackDiagramId ?? String((node.properties as Record<string, unknown>).diagramId ?? "");

  const positionX = toNumber(relProps?.positionX ?? (node.properties as Record<string, unknown>).positionX, 0);
  const positionY = toNumber(relProps?.positionY ?? (node.properties as Record<string, unknown>).positionY, 0);
  const sizeWidth = toNumber(relProps?.sizeWidth ?? (node.properties as Record<string, unknown>).sizeWidth, 220);
  const sizeHeight = toNumber(relProps?.sizeHeight ?? (node.properties as Record<string, unknown>).sizeHeight, 140);

  const placementCreatedAt = relProps?.createdAt
    ? String(relProps.createdAt)
    : String((node.properties as Record<string, unknown>).createdAt ?? new Date().toISOString());

  const placementUpdatedAt = relProps?.updatedAt
    ? String(relProps.updatedAt)
    : String((node.properties as Record<string, unknown>).updatedAt ?? new Date().toISOString());

  return {
    ...definition,
    diagramId,
    positionX,
    positionY,
    sizeWidth,
    sizeHeight,
    placementCreatedAt,
    placementUpdatedAt
  };
}

function mapBlockLibraryEntry(
  node: Neo4jNode,
  diagramRefs: Array<{ id?: unknown; name?: unknown }> = [],
  documentIds: string[] = []
): ArchitectureBlockLibraryRecord {
  const definition = mapBlockDefinition(node, documentIds);
  const diagrams = (diagramRefs ?? [])
    .map(ref => ({
      id: ref?.id ? String(ref.id) : "",
      name: ref?.name ? String(ref.name) : ""
    }))
    .filter(ref => ref.id.length > 0);

  return {
    ...definition,
    diagrams
  };
}

function mapArchitectureDiagram(node: Neo4jNode): ArchitectureDiagramRecord {
  const props = node.properties as Record<string, unknown>;

  return {
    id: String(props.id),
    name: String(props.name),
    description: props.description ? String(props.description) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    view: (props.view ? String(props.view) : "block") as ArchitectureDiagramRecord["view"],
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

function mapArchitectureConnector(node: Neo4jNode): ArchitectureConnectorRecord {
  const props = node.properties as Record<string, unknown>;

  return {
    id: String(props.id),
    source: String(props.source),
    target: String(props.target),
    kind: String(props.kind) as ConnectorKind,
    label: props.label ? String(props.label) : null,
    sourcePortId: props.sourcePortId ? String(props.sourcePortId) : null,
    targetPortId: props.targetPortId ? String(props.targetPortId) : null,
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    diagramId: String(props.diagramId ?? ""),
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}

export async function createArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  positionX: number;
  positionY: number;
  sizeWidth?: number;
  sizeHeight?: number;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  ports?: BlockPortRecord[];
  documentIds?: string[];
  existingBlockId?: string;
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const positionX = params.positionX;
  const positionY = params.positionY;
  const sizeWidth = params.sizeWidth ?? 220;
  const sizeHeight = params.sizeHeight ?? 140;

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.existingBlockId) {
        const reuseResult = await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
            MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $existingBlockId})
            MERGE (diagram)-[rel:HAS_BLOCK]->(block)
            SET rel.diagramId = $diagramId,
                rel.positionX = $positionX,
                rel.positionY = $positionY,
                rel.sizeWidth = $sizeWidth,
                rel.sizeHeight = $sizeHeight,
                rel.updatedAt = $now,
                rel.createdAt = coalesce(rel.createdAt, $now)
            WITH block, rel
            OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
            RETURN block, rel, collect(document.id) AS documentIds
          `,
          {
            tenantSlug,
            projectSlug,
            diagramId: params.diagramId,
            existingBlockId: params.existingBlockId,
            positionX,
            positionY,
            sizeWidth,
            sizeHeight,
            now
          }
        );

        if (reuseResult.records.length === 0) {
          throw new Error("Architecture block definition not found");
        }

        return reuseResult.records[0];
      }

      if (!params.name || !params.kind) {
        throw new Error("Block name and kind are required when creating a new block definition");
      }

      const blockId = `block-${Date.now()}`;
      const createResult = await tx.run(
        `
          MERGE (tenant:Tenant {slug: $tenantSlug})
            ON CREATE SET tenant.createdAt = $now
          MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
            ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
          MERGE (tenant)-[:OWNS]->(project)
          WITH project
          MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
          CREATE (block:ArchitectureBlock {
            id: $blockId,
            name: $name,
            kind: $kind,
            stereotype: $stereotype,
            description: $description,
            tenant: $tenant,
            projectKey: $projectKey,
            ports: $ports,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (project)-[:HAS_ARCHITECTURE_BLOCK]->(block)
          MERGE (diagram)-[rel:HAS_BLOCK]->(block)
          SET rel.diagramId = $diagramId,
              rel.positionX = $positionX,
              rel.positionY = $positionY,
              rel.sizeWidth = $sizeWidth,
              rel.sizeHeight = $sizeHeight,
              rel.createdAt = $now,
              rel.updatedAt = $now
          WITH block, rel, $documentIds AS documentIds
          OPTIONAL MATCH (block)-[existing:LINKED_DOCUMENT]->(:Document)
          DELETE existing
          WITH block, rel, documentIds
          CALL {
            WITH block, documentIds
            UNWIND documentIds AS documentId
            MATCH (document:Document {id: documentId})
            MERGE (block)-[:LINKED_DOCUMENT]->(document)
            RETURN count(*) AS linked
          }
          WITH block, rel
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
          RETURN block, rel, collect(DISTINCT document.id) AS documentIds
        `,
        {
          tenantSlug,
          projectSlug,
          projectKey: params.projectKey,
          diagramId: params.diagramId,
          blockId,
          name: params.name,
          kind: params.kind,
          stereotype: params.stereotype ?? null,
          description: params.description ?? null,
          tenant: params.tenant,
          ports: JSON.stringify(params.ports ?? []),
          positionX,
          positionY,
          sizeWidth,
          sizeHeight,
          now,
          documentIds: params.documentIds ?? []
        }
      );

      if (createResult.records.length === 0) {
        throw new Error("Failed to create architecture block definition");
      }

      return createResult.records[0];
    });

    const blockNode = record.get("block") as Neo4jNode;
    const rel = record.get("rel") as Neo4jRelationship | undefined;
    const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
    return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
  } finally {
    await session.close();
  }
}

export async function getArchitectureBlocks(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
}): Promise<ArchitectureBlockRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        MATCH (diagram)-[rel:HAS_BLOCK]->(block:ArchitectureBlock)
        OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
        RETURN block, rel, collect(DISTINCT document.id) AS documentIds
        ORDER BY rel.createdAt, block.createdAt
      `,
      {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId
      }
    );

    return result.records.map(record => {
      const blockNode = record.get("block") as Neo4jNode;
      const rel = record.get("rel") as Neo4jRelationship | undefined;
      const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
      return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
    });
  } finally {
    await session.close();
  }
}

export async function getArchitectureBlockLibrary(params: {
  tenant: string;
  projectKey: string;
}): Promise<ArchitectureBlockLibraryRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)
        OPTIONAL MATCH (diagram:ArchitectureDiagram)-[rel:HAS_BLOCK]->(block)
        OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
        WITH block, collect(DISTINCT { id: rel.diagramId, name: diagram.name }) AS diagrams, collect(DISTINCT document.id) AS documentIds
        RETURN block, diagrams, documentIds
        ORDER BY block.name
      `,
      { tenantSlug, projectSlug }
    );

    return result.records.map(record => {
      const blockNode = record.get("block") as Neo4jNode;
      const diagrams = record.get("diagrams") as Array<{ id?: unknown; name?: unknown }>;
      const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
      return mapBlockLibraryEntry(blockNode, diagrams, documentIds);
    });
  } finally {
    await session.close();
  }
}

export async function updateArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
  diagramId: string;
  name?: string;
  kind?: BlockKind;
  stereotype?: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  sizeWidth?: number;
  sizeHeight?: number;
  ports?: BlockPortRecord[];
  documentIds?: string[];
}): Promise<ArchitectureBlockRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const record = await session.executeWrite(async (tx: ManagedTransaction) => {
      const nodeUpdates: string[] = [];
      const nodeParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        blockId: params.blockId,
        now
      };

      if (params.name !== undefined) {
        nodeUpdates.push("block.name = $name");
        nodeParams.name = params.name;
      }
      if (params.kind !== undefined) {
        nodeUpdates.push("block.kind = $kind");
        nodeParams.kind = params.kind;
      }
      if (params.stereotype !== undefined) {
        nodeUpdates.push("block.stereotype = $stereotype");
        nodeParams.stereotype = params.stereotype;
      }
      if (params.description !== undefined) {
        nodeUpdates.push("block.description = $description");
        nodeParams.description = params.description;
      }
      if (params.ports !== undefined) {
        nodeUpdates.push("block.ports = $ports");
        nodeParams.ports = JSON.stringify(params.ports);
      }
      if (nodeUpdates.length > 0) {
        nodeUpdates.push("block.updatedAt = $now");
        const nodeQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          SET ${nodeUpdates.join(", ")}
          RETURN block
        `;

        const nodeResult = await tx.run(nodeQuery, nodeParams);
        if (nodeResult.records.length === 0) {
          throw new Error("Architecture block not found");
        }
      }

      const relUpdates: string[] = [];
      const relParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        blockId: params.blockId,
        now
      };

      if (params.positionX !== undefined) {
        relUpdates.push("rel.positionX = $positionX");
        relParams.positionX = params.positionX;
      }
      if (params.positionY !== undefined) {
        relUpdates.push("rel.positionY = $positionY");
        relParams.positionY = params.positionY;
      }
      if (params.sizeWidth !== undefined) {
        relUpdates.push("rel.sizeWidth = $sizeWidth");
        relParams.sizeWidth = params.sizeWidth;
      }
      if (params.sizeHeight !== undefined) {
        relUpdates.push("rel.sizeHeight = $sizeHeight");
        relParams.sizeHeight = params.sizeHeight;
      }

      if (relUpdates.length > 0) {
        relUpdates.push("rel.updatedAt = $now");
        const relQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          SET ${relUpdates.join(", ")}
          RETURN rel
        `;

        const relResult = await tx.run(relQuery, relParams);
        if (relResult.records.length === 0) {
          throw new Error("Architecture block placement not found");
        }
      }

      if (params.documentIds !== undefined) {
        const documentQuery = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[existing:LINKED_DOCUMENT]->(:Document)
          DELETE existing
          WITH block, $documentIds AS documentIds
          CALL {
            WITH block, documentIds
            UNWIND documentIds AS documentId
            MATCH (document:Document {id: documentId})
            MERGE (block)-[:LINKED_DOCUMENT]->(document)
            RETURN count(*) AS _linked
          }
          RETURN block
        `;

        const documentResult = await tx.run(documentQuery, {
          tenantSlug,
          projectSlug,
          blockId: params.blockId,
          documentIds: params.documentIds
        });

        if (documentResult.records.length === 0) {
          throw new Error("Architecture block not found when updating documents");
        }
      }

      const finalResult = await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (block)-[:LINKED_DOCUMENT]->(document:Document)
          RETURN block, rel, collect(DISTINCT document.id) AS documentIds
        `,
        {
          tenantSlug,
          projectSlug,
          diagramId: params.diagramId,
          blockId: params.blockId
        }
      );

      if (finalResult.records.length === 0) {
        throw new Error("Architecture block not found");
      }

      return finalResult.records[0];
    });

    const blockNode = record.get("block") as Neo4jNode;
    const rel = record.get("rel") as Neo4jRelationship | undefined;
    const documentIds = (record.get("documentIds") as unknown[] | undefined)?.map(String) ?? [];
    return mapBlockWithPlacement(blockNode, rel, params.diagramId, documentIds);
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureBlock(params: {
  tenant: string;
  projectKey: string;
  blockId: string;
  diagramId?: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      if (params.diagramId) {
        const res = await tx.run(
          `
            MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[rel:HAS_BLOCK]->(block:ArchitectureBlock {id: $blockId})
            OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
              WHERE connector.source = $blockId OR connector.target = $blockId
            WITH rel, connector
            DETACH DELETE connector
            DELETE rel
            RETURN COUNT(rel) AS removed
          `,
          {
            tenantSlug,
            projectSlug,
            diagramId: params.diagramId,
            blockId: params.blockId
          }
        );

        const removed = toNumber(res.records[0]?.get("removed"), 0);
        if (removed === 0) {
          throw new Error("Architecture block placement not found");
        }
        return;
      }

      const res = await tx.run(
        `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $blockId})
          OPTIONAL MATCH (diagram:ArchitectureDiagram)-[rel:HAS_BLOCK]->(block)
          OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
            WHERE connector.source = $blockId OR connector.target = $blockId
          DETACH DELETE connector
          DELETE rel
          DETACH DELETE block
          RETURN COUNT(block) AS removed
        `,
        {
          tenantSlug,
          projectSlug,
          blockId: params.blockId
        }
      );

      const removed = toNumber(res.records[0]?.get("removed"), 0);
      if (removed === 0) {
        throw new Error("Architecture block not found");
      }
    });
  } finally {
    await session.close();
  }
}

export async function createArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
}): Promise<ArchitectureConnectorRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const connectorId = `connector-${Date.now()}`;

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        MATCH (diagram)-[:HAS_BLOCK]->(source:ArchitectureBlock {id: $source})
        MATCH (diagram)-[:HAS_BLOCK]->(target:ArchitectureBlock {id: $target})
        CREATE (connector:ArchitectureConnector {
          id: $connectorId,
          source: $source,
          target: $target,
          kind: $kind,
          label: $label,
          sourcePortId: $sourcePortId,
          targetPortId: $targetPortId,
          tenant: $tenant,
          projectKey: $projectKey,
          diagramId: $diagramId,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_ARCHITECTURE_CONNECTOR]->(connector)
        MERGE (diagram)-[:HAS_CONNECTOR]->(connector)
        MERGE (connector)-[:FROM_BLOCK]->(source)
        MERGE (connector)-[:TO_BLOCK]->(target)
        RETURN connector
      `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        connectorId,
        source: params.source,
        target: params.target,
        kind: params.kind,
        label: params.label ?? null,
        sourcePortId: params.sourcePortId ?? null,
        targetPortId: params.targetPortId ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create architecture connector");
      }

      return queryResult.records[0].get("connector") as Neo4jNode;
    });

    return mapArchitectureConnector(result);
  } finally {
    await session.close();
  }
}

export async function getArchitectureConnectors(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
}): Promise<ArchitectureConnectorRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
        RETURN connector
        ORDER BY connector.createdAt
      `,
      {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId
      }
    );

    return result.records.map(record => mapArchitectureConnector(record.get("connector") as Neo4jNode));
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  connectorId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[:HAS_CONNECTOR]->(connector:ArchitectureConnector {id: $connectorId})
        DETACH DELETE connector
        RETURN COUNT(*) AS removed
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        connectorId: params.connectorId
      });

      const removed = toNumber(res.records[0]?.get("removed"), 0);
      if (removed === 0) {
        throw new Error("Architecture connector not found");
      }
    });
  } finally {
    await session.close();
  }
}

export async function createArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description?: string;
  view?: ArchitectureDiagramRecord["view"];
}): Promise<ArchitectureDiagramRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const diagramId = `diagram-${Date.now()}`;

  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = $now
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.projectKey = $projectKey, project.createdAt = $now
        MERGE (tenant)-[:OWNS]->(project)
        CREATE (diagram:ArchitectureDiagram {
          id: $diagramId,
          name: $name,
          description: $description,
          view: $view,
          tenant: $tenant,
          projectKey: $projectKey,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram)
        RETURN diagram
      `;

      const queryResult = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId,
        name: params.name,
        description: params.description ?? null,
        view: params.view ?? "block",
        tenant: params.tenant,
        projectKey: params.projectKey,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Project not found for architecture diagram creation");
      }

      const node = queryResult.records[0].get("diagram") as Neo4jNode;
      return mapArchitectureDiagram(node);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function getArchitectureDiagrams(params: {
  tenant: string;
  projectKey: string;
}): Promise<ArchitectureDiagramRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        OPTIONAL MATCH (project)-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram)
        RETURN diagram
        ORDER BY diagram.createdAt
      `,
      { tenantSlug, projectSlug }
    );

    return result.records
      .map(record => record.get("diagram") as Neo4jNode | null)
      .filter((node): node is Neo4jNode => node !== null)
      .map(mapArchitectureDiagram);
  } finally {
    await session.close();
  }
}

export async function updateArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  name?: string;
  description?: string;
  view?: ArchitectureDiagramRecord["view"];
}): Promise<ArchitectureDiagramRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const updates: string[] = ["diagram.updatedAt = $now"];
      const queryParams: Record<string, unknown> = {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        now: new Date().toISOString()
      };

      if (params.name !== undefined) {
        updates.push("diagram.name = $name");
        queryParams.name = params.name;
      }
      if (params.description !== undefined) {
        updates.push("diagram.description = $description");
        queryParams.description = params.description;
      }
      if (params.view !== undefined) {
        updates.push("diagram.view = $view");
        queryParams.view = params.view;
      }

      if (updates.length === 1) {
        throw new Error("No fields provided for update");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        SET ${updates.join(", ")}
        RETURN diagram
      `;

      const res = await tx.run(query, queryParams);

      if (res.records.length === 0) {
        throw new Error("Architecture diagram not found");
      }

      return mapArchitectureDiagram(res.records[0].get("diagram") as Neo4jNode);
    });

    return result;
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureDiagram(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        OPTIONAL MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector)
        OPTIONAL MATCH (diagram)-[rel:HAS_BLOCK]->(:ArchitectureBlock)
        DETACH DELETE connector
        DELETE rel
        DETACH DELETE diagram
        RETURN COUNT(*) AS removed
      `;

      const res = await tx.run(query, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId
      });

      const removed = toNumber(res.records[0]?.get("removed"), 0);
      if (removed === 0) {
        throw new Error("Architecture diagram not found");
      }
    });
  } finally {
    await session.close();
  }
}
