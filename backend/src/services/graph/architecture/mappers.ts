import { Node as Neo4jNode, Relationship as Neo4jRelationship, Integer } from "neo4j-driver";
import {
  ArchitectureBlockDefinitionRecord,
  ArchitectureBlockRecord,
  ArchitectureBlockLibraryRecord,
  ArchitectureDiagramRecord,
  ArchitectureConnectorRecord,
  BlockKind,
  ConnectorKind,
  BlockPortRecord
} from "./types.js";

export function toNumber(value: unknown, fallback = 0): number {
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

export function parseJsonArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  try {
    return JSON.parse(String(value)) as T[];
  } catch {
    return [];
  }
}

export function mapBlockDefinition(node: Neo4jNode, documentIds: string[] = []): ArchitectureBlockDefinitionRecord {
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

export function mapBlockWithPlacement(
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
    placementUpdatedAt,
    // Styling properties
    backgroundColor: relProps?.backgroundColor ? String(relProps.backgroundColor) : null,
    borderColor: relProps?.borderColor ? String(relProps.borderColor) : null,
    borderWidth: relProps?.borderWidth ? toNumber(relProps.borderWidth) : null,
    borderStyle: relProps?.borderStyle ? String(relProps.borderStyle) : null,
    textColor: relProps?.textColor ? String(relProps.textColor) : null,
    fontSize: relProps?.fontSize ? toNumber(relProps.fontSize) : null,
    fontWeight: relProps?.fontWeight ? String(relProps.fontWeight) : null,
    borderRadius: relProps?.borderRadius ? toNumber(relProps.borderRadius) : null
  };
}

export function mapBlockLibraryEntry(
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

export function mapArchitectureDiagram(node: Neo4jNode): ArchitectureDiagramRecord {
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

export function mapArchitectureConnector(node: Neo4jNode): ArchitectureConnectorRecord {
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
    updatedAt: String(props.updatedAt),
    // Styling properties
    lineStyle: props.lineStyle ? String(props.lineStyle) : null,
    markerStart: props.markerStart ? String(props.markerStart) : null,
    markerEnd: props.markerEnd ? String(props.markerEnd) : null,
    linePattern: props.linePattern ? String(props.linePattern) : null,
    color: props.color ? String(props.color) : null,
    strokeWidth: props.strokeWidth ? toNumber(props.strokeWidth) : null
  };
}
