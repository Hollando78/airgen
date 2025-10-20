/**
 * Requirements Schema Mappers
 *
 * Pure data transformation functions for converting API records
 * to frontend SysML types.
 */

import type { ArchitectureBlockRecord, ArchitectureConnectorRecord } from "../types";
import type { SysmlBlock, SysmlConnector } from "../hooks/useArchitectureApi";

/**
 * Transform API block records to SysML blocks
 */
export function mapBlockFromApi(block: ArchitectureBlockRecord): SysmlBlock {
  return {
    id: block.id,
    name: block.name,
    kind: block.kind,
    stereotype: block.stereotype || undefined,
    description: block.description || undefined,
    position: { x: block.positionX, y: block.positionY },
    size: { width: block.sizeWidth, height: block.sizeHeight },
    ports: block.ports,
    documentIds: block.documentIds,
    backgroundColor: block.backgroundColor || undefined,
    borderColor: block.borderColor || undefined,
    borderWidth: block.borderWidth || undefined,
    borderStyle: block.borderStyle || undefined,
    textColor: block.textColor || undefined,
    fontSize: block.fontSize || undefined,
    fontWeight: block.fontWeight || undefined,
    borderRadius: block.borderRadius || undefined
  };
}

/**
 * Transform API connector records to SysML connectors
 */
export function mapConnectorFromApi(connector: ArchitectureConnectorRecord): SysmlConnector {
  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    kind: connector.kind,
    label: connector.label || undefined,
    sourcePortId: connector.sourcePortId || null,
    targetPortId: connector.targetPortId || null,
    documentIds: connector.documentIds ?? [],
    lineStyle: connector.lineStyle || undefined,
    markerStart: connector.markerStart || undefined,
    markerEnd: connector.markerEnd || undefined,
    linePattern: connector.linePattern || undefined,
    color: connector.color || undefined,
    strokeWidth: connector.strokeWidth || undefined,
    labelOffsetX: connector.labelOffsetX || undefined,
    labelOffsetY: connector.labelOffsetY || undefined
  };
}
