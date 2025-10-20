import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { getSession } from "../driver.js";
import type {
  PortDefinitionRecord,
  PortInstanceRecord,
  PortDirection,
  PortType,
  PortShape,
  BlockPortRecord
} from "./types.js";
import { parseJsonArray } from "./mappers.js";

/**
 * Port CRUD Operations - Phase 1: Dual-Write Implementation
 *
 * This service manages ports as first-class nodes in Neo4j while maintaining
 * backward compatibility with JSON-based ports in Block nodes.
 *
 * Strategy:
 * - WRITE: Update both Port nodes AND Block.ports JSON
 * - READ: Prefer Port nodes, fallback to JSON
 * - MIGRATE: Gradually move all ports to nodes
 */

// ============================================================================
// MAPPERS
// ============================================================================

export function mapPortDefinition(node: Neo4jNode): PortDefinitionRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    name: String(props.name ?? ""),
    direction: String(props.direction ?? "none") as PortDirection,

    portType: props.portType ? String(props.portType) as PortType : null,
    isConjugated: props.isConjugated ? Boolean(props.isConjugated) : null,

    dataType: props.dataType ? String(props.dataType) : null,
    protocol: props.protocol ? String(props.protocol) : null,
    rate: props.rate ? Number(props.rate) : null,
    bufferSize: props.bufferSize ? Number(props.bufferSize) : null,

    backgroundColor: props.backgroundColor ? String(props.backgroundColor) : null,
    borderColor: props.borderColor ? String(props.borderColor) : null,
    borderWidth: props.borderWidth ? Number(props.borderWidth) : null,
    size: props.size ? Number(props.size) : null,
    shape: props.shape ? String(props.shape) as PortShape : null,
    iconColor: props.iconColor ? String(props.iconColor) : null,

    description: props.description ? String(props.description) : null,
    stereotype: props.stereotype ? String(props.stereotype) : null,
    tenant: String(props.tenant ?? ""),
    projectKey: String(props.projectKey ?? ""),
    packageId: props.packageId ? String(props.packageId) : null,

    createdAt: String(props.createdAt ?? new Date().toISOString()),
    updatedAt: String(props.updatedAt ?? new Date().toISOString())
  };
}

export function mapPortInstance(node: Neo4jNode): PortInstanceRecord {
  const props = node.properties as Record<string, unknown>;
  return {
    id: String(props.id),
    definitionId: String(props.definitionId ?? ""),
    blockId: String(props.blockId ?? ""),
    diagramId: String(props.diagramId ?? ""),

    edge: props.edge ? String(props.edge) as "top" | "right" | "bottom" | "left" : null,
    offset: props.offset ? Number(props.offset) : null,
    hidden: props.hidden ? Boolean(props.hidden) : null,
    showLabel: props.showLabel ? Boolean(props.showLabel) : null,
    labelOffsetX: props.labelOffsetX ? Number(props.labelOffsetX) : null,
    labelOffsetY: props.labelOffsetY ? Number(props.labelOffsetY) : null,

    backgroundColor: props.backgroundColor ? String(props.backgroundColor) : null,
    borderColor: props.borderColor ? String(props.borderColor) : null,
    borderWidth: props.borderWidth ? Number(props.borderWidth) : null,
    size: props.size ? Number(props.size) : null,
    shape: props.shape ? String(props.shape) as PortShape : null,
    iconColor: props.iconColor ? String(props.iconColor) : null,

    createdAt: String(props.createdAt ?? new Date().toISOString()),
    updatedAt: String(props.updatedAt ?? new Date().toISOString())
  };
}

/**
 * Convert PortDefinition + PortInstance to legacy BlockPortRecord format
 */
export function portToLegacyFormat(
  definition: PortDefinitionRecord,
  instance?: PortInstanceRecord
): BlockPortRecord {
  return {
    id: instance?.id ?? definition.id,
    name: definition.name,
    direction: definition.direction,
    edge: instance?.edge ?? undefined,
    offset: instance?.offset ?? undefined,
    backgroundColor: instance?.backgroundColor ?? definition.backgroundColor ?? null,
    borderColor: instance?.borderColor ?? definition.borderColor ?? null,
    borderWidth: instance?.borderWidth ?? definition.borderWidth ?? null,
    size: instance?.size ?? definition.size ?? null,
    shape: instance?.shape ?? definition.shape ?? null,
    iconColor: instance?.iconColor ?? definition.iconColor ?? null,
    hidden: instance?.hidden ?? null,
    showLabel: instance?.showLabel ?? null,
    labelOffsetX: instance?.labelOffsetX ?? null,
    labelOffsetY: instance?.labelOffsetY ?? null
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a port definition (reusable template)
 */
export async function createPortDefinition(params: {
  name: string;
  direction: PortDirection;
  tenant: string;
  projectKey: string;
  portType?: PortType;
  isConjugated?: boolean;
  dataType?: string;
  protocol?: string;
  rate?: number;
  bufferSize?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  size?: number;
  shape?: PortShape;
  iconColor?: string;
  description?: string;
  stereotype?: string;
  packageId?: string;
}): Promise<PortDefinitionRecord> {
  const session = getSession();
  const now = new Date().toISOString();
  const portDefId = `portdef-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      const query = `
        CREATE (pd:PortDefinition {
          id: $portDefId,
          name: $name,
          direction: $direction,
          portType: $portType,
          isConjugated: $isConjugated,
          dataType: $dataType,
          protocol: $protocol,
          rate: $rate,
          bufferSize: $bufferSize,
          backgroundColor: $backgroundColor,
          borderColor: $borderColor,
          borderWidth: $borderWidth,
          size: $size,
          shape: $shape,
          iconColor: $iconColor,
          description: $description,
          stereotype: $stereotype,
          tenant: $tenant,
          projectKey: $projectKey,
          packageId: $packageId,
          createdAt: $now,
          updatedAt: $now
        })
        RETURN pd
      `;

      const queryResult = await tx.run(query, {
        portDefId,
        name: params.name,
        direction: params.direction,
        portType: params.portType ?? null,
        isConjugated: params.isConjugated ?? null,
        dataType: params.dataType ?? null,
        protocol: params.protocol ?? null,
        rate: params.rate ?? null,
        bufferSize: params.bufferSize ?? null,
        backgroundColor: params.backgroundColor ?? null,
        borderColor: params.borderColor ?? null,
        borderWidth: params.borderWidth ?? null,
        size: params.size ?? null,
        shape: params.shape ?? null,
        iconColor: params.iconColor ?? null,
        description: params.description ?? null,
        stereotype: params.stereotype ?? null,
        tenant: params.tenant,
        projectKey: params.projectKey,
        packageId: params.packageId ?? null,
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create port definition");
      }

      return queryResult.records[0].get("pd") as Neo4jNode;
    });

    return mapPortDefinition(result);
  } finally {
    await session.close();
  }
}

/**
 * Create a port instance on a diagram
 * Implements DUAL-WRITE: Creates PortInstance node AND updates Block.ports JSON
 */
export async function createPortInstance(params: {
  definitionId: string;
  blockId: string;
  diagramId: string;
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number;
  hidden?: boolean;
  showLabel?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  size?: number;
  shape?: PortShape;
  iconColor?: string;
}): Promise<PortInstanceRecord> {
  const session = getSession();
  const now = new Date().toISOString();
  const portInstanceId = `port-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Step 1: Create PortInstance node
      const createQuery = `
        MATCH (pd:PortDefinition {id: $definitionId})
        MATCH (b:ArchitectureBlock {id: $blockId})
        MATCH (d:ArchitectureDiagram {id: $diagramId})
        CREATE (pi:PortInstance {
          id: $portInstanceId,
          definitionId: $definitionId,
          blockId: $blockId,
          diagramId: $diagramId,
          edge: $edge,
          offset: $offset,
          hidden: $hidden,
          showLabel: $showLabel,
          labelOffsetX: $labelOffsetX,
          labelOffsetY: $labelOffsetY,
          backgroundColor: $backgroundColor,
          borderColor: $borderColor,
          borderWidth: $borderWidth,
          size: $size,
          shape: $shape,
          iconColor: $iconColor,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (pd)-[:INSTANTIATED_AS]->(pi)
        MERGE (b)-[:HAS_PORT]->(pi)
        MERGE (d)-[:CONTAINS_PORT]->(pi)
        MERGE (pi)-[:BELONGS_TO_BLOCK]->(b)
        RETURN pi, pd
      `;

      const createResult = await tx.run(createQuery, {
        definitionId: params.definitionId,
        blockId: params.blockId,
        diagramId: params.diagramId,
        portInstanceId,
        edge: params.edge ?? null,
        offset: params.offset ?? null,
        hidden: params.hidden ?? null,
        showLabel: params.showLabel ?? null,
        labelOffsetX: params.labelOffsetX ?? null,
        labelOffsetY: params.labelOffsetY ?? null,
        backgroundColor: params.backgroundColor ?? null,
        borderColor: params.borderColor ?? null,
        borderWidth: params.borderWidth ?? null,
        size: params.size ?? null,
        shape: params.shape ?? null,
        iconColor: params.iconColor ?? null,
        now
      });

      if (createResult.records.length === 0) {
        throw new Error("Failed to create port instance");
      }

      const portInstanceNode = createResult.records[0].get("pi") as Neo4jNode;
      const portDefNode = createResult.records[0].get("pd") as Neo4jNode;

      // Step 2: DUAL-WRITE - Update Block.ports JSON (backward compatibility)
      const portInstance = mapPortInstance(portInstanceNode);
      const portDefinition = mapPortDefinition(portDefNode);
      const legacyPort = portToLegacyFormat(portDefinition, portInstance);

      const updateJsonQuery = `
        MATCH (b:ArchitectureBlock {id: $blockId})
        SET b.ports = CASE
          WHEN b.ports IS NULL THEN $newPorts
          ELSE $newPorts
        END,
        b.updatedAt = $now
      `;

      // Get current ports
      const getCurrentQuery = `
        MATCH (b:ArchitectureBlock {id: $blockId})
        RETURN b.ports AS ports
      `;

      const currentResult = await tx.run(getCurrentQuery, { blockId: params.blockId });
      const currentPorts = currentResult.records.length > 0
        ? parseJsonArray<BlockPortRecord>(currentResult.records[0].get("ports"))
        : [];

      // Add new port to JSON array
      const updatedPorts = [...currentPorts, legacyPort];

      await tx.run(updateJsonQuery, {
        blockId: params.blockId,
        newPorts: JSON.stringify(updatedPorts),
        now
      });

      return portInstanceNode;
    });

    return mapPortInstance(result);
  } finally {
    await session.close();
  }
}

/**
 * Get all port instances for a block (from nodes, fallback to JSON)
 * Implements DUAL-READ strategy
 */
export async function getBlockPorts(params: {
  blockId: string;
  diagramId?: string;
}): Promise<BlockPortRecord[]> {
  const session = getSession();

  try {
    // Step 1: Try reading from PortInstance nodes (new way)
    const nodeQuery = `
      MATCH (b:ArchitectureBlock {id: $blockId})-[:HAS_PORT]->(pi:PortInstance)
      MATCH (pi)<-[:INSTANTIATED_AS]-(pd:PortDefinition)
      ${params.diagramId ? 'WHERE pi.diagramId = $diagramId' : ''}
      RETURN pi, pd
      ORDER BY pi.createdAt
    `;

    const nodeResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(nodeQuery, {
        blockId: params.blockId,
        diagramId: params.diagramId ?? null
      });
    });

    if (nodeResult.records.length > 0) {
      // Found ports as nodes - use them
      return nodeResult.records.map(record => {
        const portInstance = mapPortInstance(record.get("pi") as Neo4jNode);
        const portDefinition = mapPortDefinition(record.get("pd") as Neo4jNode);
        return portToLegacyFormat(portDefinition, portInstance);
      });
    }

    // Step 2: Fallback to JSON (old way)
    const jsonQuery = `
      MATCH (b:ArchitectureBlock {id: $blockId})
      RETURN b.ports AS ports
    `;

    const jsonResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(jsonQuery, { blockId: params.blockId });
    });

    if (jsonResult.records.length > 0) {
      return parseJsonArray<BlockPortRecord>(jsonResult.records[0].get("ports"));
    }

    return [];
  } finally {
    await session.close();
  }
}

/**
 * Delete a port instance
 * Implements DUAL-DELETE: Removes PortInstance node AND updates Block.ports JSON
 */
export async function deletePortInstance(params: {
  portInstanceId: string;
  blockId: string;
}): Promise<void> {
  const session = getSession();
  const now = new Date().toISOString();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Step 1: Delete PortInstance node
      const deleteNodeQuery = `
        MATCH (pi:PortInstance {id: $portInstanceId})
        DETACH DELETE pi
      `;

      await tx.run(deleteNodeQuery, { portInstanceId: params.portInstanceId });

      // Step 2: DUAL-DELETE - Update Block.ports JSON
      const getCurrentQuery = `
        MATCH (b:ArchitectureBlock {id: $blockId})
        RETURN b.ports AS ports
      `;

      const currentResult = await tx.run(getCurrentQuery, { blockId: params.blockId });
      const currentPorts = currentResult.records.length > 0
        ? parseJsonArray<BlockPortRecord>(currentResult.records[0].get("ports"))
        : [];

      // Filter out the deleted port
      const updatedPorts = currentPorts.filter(p => p.id !== params.portInstanceId);

      const updateJsonQuery = `
        MATCH (b:ArchitectureBlock {id: $blockId})
        SET b.ports = $newPorts,
            b.updatedAt = $now
      `;

      await tx.run(updateJsonQuery, {
        blockId: params.blockId,
        newPorts: JSON.stringify(updatedPorts),
        now
      });
    });
  } finally {
    await session.close();
  }
}

// ============================================================================
// PHASE 2 UTILITIES: Connector-Port Relationships
// ============================================================================

/**
 * Create FROM_PORT and TO_PORT relationships for a connector
 * This is part of Phase 2 migration - replacing string references with relationships
 *
 * For now, this is optional and runs alongside the string-based sourcePortId/targetPortId
 * Later, we'll deprecate the string properties entirely
 */
export async function createConnectorPortRelationships(params: {
  connectorId: string;
  sourcePortId?: string | null;
  targetPortId?: string | null;
}): Promise<void> {
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // Create FROM_PORT relationship if sourcePortId exists as a node
      if (params.sourcePortId) {
        const fromPortQuery = `
          MATCH (c:ArchitectureConnector {id: $connectorId})
          MATCH (sourcePort:PortInstance {id: $sourcePortId})
          MERGE (c)-[:FROM_PORT]->(sourcePort)
        `;

        await tx.run(fromPortQuery, {
          connectorId: params.connectorId,
          sourcePortId: params.sourcePortId
        });
      }

      // Create TO_PORT relationship if targetPortId exists as a node
      if (params.targetPortId) {
        const toPortQuery = `
          MATCH (c:ArchitectureConnector {id: $connectorId})
          MATCH (targetPort:PortInstance {id: $targetPortId})
          MERGE (c)-[:TO_PORT]->(targetPort)
        `;

        await tx.run(toPortQuery, {
          connectorId: params.connectorId,
          targetPortId: params.targetPortId
        });
      }
    });
  } finally {
    await session.close();
  }
}

/**
 * Get all connectors using a specific port
 * Uses relationships if they exist, falls back to string matching
 */
export async function getConnectorsByPort(portId: string): Promise<string[]> {
  const session = getSession();

  try {
    const query = `
      // Try relationship-based query first (Phase 2)
      OPTIONAL MATCH (c:ArchitectureConnector)-[:FROM_PORT|TO_PORT]->(p:PortInstance {id: $portId})
      WITH collect(DISTINCT c.id) AS relationshipBasedConnectors

      // Fallback to string-based query (Phase 1)
      MATCH (c2:ArchitectureConnector)
      WHERE c2.sourcePortId = $portId OR c2.targetPortId = $portId
      WITH relationshipBasedConnectors, collect(DISTINCT c2.id) AS stringBasedConnectors

      // Return union of both approaches
      UNWIND (relationshipBasedConnectors + stringBasedConnectors) AS connectorId
      RETURN DISTINCT connectorId
    `;

    const result = await session.executeRead(async (tx: ManagedTransaction) => {
      return await tx.run(query, { portId });
    });

    return result.records.map(record => record.get("connectorId") as string);
  } finally {
    await session.close();
  }
}
