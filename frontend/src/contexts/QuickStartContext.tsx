import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MISSIONS, type MissionId } from "../components/quickstart/missions";

const STORAGE_KEY = "airgen-quickstart";

interface MissionStatus {
  completed: boolean;
  completedAt?: string;
}

export interface QuickStartState {
  isEnabled: boolean;
  isWidgetExpanded: boolean;
  hasSeenWelcome: boolean;
  hasSeenCompletion: boolean;
  missions: Record<MissionId, MissionStatus>;
  dismissedHints: string[];
}

interface QuickStartContextType {
  state: QuickStartState;

  completeMission: (missionId: MissionId) => void;
  isMissionCompleted: (missionId: MissionId) => boolean;

  toggleWidget: () => void;
  expandWidget: () => void;
  collapseWidget: () => void;

  enableGuide: () => void;
  disableGuide: () => void;
  resetGuide: () => void;

  dismissHint: (pagePath: string) => void;
  shouldShowHint: (pagePath: string) => boolean;

  dismissWelcome: () => void;
  dismissCompletion: () => void;

  completedCount: number;
  totalMissions: number;
  progressPercent: number;
  isAllComplete: boolean;
}

function createDefaultState(): QuickStartState {
  const missions = {} as Record<MissionId, MissionStatus>;
  for (const m of MISSIONS) {
    missions[m.id] = { completed: false };
  }
  return {
    isEnabled: true,
    isWidgetExpanded: false,
    hasSeenWelcome: false,
    hasSeenCompletion: false,
    missions,
    dismissedHints: [],
  };
}

function loadState(): QuickStartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<QuickStartState>;
      const defaults = createDefaultState();
      return {
        ...defaults,
        ...parsed,
        missions: { ...defaults.missions, ...parsed.missions },
      };
    }
  } catch {
    // Ignore corrupt data
  }
  return createDefaultState();
}

function saveState(state: QuickStartState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

const QuickStartContext = createContext<QuickStartContextType | null>(null);

export function QuickStartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuickStartState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const completeMission = useCallback((missionId: MissionId) => {
    setState((prev) => {
      if (prev.missions[missionId]?.completed) return prev;
      return {
        ...prev,
        missions: {
          ...prev.missions,
          [missionId]: {
            completed: true,
            completedAt: new Date().toISOString(),
          },
        },
      };
    });
  }, []);

  const isMissionCompleted = useCallback(
    (missionId: MissionId) => {
      return state.missions[missionId]?.completed ?? false;
    },
    [state.missions]
  );

  const toggleWidget = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isWidgetExpanded: !prev.isWidgetExpanded,
    }));
  }, []);

  const expandWidget = useCallback(() => {
    setState((prev) => ({ ...prev, isWidgetExpanded: true }));
  }, []);

  const collapseWidget = useCallback(() => {
    setState((prev) => ({ ...prev, isWidgetExpanded: false }));
  }, []);

  const enableGuide = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: true }));
  }, []);

  const disableGuide = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isEnabled: false,
      isWidgetExpanded: false,
    }));
  }, []);

  const resetGuide = useCallback(() => {
    setState(createDefaultState());
  }, []);

  const dismissHint = useCallback((pagePath: string) => {
    setState((prev) => {
      if (prev.dismissedHints.includes(pagePath)) return prev;
      return {
        ...prev,
        dismissedHints: [...prev.dismissedHints, pagePath],
      };
    });
  }, []);

  const shouldShowHint = useCallback(
    (pagePath: string) => {
      if (!state.isEnabled) return false;
      if (state.dismissedHints.includes(pagePath)) return false;
      return true;
    },
    [state.isEnabled, state.dismissedHints]
  );

  const dismissWelcome = useCallback(() => {
    setState((prev) => ({ ...prev, hasSeenWelcome: true }));
  }, []);

  const dismissCompletion = useCallback(() => {
    setState((prev) => ({ ...prev, hasSeenCompletion: true }));
  }, []);

  const completedCount = useMemo(
    () => Object.values(state.missions).filter((m) => m.completed).length,
    [state.missions]
  );

  const totalMissions = MISSIONS.length;

  const progressPercent = useMemo(
    () => Math.round((completedCount / totalMissions) * 100),
    [completedCount, totalMissions]
  );

  const isAllComplete = completedCount === totalMissions;

  const value = useMemo<QuickStartContextType>(
    () => ({
      state,
      completeMission,
      isMissionCompleted,
      toggleWidget,
      expandWidget,
      collapseWidget,
      enableGuide,
      disableGuide,
      resetGuide,
      dismissHint,
      shouldShowHint,
      dismissWelcome,
      dismissCompletion,
      completedCount,
      totalMissions,
      progressPercent,
      isAllComplete,
    }),
    [
      state,
      completeMission,
      isMissionCompleted,
      toggleWidget,
      expandWidget,
      collapseWidget,
      enableGuide,
      disableGuide,
      resetGuide,
      dismissHint,
      shouldShowHint,
      dismissWelcome,
      dismissCompletion,
      completedCount,
      totalMissions,
      progressPercent,
      isAllComplete,
    ]
  );

  return (
    <QuickStartContext.Provider value={value}>
      {children}
    </QuickStartContext.Provider>
  );
}

export function useQuickStart(): QuickStartContextType {
  const context = useContext(QuickStartContext);
  if (!context) {
    throw new Error("useQuickStart must be used within a QuickStartProvider");
  }
  return context;
}
