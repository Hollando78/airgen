/**
 * Architecture Data Mappers
 *
 * Pure functions for transforming API data to frontend types.
 * These mappers handle the conversion from backend ArchitectureBlockRecord
 * and ArchitectureConnectorRecord to frontend SysmlBlock and SysmlConnector.
 */

import type {
  ArchitectureBlockRecord,
  ArchitectureConnectorRecord
} from "../../types";
import type {
  SysmlBlock,
  SysmlConnector,
  BlockPort,
  BlockPortRecord,
  BlockPortOverride
} from "../../types/architecture";

/**
 * Resolves definition ports with diagram-level overrides
 *
 * Merges port definitions with their diagram-specific overrides (position, visibility, etc.)
 *
 * @param definitionPorts - Base port definitions from block definition
 * @param overrides - Diagram-specific port overrides
 * @returns Merged array of ports with overrides applied
 */
export function resolvePortsWithOverrides(
  definitionPorts: BlockPortRecord[],
  overrides: Record<string, BlockPortOverride> = {}
): BlockPort[] {
  return definitionPorts.map(port => {
    const override = overrides[port.id];
    if (!override) {
      return { ...port };
    }

    const merged: BlockPort = { ...port };

    if (override.edge !== undefined) {
      merged.edge = override.edge ?? undefined;
    }
    if (override.offset !== undefined) {
      merged.offset = override.offset ?? undefined;
    }
    if (override.hidden !== undefined) {
      merged.hidden = override.hidden ?? undefined;
    }
    if (override.showLabel !== undefined) {
      merged.showLabel = override.showLabel ?? undefined;
    }
    if (override.labelOffsetX !== undefined) {
      merged.labelOffsetX = override.labelOffsetX ?? undefined;
    }
    if (override.labelOffsetY !== undefined) {
      merged.labelOffsetY = override.labelOffsetY ?? undefined;
    }

    return merged;
  });
}

/**
 * Maps ArchitectureBlockRecord from API to SysmlBlock frontend type
 *
 * Transforms backend block representation to frontend block with resolved ports
 * and normalized styling properties.
 *
 * @param block - Backend architecture block record
 * @returns Frontend SysmlBlock with resolved ports and styling
 */
export function mapBlockFromApi(block: ArchitectureBlockRecord): SysmlBlock {
  const definitionPorts = (block.definitionPorts ?? block.ports ?? []).map(port => ({ ...port }));
  const overrides = block.portOverrides ?? {};

  return {
    id: block.id,
    name: block.name,
    kind: block.kind,
    stereotype: block.stereotype || undefined,
    description: block.description || undefined,
    position: { x: block.positionX, y: block.positionY },
    size: { width: block.sizeWidth, height: block.sizeHeight },
    ports: resolvePortsWithOverrides(definitionPorts, overrides),
    definitionPorts: definitionPorts as BlockPort[],
    portOverrides: Object.entries(overrides).reduce<Record<string, BlockPortOverride>>((acc, [key, value]) => {
      acc[key] = { ...value };
      return acc;
    }, {}),
    documentIds: block.documentIds,
    // Styling properties
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
 * Maps ArchitectureConnectorRecord from API to SysmlConnector frontend type
 *
 * Transforms backend connector representation to frontend connector with
 * normalized styling and positioning properties.
 *
 * @param connector - Backend architecture connector record
 * @returns Frontend SysmlConnector with styling and control points
 */
export function mapConnectorFromApi(connector: ArchitectureConnectorRecord): SysmlConnector {
  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    kind: connector.kind,
    label: connector.label || undefined,
    sourcePortId: connector.sourcePortId,
    targetPortId: connector.targetPortId,
    documentIds: connector.documentIds ?? [],
    // Styling properties
    lineStyle: connector.lineStyle,
    markerStart: connector.markerStart,
    markerEnd: connector.markerEnd,
    linePattern: connector.linePattern,
    color: connector.color,
    strokeWidth: connector.strokeWidth,
    // Label positioning
    labelOffsetX: connector.labelOffsetX ?? undefined,
    labelOffsetY: connector.labelOffsetY ?? undefined,
    controlPoints: connector.controlPoints ?? undefined
  };
}
