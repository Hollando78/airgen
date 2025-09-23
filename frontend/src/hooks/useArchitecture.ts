import { useState, useEffect, useCallback, useMemo } from "react";

export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type PortDirection = "in" | "out" | "inout";

export interface BlockPort {
  id: string;
  name: string;
  direction: PortDirection;
}

export interface SysmlBlock {
  id: string;
  name: string;
  kind: BlockKind;
  stereotype?: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  ports: BlockPort[];
}

export type ConnectorKind = "association" | "flow" | "dependency" | "composition";

export interface SysmlConnector {
  id: string;
  source: string;
  target: string;
  kind: ConnectorKind;
  label?: string;
  sourcePortId?: string | null;
  targetPortId?: string | null;
}

export interface ArchitectureState {
  blocks: SysmlBlock[];
  connectors: SysmlConnector[];
  lastModified: string;
}

const INITIAL_SIZE = { width: 220, height: 140 };

const createInitialState = (): ArchitectureState => ({
  blocks: [],
  connectors: [],
  lastModified: new Date().toISOString()
});

const randomId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const withTimestamp = (state: ArchitectureState): ArchitectureState => ({
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

const legacyKindMap: Record<LegacyComponent["type"], BlockKind> = {
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
    kind: legacyKindMap[component.type] ?? "component",
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
    kind: connection.type === "dependency" ? "dependency" : connection.type === "api" ? "flow" : "association"
  }));

  return {
    blocks,
    connectors,
    lastModified: value.lastModified ?? new Date().toISOString()
  };
}

function normalizeStored(value: unknown): ArchitectureState {
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

export function useArchitecture(tenant: string | null, project: string | null) {
  const [architecture, setArchitecture] = useState<ArchitectureState>(createInitialState());

  const storageKey = useMemo(
    () => (tenant && project ? `architecture:${tenant}:${project}` : null),
    [tenant, project]
  );

  useEffect(() => {
    if (!storageKey) {
      setArchitecture(createInitialState());
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = normalizeStored(JSON.parse(stored));
        setArchitecture(parsed);
      } else {
        setArchitecture(createInitialState());
      }
    } catch (error) {
      console.warn("Failed to load architecture from storage:", error);
      setArchitecture(createInitialState());
    }
  }, [storageKey]);

  const persist = useCallback(
    (updater: (prev: ArchitectureState) => ArchitectureState) => {
      setArchitecture(prev => {
        const next = withTimestamp(updater(prev));
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch (error) {
            console.warn("Failed to save architecture to storage:", error);
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const addBlock = useCallback(
    (input: {
      name: string;
      kind: BlockKind;
      stereotype?: string;
      description?: string;
      position?: { x: number; y: number };
      size?: { width: number; height: number };
    }) => {
      const id = randomId("block");
      const block: SysmlBlock = {
        id,
        name: input.name,
        kind: input.kind,
        stereotype: input.stereotype,
        description: input.description,
        position: input.position ?? { x: 160, y: 160 },
        size: input.size ?? { ...INITIAL_SIZE },
        ports: []
      };

      persist(prev => ({
        ...prev,
        blocks: [...prev.blocks, block]
      }));

      return id;
    },
    [persist]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<Omit<SysmlBlock, "id">>) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === id ? { ...block, ...updates } : block
        )
      }));
    },
    [persist]
  );

  const updateBlockPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      updateBlock(id, { position });
    },
    [updateBlock]
  );

  const updateBlockSize = useCallback(
    (id: string, size: { width: number; height: number }) => {
      updateBlock(id, { size });
    },
    [updateBlock]
  );

  const removeBlock = useCallback(
    (id: string) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.filter(block => block.id !== id),
        connectors: prev.connectors.filter(connector =>
          connector.source !== id && connector.target !== id
        )
      }));
    },
    [persist]
  );

  const addPort = useCallback(
    (blockId: string, port: { name: string; direction: PortDirection }) => {
      const newPort: BlockPort = {
        id: randomId("port"),
        name: port.name,
        direction: port.direction
      };

      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? { ...block, ports: [...block.ports, newPort] }
            : block
        )
      }));

      return newPort.id;
    },
    [persist]
  );

  const updatePort = useCallback(
    (blockId: string, portId: string, updates: Partial<Omit<BlockPort, "id">>) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? {
                ...block,
                ports: block.ports.map(port =>
                  port.id === portId ? { ...port, ...updates } : port
                )
              }
            : block
        )
      }));
    },
    [persist]
  );

  const removePort = useCallback(
    (blockId: string, portId: string) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? {
                ...block,
                ports: block.ports.filter(port => port.id !== portId)
              }
            : block
        )
      }));
    },
    [persist]
  );

  const addConnector = useCallback(
    (input: {
      source: string;
      target: string;
      kind?: ConnectorKind;
      label?: string;
      sourcePortId?: string | null;
      targetPortId?: string | null;
    }) => {
      const connector: SysmlConnector = {
        id: randomId("connector"),
        source: input.source,
        target: input.target,
        kind: input.kind ?? "flow",
        label: input.label,
        sourcePortId: input.sourcePortId ?? null,
        targetPortId: input.targetPortId ?? null
      };

      persist(prev => ({
        ...prev,
        connectors: [...prev.connectors, connector]
      }));

      return connector.id;
    },
    [persist]
  );

  const updateConnector = useCallback(
    (id: string, updates: Partial<Omit<SysmlConnector, "id">>) => {
      persist(prev => ({
        ...prev,
        connectors: prev.connectors.map(connector =>
          connector.id === id ? { ...connector, ...updates } : connector
        )
      }));
    },
    [persist]
  );

  const removeConnector = useCallback(
    (id: string) => {
      persist(prev => ({
        ...prev,
        connectors: prev.connectors.filter(connector => connector.id !== id)
      }));
    },
    [persist]
  );

  const clearArchitecture = useCallback(() => {
    const next = createInitialState();
    setArchitecture(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (error) {
        console.warn("Failed to clear architecture storage:", error);
      }
    }
  }, [storageKey]);

  return {
    architecture,
    addBlock,
    updateBlock,
    updateBlockPosition,
    updateBlockSize,
    removeBlock,
    addPort,
    updatePort,
    removePort,
    addConnector,
    updateConnector,
    removeConnector,
    clearArchitecture,
    hasChanges: architecture.blocks.length > 0 || architecture.connectors.length > 0
  };
}
