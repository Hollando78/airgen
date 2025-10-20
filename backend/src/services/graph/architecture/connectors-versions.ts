import type { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getSession } from "../driver.js";
import type { ConnectorKind, ConnectorControlPoint } from "./types.js";

export type ArchitectureConnectorVersionRecord = {
  versionId: string;
  connectorId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "deleted";
  changeDescription?: string;
  // Snapshot of connector state
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string;
  targetPortId?: string;
  diagramId: string;
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
  controlPoints?: ConnectorControlPoint[];
  contentHash: string;
};

/**
 * Generate content hash for ArchitectureConnector node to detect changes
 */
export function generateArchitectureConnectorContentHash(params: {
  source: string;
  target: string;
  kind: string;
  label?: string | null;
  sourcePortId?: string | null;
  targetPortId?: string | null;
  documentIds?: string[] | null;
  lineStyle?: string | null;
  markerStart?: string | null;
  markerEnd?: string | null;
  linePattern?: string | null;
  color?: string | null;
  strokeWidth?: number | null;
  labelOffsetX?: number | null;
  labelOffsetY?: number | null;
  controlPoints?: ConnectorControlPoint[] | null;
}): string {
  const content = JSON.stringify({
    source: params.source,
    target: params.target,
    kind: params.kind,
    label: params.label || null,
    sourcePortId: params.sourcePortId || null,
    targetPortId: params.targetPortId || null,
    documentIds: params.documentIds || null,
    lineStyle: params.lineStyle || null,
    markerStart: params.markerStart || null,
    markerEnd: params.markerEnd || null,
    linePattern: params.linePattern || null,
    color: params.color || null,
    strokeWidth: params.strokeWidth || null,
    labelOffsetX: params.labelOffsetX || null,
    labelOffsetY: params.labelOffsetY || null,
    controlPoints: params.controlPoints || null
  });
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Create a new version snapshot for an ArchitectureConnector node
 */
export async function createArchitectureConnectorVersion(
  tx: ManagedTransaction,
  params: {
    connectorId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "deleted";
    changeDescription?: string;
    // Current connector state
    source: string;
    target: string;
    kind: ConnectorKind;
    label?: string | null;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    diagramId: string;
    documentIds?: string[] | null;
    lineStyle?: string | null;
    markerStart?: string | null;
    markerEnd?: string | null;
    linePattern?: string | null;
    color?: string | null;
    strokeWidth?: number | null;
    labelOffsetX?: number | null;
    labelOffsetY?: number | null;
    controlPoints?: ConnectorControlPoint[] | null;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (connector:ArchitectureConnector {id: $connectorId})
      OPTIONAL MATCH (connector)-[:HAS_VERSION]->(v:ArchitectureConnectorVersion)
      RETURN count(v) as versionCount
    `,
    { connectorId: params.connectorId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (connector:ArchitectureConnector {id: $connectorId})
      CREATE (version:ArchitectureConnectorVersion {
        versionId: $versionId,
        connectorId: $connectorId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        source: $source,
        target: $target,
        kind: $kind,
        label: $label,
        sourcePortId: $sourcePortId,
        targetPortId: $targetPortId,
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
        contentHash: $contentHash
      })
      CREATE (connector)-[:HAS_VERSION]->(version)

      // Link to previous version if exists
      WITH version, connector
      OPTIONAL MATCH (connector)-[:HAS_VERSION]->(prevVersion:ArchitectureConnectorVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      FOREACH (_ IN CASE WHEN prevVersion IS NOT NULL THEN [1] ELSE [] END |
        CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
      )
    `,
    {
      connectorId: params.connectorId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      source: params.source,
      target: params.target,
      kind: params.kind,
      label: params.label || null,
      sourcePortId: params.sourcePortId || null,
      targetPortId: params.targetPortId || null,
      diagramId: params.diagramId,
      documentIds: params.documentIds || null,
      lineStyle: params.lineStyle || null,
      markerStart: params.markerStart || null,
      markerEnd: params.markerEnd || null,
      linePattern: params.linePattern || null,
      color: params.color || null,
      strokeWidth: params.strokeWidth || null,
      labelOffsetX: params.labelOffsetX || null,
      labelOffsetY: params.labelOffsetY || null,
      controlPoints: params.controlPoints ? JSON.stringify(params.controlPoints) : null,
      contentHash: params.contentHash
    }
  );
}

/**
 * Get version history for an ArchitectureConnector node
 */
export async function getArchitectureConnectorHistory(
  tenant: string,
  projectKey: string,
  connectorId: string
): Promise<ArchitectureConnectorVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (connector:ArchitectureConnector {id: $connectorId})
        MATCH (connector)-[:HAS_VERSION]->(version:ArchitectureConnectorVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { connectorId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        connectorId: String(v.connectorId),
        versionNumber: typeof v.versionNumber === 'number' ? v.versionNumber : v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType) as "created" | "updated" | "deleted",
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        source: String(v.source),
        target: String(v.target),
        kind: String(v.kind) as ConnectorKind,
        label: v.label ? String(v.label) : undefined,
        sourcePortId: v.sourcePortId ? String(v.sourcePortId) : undefined,
        targetPortId: v.targetPortId ? String(v.targetPortId) : undefined,
        diagramId: String(v.diagramId),
        documentIds: v.documentIds ? (Array.isArray(v.documentIds) ? v.documentIds.map(String) : []) : undefined,
        lineStyle: v.lineStyle ? String(v.lineStyle) : undefined,
        markerStart: v.markerStart ? String(v.markerStart) : undefined,
        markerEnd: v.markerEnd ? String(v.markerEnd) : undefined,
        linePattern: v.linePattern ? String(v.linePattern) : undefined,
        color: v.color ? String(v.color) : undefined,
        strokeWidth: v.strokeWidth ? (typeof v.strokeWidth === 'number' ? v.strokeWidth : v.strokeWidth.toNumber()) : undefined,
        labelOffsetX: v.labelOffsetX ? (typeof v.labelOffsetX === 'number' ? v.labelOffsetX : v.labelOffsetX.toNumber()) : undefined,
        labelOffsetY: v.labelOffsetY ? (typeof v.labelOffsetY === 'number' ? v.labelOffsetY : v.labelOffsetY.toNumber()) : undefined,
        controlPoints: (() => {
          if (!v.controlPoints) {
            return undefined;
          }
          if (Array.isArray(v.controlPoints)) {
            return v.controlPoints.map((point: any) => ({
              x: typeof point.x === "number" ? point.x : Number(point.x),
              y: typeof point.y === "number" ? point.y : Number(point.y)
            }));
          }
          try {
            const parsed = JSON.parse(String(v.controlPoints));
            if (!Array.isArray(parsed)) {
              return undefined;
            }
            return parsed
              .map((point: any) => ({
                x: typeof point.x === "number" ? point.x : Number(point.x),
                y: typeof point.y === "number" ? point.y : Number(point.y)
              }))
              .filter((point: any) => Number.isFinite(point.x) && Number.isFinite(point.y));
          } catch {
            return undefined;
          }
        })(),
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * Compare two versions of an ArchitectureConnector node
 */
export type ArchitectureConnectorDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getArchitectureConnectorDiff(
  tenant: string,
  projectKey: string,
  connectorId: string,
  fromVersion: number,
  toVersion: number
): Promise<ArchitectureConnectorDiff[]> {
  const history = await getArchitectureConnectorHistory(tenant, projectKey, connectorId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof ArchitectureConnectorVersionRecord)[] = [
    "source", "target", "kind", "label", "sourcePortId", "targetPortId",
    "documentIds", "lineStyle", "markerStart", "markerEnd", "linePattern",
    "color", "strokeWidth", "labelOffsetX", "labelOffsetY", "controlPoints"
  ];

  const diff: ArchitectureConnectorDiff[] = [];

  for (const field of fields) {
    const oldValue = from[field];
    const newValue = to[field];
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    diff.push({
      field,
      oldValue,
      newValue,
      changed
    });
  }

  return diff;
}
