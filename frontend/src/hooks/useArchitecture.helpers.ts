import type { ArchitectureState, SysmlBlock, SysmlConnector } from "./useArchitecture";

export const INITIAL_SIZE = { width: 220, height: 140 };

export const createInitialState = (): ArchitectureState => ({
  blocks: [],
  connectors: [],
  lastModified: new Date().toISOString()
});

export const randomId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const withTimestamp = (state: ArchitectureState): ArchitectureState => ({
  ...state,
  lastModified: new Date().toISOString()
});

type LegacyComponent = {
  id: string;
  name: string;
  type: "frontend" | "backend" | "database" | "service" | "external";
  x: number;
  y: number;
  description?: string;
};

type LegacyConnection = {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: "api" | "data" | "event" | "dependency";
};

type LegacyArchitecture = {
  components: LegacyComponent[];
  connections: LegacyConnection[];
  lastModified?: string;
};

const legacyKindMap: Record<LegacyComponent["type"], string> = {
  frontend: "component",
  backend: "component",
  database: "component",
  service: "component",
  external: "external"
};

function legacyToCurrent(value: LegacyArchitecture): ArchitectureState {
  const blocks: SysmlBlock[] = (value.components ?? []).map(component => ({
    id: component.id,
    name: component.name,
    kind: (legacyKindMap[component.type] ?? "component") as SysmlBlock["kind"],
    stereotype: component.type === "external" ? "external" : "block",
    description: component.description,
    position: { x: component.x ?? 120, y: component.y ?? 120 },
    size: { ...INITIAL_SIZE },
    ports: []
  }));

  const connectors: SysmlConnector[] = (value.connections ?? []).map(connection => ({
    id: connection.id,
    source: connection.from,
    target: connection.to,
    label: connection.label,
    kind:
      connection.type === "dependency"
        ? "dependency"
        : connection.type === "api"
        ? "flow"
        : "association"
  }));

  return {
    blocks,
    connectors,
    lastModified: value.lastModified ?? new Date().toISOString()
  };
}

export function normalizeStored(value: unknown): ArchitectureState {
  if (!value || typeof value !== "object") {
    return createInitialState();
  }

  const candidate = value as Partial<ArchitectureState> & Partial<LegacyArchitecture>;
  if (Array.isArray(candidate.components) && !Array.isArray(candidate.blocks)) {
    return legacyToCurrent(candidate as LegacyArchitecture);
  }

  if (Array.isArray(candidate.blocks) && Array.isArray(candidate.connectors)) {
    return {
      blocks: candidate.blocks.map(block => ({
        ...block,
        ports: Array.isArray(block?.ports) ? block.ports : []
      })) as SysmlBlock[],
      connectors: candidate.connectors as SysmlConnector[],
      lastModified: candidate.lastModified ?? new Date().toISOString()
    };
  }

  return createInitialState();
}
