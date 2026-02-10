import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { slugify } from "../../workspace.js";
import { getSession } from "../driver.js";
import { logger } from "../../../lib/logger.js";
import type { ArchitectureConnectorRecord, ConnectorKind } from "./types.js";
import { mapArchitectureConnector } from "./mappers.js";
import { toNumber } from "../../../lib/neo4j-utils.js";
import { createLinkset, getLinkset } from "../linksets.js";
import { createArchitectureConnectorVersion, generateArchitectureConnectorContentHash } from "./connectors-versions.js";

/**
 * Syncs connector documentIds to DocumentLinkset nodes.
 * For requirements schema view, connectors between document blocks should
 * create/ensure linksets exist in the graph database.
 */
async function syncConnectorLinksets(params: {
  tenant: string;
  projectKey: string;
  documentIds: string[];
  userId: string;
}): Promise<void> {
  const { tenant, projectKey, documentIds, userId } = params;

  // If we have 2 or more documents, create pairwise linksets
  if (documentIds.length >= 2) {
    for (let i = 0; i < documentIds.length - 1; i++) {
      for (let j = i + 1; j < documentIds.length; j++) {
        const sourceDocSlug = documentIds[i];
        const targetDocSlug = documentIds[j];

        try {
          // Check if linkset already exists
          const existingLinkset = await getLinkset({
            tenant,
            projectKey,
            sourceDocumentSlug: sourceDocSlug,
            targetDocumentSlug: targetDocSlug
          });

          // If it doesn't exist, create it
          if (!existingLinkset) {
            await createLinkset({
              tenant,
              projectKey,
              sourceDocumentSlug: sourceDocSlug,
              targetDocumentSlug: targetDocSlug,
              userId
            });
          }
        } catch (error) {
          // Log but don't fail - linkset creation is best-effort
          logger.warn({ err: error, sourceDocSlug, targetDocSlug }, `Failed to sync linkset ${sourceDocSlug} -> ${targetDocSlug}`);
        }
      }
    }
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
  documentIds?: string[];
  // Styling properties
  lineStyle?: string;
  markerStart?: string;
  markerEnd?: string;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
  controlPoints?: { x: number; y: number }[];
  userId: string;
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
          documentIds: $documentIds,
          lineStyle: $lineStyle,
          markerStart: $markerStart,
          markerEnd: $markerEnd,
          linePattern: $linePattern,
          color: $color,
          strokeWidth: $strokeWidth,
          labelOffsetX: $labelOffsetX,
          labelOffsetY: $labelOffsetY,
          controlPoints: $controlPoints,
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
        documentIds: JSON.stringify(params.documentIds ?? []),
        lineStyle: params.lineStyle ?? null,
        markerStart: params.markerStart ?? null,
        markerEnd: params.markerEnd ?? null,
        linePattern: params.linePattern ?? null,
        color: params.color ?? null,
        strokeWidth: params.strokeWidth ?? null,
        labelOffsetX: params.labelOffsetX ?? null,
        labelOffsetY: params.labelOffsetY ?? null,
        controlPoints: JSON.stringify(params.controlPoints ?? []),
        now
      });

      if (queryResult.records.length === 0) {
        throw new Error("Failed to create architecture connector");
      }

      return queryResult.records[0].get("connector") as Neo4jNode;
    });

    const mappedConnector = mapArchitectureConnector(result);

    // Create version 1 for the new connector
    await session.executeWrite(async (tx: ManagedTransaction) => {
      const props = result.properties;

      // Parse documentIds if they exist
      let documentIds: string[] | undefined;
      if (props.documentIds) {
        try {
          documentIds = JSON.parse(String(props.documentIds));
        } catch {
          documentIds = undefined;
        }
      }

      let controlPoints: { x: number; y: number }[] | undefined;
      if (props.controlPoints) {
        try {
          const parsed = JSON.parse(String(props.controlPoints));
          if (Array.isArray(parsed)) {
            controlPoints = parsed
              .map((point: any) => ({
                x: typeof point.x === "number" ? point.x : Number(point.x),
                y: typeof point.y === "number" ? point.y : Number(point.y)
              }))
              .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
          }
        } catch {
          controlPoints = undefined;
        }
      }

      const contentHash = generateArchitectureConnectorContentHash({
        source: String(props.source),
        target: String(props.target),
        kind: String(props.kind),
        label: props.label ? String(props.label) : undefined,
        sourcePortId: props.sourcePortId ? String(props.sourcePortId) : undefined,
        targetPortId: props.targetPortId ? String(props.targetPortId) : undefined,
        documentIds,
        lineStyle: props.lineStyle ? String(props.lineStyle) : undefined,
        markerStart: props.markerStart ? String(props.markerStart) : undefined,
        markerEnd: props.markerEnd ? String(props.markerEnd) : undefined,
        linePattern: props.linePattern ? String(props.linePattern) : undefined,
        color: props.color ? String(props.color) : undefined,
        strokeWidth: props.strokeWidth ? (typeof props.strokeWidth === 'number' ? props.strokeWidth : props.strokeWidth.toNumber()) : undefined,
        labelOffsetX: props.labelOffsetX ? (typeof props.labelOffsetX === 'number' ? props.labelOffsetX : props.labelOffsetX.toNumber()) : undefined,
        labelOffsetY: props.labelOffsetY ? (typeof props.labelOffsetY === 'number' ? props.labelOffsetY : props.labelOffsetY.toNumber()) : undefined,
        controlPoints
      });

      await createArchitectureConnectorVersion(tx, {
        connectorId: connectorId,
        tenantSlug,
        projectSlug,
        changedBy: params.userId,
        changeType: 'created',
        source: String(props.source),
        target: String(props.target),
        kind: String(props.kind) as ConnectorKind,
        label: props.label ? String(props.label) : undefined,
        sourcePortId: props.sourcePortId ? String(props.sourcePortId) : undefined,
        targetPortId: props.targetPortId ? String(props.targetPortId) : undefined,
        diagramId: params.diagramId,
        documentIds,
        lineStyle: props.lineStyle ? String(props.lineStyle) : undefined,
        markerStart: props.markerStart ? String(props.markerStart) : undefined,
        markerEnd: props.markerEnd ? String(props.markerEnd) : undefined,
        linePattern: props.linePattern ? String(props.linePattern) : undefined,
        color: props.color ? String(props.color) : undefined,
        strokeWidth: props.strokeWidth ? (typeof props.strokeWidth === 'number' ? props.strokeWidth : props.strokeWidth.toNumber()) : undefined,
        labelOffsetX: props.labelOffsetX ? (typeof props.labelOffsetX === 'number' ? props.labelOffsetX : props.labelOffsetX.toNumber()) : undefined,
        labelOffsetY: props.labelOffsetY ? (typeof props.labelOffsetY === 'number' ? props.labelOffsetY : props.labelOffsetY.toNumber()) : undefined,
        controlPoints,
        contentHash
      });
    });

    // Sync linksets if documents are provided
    if (params.documentIds && params.documentIds.length >= 2) {
      await syncConnectorLinksets({
        tenant: params.tenant,
        projectKey: params.projectKey,
        documentIds: params.documentIds,
        userId: params.userId
      });
    }

    return mappedConnector;
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
  documentIds?: string[];
  // Styling properties
  lineStyle?: string;
  markerStart?: string;
  markerEnd?: string;
  linePattern?: string;
  color?: string;
  strokeWidth?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
  controlPoints?: { x: number; y: number }[];
  userId: string;
}): Promise<ArchitectureConnectorRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state for version comparison
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[:HAS_CONNECTOR]->(connector:ArchitectureConnector {id: $connectorId})
        RETURN connector
      `;
      const currentResult = await tx.run(getCurrentQuery, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        connectorId: params.connectorId
      });

      let oldContentHash: string | null = null;
      if (currentResult.records.length > 0) {
        const currentConnector = currentResult.records[0].get("connector");
        const currentProps = currentConnector.properties;

        // Parse current documentIds
        let currentDocumentIds: string[] | undefined;
        if (currentProps.documentIds) {
          try {
            currentDocumentIds = JSON.parse(String(currentProps.documentIds));
          } catch {
            currentDocumentIds = undefined;
          }
        }

        let currentControlPoints: { x: number; y: number }[] | undefined;
        if (currentProps.controlPoints) {
          try {
            const parsed = JSON.parse(String(currentProps.controlPoints));
            if (Array.isArray(parsed)) {
              currentControlPoints = parsed
                .map((point: any) => ({
                  x: typeof point.x === "number" ? point.x : Number(point.x),
                  y: typeof point.y === "number" ? point.y : Number(point.y)
                }))
                .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
            }
          } catch {
            currentControlPoints = undefined;
          }
        }

        oldContentHash = generateArchitectureConnectorContentHash({
          source: String(currentProps.source),
          target: String(currentProps.target),
          kind: String(currentProps.kind),
          label: currentProps.label ? String(currentProps.label) : undefined,
          sourcePortId: currentProps.sourcePortId ? String(currentProps.sourcePortId) : undefined,
          targetPortId: currentProps.targetPortId ? String(currentProps.targetPortId) : undefined,
          documentIds: currentDocumentIds,
          lineStyle: currentProps.lineStyle ? String(currentProps.lineStyle) : undefined,
          markerStart: currentProps.markerStart ? String(currentProps.markerStart) : undefined,
          markerEnd: currentProps.markerEnd ? String(currentProps.markerEnd) : undefined,
          linePattern: currentProps.linePattern ? String(currentProps.linePattern) : undefined,
          color: currentProps.color ? String(currentProps.color) : undefined,
          strokeWidth: currentProps.strokeWidth ? (typeof currentProps.strokeWidth === 'number' ? currentProps.strokeWidth : currentProps.strokeWidth.toNumber()) : undefined,
          labelOffsetX: currentProps.labelOffsetX ? (typeof currentProps.labelOffsetX === 'number' ? currentProps.labelOffsetX : currentProps.labelOffsetX.toNumber()) : undefined,
          labelOffsetY: currentProps.labelOffsetY ? (typeof currentProps.labelOffsetY === 'number' ? currentProps.labelOffsetY : currentProps.labelOffsetY.toNumber()) : undefined,
          controlPoints: currentControlPoints
        });
      }

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
      if (params.documentIds !== undefined) {
        setFields.push("connector.documentIds = $documentIds");
        setParams.documentIds = JSON.stringify(params.documentIds);
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
      if (params.labelOffsetX !== undefined) {
        setFields.push("connector.labelOffsetX = $labelOffsetX");
        setParams.labelOffsetX = params.labelOffsetX;
      }
      if (params.labelOffsetY !== undefined) {
        setFields.push("connector.labelOffsetY = $labelOffsetY");
        setParams.labelOffsetY = params.labelOffsetY;
      }
      if (params.controlPoints !== undefined) {
        setFields.push("connector.controlPoints = $controlPoints");
        setParams.controlPoints = JSON.stringify(params.controlPoints ?? []);
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

      const updatedConnector = queryResult.records[0].get("connector") as Neo4jNode;
      const updatedProps = updatedConnector.properties;

      // Parse updated documentIds
      let updatedDocumentIds: string[] | undefined;
      if (updatedProps.documentIds) {
        try {
          updatedDocumentIds = JSON.parse(String(updatedProps.documentIds));
        } catch {
          updatedDocumentIds = undefined;
        }
      }

      let updatedControlPoints: { x: number; y: number }[] | undefined;
      if (updatedProps.controlPoints) {
        try {
          const parsed = JSON.parse(String(updatedProps.controlPoints));
          if (Array.isArray(parsed)) {
            updatedControlPoints = parsed
              .map((point: any) => ({
                x: typeof point.x === "number" ? point.x : Number(point.x),
                y: typeof point.y === "number" ? point.y : Number(point.y)
              }))
              .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
          }
        } catch {
          updatedControlPoints = undefined;
        }
      }

      // Calculate new content hash
      const newContentHash = generateArchitectureConnectorContentHash({
        source: String(updatedProps.source),
        target: String(updatedProps.target),
        kind: String(updatedProps.kind),
        label: updatedProps.label ? String(updatedProps.label) : undefined,
        sourcePortId: updatedProps.sourcePortId ? String(updatedProps.sourcePortId) : undefined,
        targetPortId: updatedProps.targetPortId ? String(updatedProps.targetPortId) : undefined,
        documentIds: updatedDocumentIds,
        lineStyle: updatedProps.lineStyle ? String(updatedProps.lineStyle) : undefined,
        markerStart: updatedProps.markerStart ? String(updatedProps.markerStart) : undefined,
        markerEnd: updatedProps.markerEnd ? String(updatedProps.markerEnd) : undefined,
        linePattern: updatedProps.linePattern ? String(updatedProps.linePattern) : undefined,
        color: updatedProps.color ? String(updatedProps.color) : undefined,
        strokeWidth: updatedProps.strokeWidth ? (typeof updatedProps.strokeWidth === 'number' ? updatedProps.strokeWidth : updatedProps.strokeWidth.toNumber()) : undefined,
        labelOffsetX: updatedProps.labelOffsetX ? (typeof updatedProps.labelOffsetX === 'number' ? updatedProps.labelOffsetX : updatedProps.labelOffsetX.toNumber()) : undefined,
        labelOffsetY: updatedProps.labelOffsetY ? (typeof updatedProps.labelOffsetY === 'number' ? updatedProps.labelOffsetY : updatedProps.labelOffsetY.toNumber()) : undefined,
        controlPoints: updatedControlPoints
      });

      const contentChanged = oldContentHash !== null && oldContentHash !== newContentHash;

      // Create new version only if content changed
      if (contentChanged) {
        await createArchitectureConnectorVersion(tx, {
          connectorId: params.connectorId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'updated',
          source: String(updatedProps.source),
          target: String(updatedProps.target),
          kind: String(updatedProps.kind) as ConnectorKind,
          label: updatedProps.label ? String(updatedProps.label) : undefined,
          sourcePortId: updatedProps.sourcePortId ? String(updatedProps.sourcePortId) : undefined,
          targetPortId: updatedProps.targetPortId ? String(updatedProps.targetPortId) : undefined,
          diagramId: params.diagramId,
          documentIds: updatedDocumentIds,
          lineStyle: updatedProps.lineStyle ? String(updatedProps.lineStyle) : undefined,
          markerStart: updatedProps.markerStart ? String(updatedProps.markerStart) : undefined,
          markerEnd: updatedProps.markerEnd ? String(updatedProps.markerEnd) : undefined,
          linePattern: updatedProps.linePattern ? String(updatedProps.linePattern) : undefined,
          color: updatedProps.color ? String(updatedProps.color) : undefined,
          strokeWidth: updatedProps.strokeWidth ? (typeof updatedProps.strokeWidth === 'number' ? updatedProps.strokeWidth : updatedProps.strokeWidth.toNumber()) : undefined,
          labelOffsetX: updatedProps.labelOffsetX ? (typeof updatedProps.labelOffsetX === 'number' ? updatedProps.labelOffsetX : updatedProps.labelOffsetX.toNumber()) : undefined,
          labelOffsetY: updatedProps.labelOffsetY ? (typeof updatedProps.labelOffsetY === 'number' ? updatedProps.labelOffsetY : updatedProps.labelOffsetY.toNumber()) : undefined,
          controlPoints: updatedControlPoints,
          contentHash: newContentHash
        });
      }

      return updatedConnector;
    });

    const mappedConnector = mapArchitectureConnector(result);

    // Sync linksets if documents are being updated
    if (params.documentIds && params.documentIds.length >= 2) {
      await syncConnectorLinksets({
        tenant: params.tenant,
        projectKey: params.projectKey,
        documentIds: params.documentIds,
        userId: params.userId
      });
    }

    return mappedConnector;
  } finally {
    await session.close();
  }
}

export async function deleteArchitectureConnector(params: {
  tenant: string;
  projectKey: string;
  diagramId: string;
  connectorId: string;
  userId: string;
}): Promise<void> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const session = getSession();

  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // First, get the current state to create a deletion version
      const getCurrentQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_DIAGRAM]->(diagram:ArchitectureDiagram {id: $diagramId})-[:HAS_CONNECTOR]->(connector:ArchitectureConnector {id: $connectorId})
        RETURN connector
      `;
      const currentResult = await tx.run(getCurrentQuery, {
        tenantSlug,
        projectSlug,
        diagramId: params.diagramId,
        connectorId: params.connectorId
      });

      if (currentResult.records.length > 0) {
        const currentConnector = currentResult.records[0].get("connector");
        const currentProps = currentConnector.properties;

        // Parse current documentIds
        let currentDocumentIds: string[] | undefined;
        if (currentProps.documentIds) {
          try {
            currentDocumentIds = JSON.parse(String(currentProps.documentIds));
          } catch {
            currentDocumentIds = undefined;
          }
        }

        let currentControlPoints: { x: number; y: number }[] | undefined;
        if (currentProps.controlPoints) {
          try {
            const parsed = JSON.parse(String(currentProps.controlPoints));
            if (Array.isArray(parsed)) {
              currentControlPoints = parsed
                .map((point: any) => ({
                  x: typeof point.x === "number" ? point.x : Number(point.x),
                  y: typeof point.y === "number" ? point.y : Number(point.y)
                }))
                .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
            }
          } catch {
            currentControlPoints = undefined;
          }
        }

        // Create deletion version
        const contentHash = generateArchitectureConnectorContentHash({
          source: String(currentProps.source),
          target: String(currentProps.target),
          kind: String(currentProps.kind),
          label: currentProps.label ? String(currentProps.label) : undefined,
          sourcePortId: currentProps.sourcePortId ? String(currentProps.sourcePortId) : undefined,
          targetPortId: currentProps.targetPortId ? String(currentProps.targetPortId) : undefined,
          documentIds: currentDocumentIds,
          lineStyle: currentProps.lineStyle ? String(currentProps.lineStyle) : undefined,
          markerStart: currentProps.markerStart ? String(currentProps.markerStart) : undefined,
          markerEnd: currentProps.markerEnd ? String(currentProps.markerEnd) : undefined,
          linePattern: currentProps.linePattern ? String(currentProps.linePattern) : undefined,
          color: currentProps.color ? String(currentProps.color) : undefined,
          strokeWidth: currentProps.strokeWidth ? (typeof currentProps.strokeWidth === 'number' ? currentProps.strokeWidth : currentProps.strokeWidth.toNumber()) : undefined,
          labelOffsetX: currentProps.labelOffsetX ? (typeof currentProps.labelOffsetX === 'number' ? currentProps.labelOffsetX : currentProps.labelOffsetX.toNumber()) : undefined,
          labelOffsetY: currentProps.labelOffsetY ? (typeof currentProps.labelOffsetY === 'number' ? currentProps.labelOffsetY : currentProps.labelOffsetY.toNumber()) : undefined,
          controlPoints: currentControlPoints
        });

        await createArchitectureConnectorVersion(tx, {
          connectorId: params.connectorId,
          tenantSlug,
          projectSlug,
          changedBy: params.userId,
          changeType: 'deleted',
          source: String(currentProps.source),
          target: String(currentProps.target),
          kind: String(currentProps.kind) as ConnectorKind,
          label: currentProps.label ? String(currentProps.label) : undefined,
          sourcePortId: currentProps.sourcePortId ? String(currentProps.sourcePortId) : undefined,
          targetPortId: currentProps.targetPortId ? String(currentProps.targetPortId) : undefined,
          diagramId: params.diagramId,
          documentIds: currentDocumentIds,
          lineStyle: currentProps.lineStyle ? String(currentProps.lineStyle) : undefined,
          markerStart: currentProps.markerStart ? String(currentProps.markerStart) : undefined,
          markerEnd: currentProps.markerEnd ? String(currentProps.markerEnd) : undefined,
          linePattern: currentProps.linePattern ? String(currentProps.linePattern) : undefined,
          color: currentProps.color ? String(currentProps.color) : undefined,
          strokeWidth: currentProps.strokeWidth ? (typeof currentProps.strokeWidth === 'number' ? currentProps.strokeWidth : currentProps.strokeWidth.toNumber()) : undefined,
          labelOffsetX: currentProps.labelOffsetX ? (typeof currentProps.labelOffsetX === 'number' ? currentProps.labelOffsetX : currentProps.labelOffsetX.toNumber()) : undefined,
          labelOffsetY: currentProps.labelOffsetY ? (typeof currentProps.labelOffsetY === 'number' ? currentProps.labelOffsetY : currentProps.labelOffsetY.toNumber()) : undefined,
          controlPoints: currentControlPoints,
          contentHash
        });
      }

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
