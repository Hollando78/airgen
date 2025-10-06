import { useCallback, useDeferredValue, useEffect, useMemo, useReducer } from "react";
import type { InterfaceConnector, InterfaceBlock } from "../../../hooks/useInterfaceApi";
import type { ArchitectureDiagramRecord, DocumentRecord } from "../../../types";

export interface InterfaceWorkspaceSelection {
  blockId: string | null;
  connectorId: string | null;
  port: { blockId: string; portId: string } | null;
}

interface DialogState {
  create: { open: boolean; draftName: string };
  rename: { open: boolean; draftName: string; diagramId: string | null };
  confirmClear: { open: boolean };
}

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface InterfaceWorkspaceUiState {
  selection: InterfaceWorkspaceSelection;
  connectMode: boolean;
  diagramViewports: Record<string, ViewportState>;
  dialogs: DialogState;
}

type WorkspaceAction =
  | { type: "SELECT_BLOCK"; payload: { blockId: string | null } }
  | { type: "SELECT_CONNECTOR"; payload: { connectorId: string | null } }
  | { type: "SELECT_PORT"; payload: { blockId: string; portId: string } | null }
  | { type: "RESET_SELECTION" }
  | { type: "TOGGLE_CONNECT_MODE" }
  | { type: "SET_CONNECT_MODE"; payload: { value: boolean } }
  | { type: "REMEMBER_VIEWPORT"; payload: { diagramId: string; viewport: ViewportState } }
  | { type: "OPEN_CREATE_DIALOG"; payload?: { name?: string } }
  | { type: "CLOSE_CREATE_DIALOG" }
  | { type: "SET_CREATE_NAME"; payload: { name: string } }
  | { type: "OPEN_RENAME_DIALOG"; payload: { diagramId: string; currentName: string } }
  | { type: "CLOSE_RENAME_DIALOG" }
  | { type: "SET_RENAME_NAME"; payload: { name: string } }
  | { type: "OPEN_CONFIRM_CLEAR" }
  | { type: "CLOSE_CONFIRM_CLEAR" }
  | { type: "HYDRATE_VIEWPORTS"; payload: Record<string, ViewportState> };

const initialState: InterfaceWorkspaceUiState = {
  selection: { blockId: null, connectorId: null, port: null },
  connectMode: false,
  diagramViewports: {},
  dialogs: {
    create: { open: false, draftName: "" },
    rename: { open: false, draftName: "", diagramId: null },
    confirmClear: { open: false }
  }
};

function reducer(state: InterfaceWorkspaceUiState, action: WorkspaceAction): InterfaceWorkspaceUiState {
  switch (action.type) {
    case "SELECT_BLOCK": {
      if (state.selection.blockId === action.payload.blockId) {
        return state;
      }
      return {
        ...state,
        selection: {
          blockId: action.payload.blockId,
          connectorId: null,
          port: null
        }
      };
    }
    case "SELECT_CONNECTOR": {
      if (state.selection.connectorId === action.payload.connectorId) {
        return state;
      }
      return {
        ...state,
        selection: {
          blockId: null,
          connectorId: action.payload.connectorId,
          port: null
        }
      };
    }
    case "SELECT_PORT": {
      const portPayload = action.payload;
      return {
        ...state,
        selection: {
          blockId: null,
          connectorId: null,
          port: portPayload ? { ...portPayload } : null
        }
      };
    }
    case "RESET_SELECTION":
      return {
        ...state,
        selection: initialState.selection
      };
    case "TOGGLE_CONNECT_MODE":
      return {
        ...state,
        connectMode: !state.connectMode
      };
    case "SET_CONNECT_MODE":
      if (state.connectMode === action.payload.value) {
        return state;
      }
      return {
        ...state,
        connectMode: action.payload.value
      };
    case "REMEMBER_VIEWPORT":
      return {
        ...state,
        diagramViewports: {
          ...state.diagramViewports,
          [action.payload.diagramId]: action.payload.viewport
        }
      };
    case "HYDRATE_VIEWPORTS":
      return {
        ...state,
        diagramViewports: {
          ...action.payload,
          ...state.diagramViewports
        }
      };
    case "OPEN_CREATE_DIALOG":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          create: {
            open: true,
            draftName: action.payload?.name ?? ""
          }
        }
      };
    case "CLOSE_CREATE_DIALOG":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          create: { open: false, draftName: "" }
        }
      };
    case "SET_CREATE_NAME":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          create: {
            ...state.dialogs.create,
            draftName: action.payload.name
          }
        }
      };
    case "OPEN_RENAME_DIALOG":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          rename: {
            open: true,
            draftName: action.payload.currentName,
            diagramId: action.payload.diagramId
          }
        }
      };
    case "CLOSE_RENAME_DIALOG":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          rename: { open: false, draftName: "", diagramId: null }
        }
      };
    case "SET_RENAME_NAME":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          rename: {
            ...state.dialogs.rename,
            draftName: action.payload.name
          }
        }
      };
    case "OPEN_CONFIRM_CLEAR":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          confirmClear: { open: true }
        }
      };
    case "CLOSE_CONFIRM_CLEAR":
      return {
        ...state,
        dialogs: {
          ...state.dialogs,
          confirmClear: { open: false }
        }
      };
    default:
      return state;
  }
}

export interface UseInterfaceWorkspaceStateParams {
  diagrams: ArchitectureDiagramRecord[];
  activeDiagramId: string | null;
  blocks: InterfaceBlock[];
  connectors: InterfaceConnector[];
  documents: DocumentRecord[];
}

export function useInterfaceWorkspaceState({
  diagrams,
  activeDiagramId,
  blocks,
  connectors,
  documents
}: UseInterfaceWorkspaceStateParams) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const memoisedDocuments = useDeferredValue(documents);
  const memoisedBlocks = useDeferredValue(blocks);
  const memoisedConnectors = useDeferredValue(connectors);

  const viewport = useMemo(() => {
    if (!activeDiagramId) {
      return undefined;
    }

    const knownViewport = state.diagramViewports[activeDiagramId];
    if (knownViewport) {
      return knownViewport;
    }

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`airgen:diagramViewport:${activeDiagramId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as ViewportState;
          if (
            typeof parsed === "object" &&
            typeof parsed.x === "number" &&
            typeof parsed.y === "number" &&
            typeof parsed.zoom === "number"
          ) {
            return parsed;
          }
        }
      } catch (error) {
        console.warn("Failed to read viewport from storage", error);
      }
    }

    return undefined;
  }, [activeDiagramId, state.diagramViewports]);

  const selectedBlock = useMemo(() => {
    if (!state.selection.blockId) {
      return null;
    }
    return memoisedBlocks.find(block => block.id === state.selection.blockId) ?? null;
  }, [memoisedBlocks, state.selection.blockId]);

  const selectedConnector = useMemo(() => {
    if (!state.selection.connectorId) {
      return null;
    }
    return memoisedConnectors.find(connector => connector.id === state.selection.connectorId) ?? null;
  }, [memoisedConnectors, state.selection.connectorId]);

  const selectedPort = useMemo(() => {
    if (!state.selection.port) {
      return null;
    }
    const { blockId, portId } = state.selection.port;
    const resolvedBlock = memoisedBlocks.find(block => block.id === blockId);
    if (!resolvedBlock) {
      return null;
    }
    const port = resolvedBlock.ports.find(item => item.id === portId);
    if (!port) {
      return null;
    }
    return { port, block: resolvedBlock } as const;
  }, [memoisedBlocks, state.selection.port]);

  const selectBlock = useCallback((blockId: string | null) => {
    dispatch({ type: "SELECT_BLOCK", payload: { blockId } });
  }, []);

  const selectConnector = useCallback((connectorId: string | null) => {
    dispatch({ type: "SELECT_CONNECTOR", payload: { connectorId } });
  }, []);

  const selectPort = useCallback((blockId: string | null, portId?: string | null) => {
    if (!blockId || !portId) {
      dispatch({ type: "SELECT_PORT", payload: null });
      return;
    }
    dispatch({ type: "SELECT_PORT", payload: { blockId, portId } });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "RESET_SELECTION" });
  }, []);

  const toggleConnectMode = useCallback(() => {
    dispatch({ type: "TOGGLE_CONNECT_MODE" });
  }, []);

  const setConnectMode = useCallback((value: boolean) => {
    dispatch({ type: "SET_CONNECT_MODE", payload: { value } });
  }, []);

  const rememberViewport = useCallback((diagramId: string, nextViewport: ViewportState) => {
    dispatch({ type: "REMEMBER_VIEWPORT", payload: { diagramId, viewport: nextViewport } });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          `airgen:diagramViewport:${diagramId}`,
          JSON.stringify(nextViewport)
        );
      } catch (error) {
        console.warn("Failed to persist viewport", error);
      }
    }
  }, []);

  const openCreateDialog = useCallback((name?: string) => {
    dispatch({ type: "OPEN_CREATE_DIALOG", payload: { name } });
  }, []);

  const closeCreateDialog = useCallback(() => {
    dispatch({ type: "CLOSE_CREATE_DIALOG" });
  }, []);

  const setCreateDialogName = useCallback((name: string) => {
    dispatch({ type: "SET_CREATE_NAME", payload: { name } });
  }, []);

  const openRenameDialog = useCallback((diagramId: string, currentName: string) => {
    dispatch({ type: "OPEN_RENAME_DIALOG", payload: { diagramId, currentName } });
  }, []);

  const closeRenameDialog = useCallback(() => {
    dispatch({ type: "CLOSE_RENAME_DIALOG" });
  }, []);

  const setRenameDialogName = useCallback((name: string) => {
    dispatch({ type: "SET_RENAME_NAME", payload: { name } });
  }, []);

  const openConfirmClear = useCallback(() => {
    dispatch({ type: "OPEN_CONFIRM_CLEAR" });
  }, []);

  const closeConfirmClear = useCallback(() => {
    dispatch({ type: "CLOSE_CONFIRM_CLEAR" });
  }, []);

  const hydratePersistedViewports = useCallback((ids: string[]) => {
    if (typeof window === "undefined" || !ids.length) {
      return;
    }

    const hydrated: Record<string, ViewportState> = {};

    ids.forEach(id => {
      try {
        const raw = window.localStorage.getItem(`airgen:diagramViewport:${id}`);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as ViewportState;
        if (
          typeof parsed === "object" &&
          typeof parsed.x === "number" &&
          typeof parsed.y === "number" &&
          typeof parsed.zoom === "number"
        ) {
          hydrated[id] = parsed;
        }
      } catch (error) {
        console.warn("Failed to hydrate viewport", error);
      }
    });

    if (Object.keys(hydrated).length) {
      dispatch({ type: "HYDRATE_VIEWPORTS", payload: hydrated });
    }
  }, []);

  useEffect(() => {
    if (!diagrams.length) {
      return;
    }
    const diagramIds = diagrams.map(diagram => diagram.id);
    hydratePersistedViewports(diagramIds);
  }, [diagrams, hydratePersistedViewports]);

  return {
    state,
    viewport,
    documents: memoisedDocuments,
    blocks: memoisedBlocks,
    connectors: memoisedConnectors,
    diagrams,
    activeDiagramId,
    selectedBlock,
    selectedConnector,
    selectedPort,
    selectBlock,
    selectConnector,
    selectPort,
    clearSelection,
    toggleConnectMode,
    setConnectMode,
    rememberViewport,
    dialogs: state.dialogs,
    openCreateDialog,
    closeCreateDialog,
    setCreateDialogName,
    openRenameDialog,
    closeRenameDialog,
    setRenameDialogName,
    openConfirmClear,
    closeConfirmClear
  };
}
