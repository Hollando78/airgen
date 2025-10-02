import { useState, useEffect, useCallback, useMemo } from "react";
import { createInitialState, randomId, withTimestamp, normalizeStored, INITIAL_SIZE } from "./useArchitecture.helpers";

export type BlockKind = "system" | "subsystem" | "component" | "actor" | "external" | "interface";

export type PortDirection = "in" | "out" | "inout";

export interface BlockPort {
  id: string;
  name: string;
  direction: PortDirection;
  edge?: "top" | "right" | "bottom" | "left";
  offset?: number;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  iconColor?: string;
  shape?: "circle" | "square" | "diamond";
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
  documentIds?: string[];
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

  const addDocumentToBlock = useCallback(
    (blockId: string, documentId: string) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? {
                ...block,
                documentIds: [...(block.documentIds || []), documentId].filter(
                  (id, index, self) => self.indexOf(id) === index
                )
              }
            : block
        )
      }));
    },
    [persist]
  );

  const removeDocumentFromBlock = useCallback(
    (blockId: string, documentId: string) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? {
                ...block,
                documentIds: (block.documentIds || []).filter(id => id !== documentId)
              }
            : block
        )
      }));
    },
    [persist]
  );

  const setBlockDocuments = useCallback(
    (blockId: string, documentIds: string[]) => {
      persist(prev => ({
        ...prev,
        blocks: prev.blocks.map(block =>
          block.id === blockId
            ? {
                ...block,
                documentIds: [...documentIds]
              }
            : block
        )
      }));
    },
    [persist]
  );

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
    addDocumentToBlock,
    removeDocumentFromBlock,
    setBlockDocuments,
    hasChanges: architecture.blocks.length > 0 || architecture.connectors.length > 0
  };
}
