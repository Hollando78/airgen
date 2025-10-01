import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import type { ArchitectureConnectorRecord, ConnectorKind } from "./types.js";
import { mapArchitectureConnector, toNumber } from "./mappers.js";

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
  // Styling properties
  lineStyle?: string;
  markerStart?: string;
  markerEnd?: string;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;
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
          lineStyle: $lineStyle,
          markerStart: $markerStart,
          markerEnd: $markerEnd,
          linePattern: $linePattern,
          color: $color,
          strokeWidth: $strokeWidth,
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
        lineStyle: params.lineStyle ?? null,
        markerStart: params.markerStart ?? null,
        markerEnd: params.markerEnd ?? null,
        linePattern: params.linePattern ?? null,
        color: params.color ?? null,
        strokeWidth: params.strokeWidth ?? null,
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

export async function updateArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  connectorId: string;
  diagramId: string;
  kind?: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  // Styling properties
  lineStyle?: string;
  markerStart?: string;
  markerEnd?: string;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;
}): Promise<ArchitectureConnectorRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // Build the SET clause dynamically based on provided parameters
      const setFields: string[] = [];
      const setParams: Record<string, any> = {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        connectorId: params.connectorId,
        now
      };

      if (params.kind !== undefined) {
        setFields.push("connector.kind = $kind");
        setParams.kind = params.kind;
      }
      if (params.label !== undefined) {
        setFields.push("connector.label = $label");
        setParams.label = params.label;
      }
      if (params.sourcePortId !== undefined) {
        setFields.push("connector.sourcePortId = $sourcePortId");
        setParams.sourcePortId = params.sourcePortId;
      }
      if (params.targetPortId !== undefined) {
        setFields.push("connector.targetPortId = $targetPortId");
        setParams.targetPortId = params.targetPortId;
      }
      if (params.lineStyle !== undefined) {
        setFields.push("connector.lineStyle = $lineStyle");
        setParams.lineStyle = params.lineStyle;
      }
      if (params.markerStart !== undefined) {
        setFields.push("connector.markerStart = $markerStart");
        setParams.markerStart = params.markerStart;
      }
      if (params.markerEnd !== undefined) {
        setFields.push("connector.markerEnd = $markerEnd");
        setParams.markerEnd = params.markerEnd;
      }
      if (params.linePattern !== undefined) {
        setFields.push("connector.linePattern = $linePattern");
        setParams.linePattern = params.linePattern;
      }
      if (params.color !== undefined) {
        setFields.push("connector.color = $color");
        setParams.color = params.color;
      }
      if (params.strokeWidth !== undefined) {
        setFields.push("connector.strokeWidth = $strokeWidth");
        setParams.strokeWidth = params.strokeWidth;
      }

      // Always update the updatedAt timestamp
      setFields.push("connector.updatedAt = $now");

      if (setFields.length === 1) {
        // Only updatedAt, no actual changes
        throw new Error("No fields to update");
      }

      const query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})
        MATCH (diagram)-[:HAS_CONNECTOR]->(connector:ArchitectureConnector {id: $connectorId})
        SET ${setFields.join(", ")}
        RETURN connector
      `;

      const queryResult = await tx.run(query, setParams);

      if (queryResult.records.length === 0) {
        throw new Error("Architecture connector not found");
      }

      return queryResult.records[0].get("connector") as Neo4jNode;
    });

    return mapArchitectureConnector(result);
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

