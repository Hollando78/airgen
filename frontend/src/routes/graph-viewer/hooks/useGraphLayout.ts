/**
 * useGraphLayout Hook
 *
 * Manages graph layout state including selected layout algorithm,
 * initial layout completion status, and auto-fit preferences.
 */

import { useState } from "react";
import { DEFAULT_LAYOUT } from "../graphConfig";

export interface GraphLayout {
  selectedLayout: string;
  hasInitialLayout: boolean;
  autoFitEnabled: boolean;
}

export interface GraphLayoutActions {
  setSelectedLayout: React.Dispatch<React.SetStateAction<string>>;
  setHasInitialLayout: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoFitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useGraphLayout() {
  const [selectedLayout, setSelectedLayout] = useState(DEFAULT_LAYOUT);
  const [hasInitialLayout, setHasInitialLayout] = useState(false);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);

  const layout: GraphLayout = {
    selectedLayout,
    hasInitialLayout,
    autoFitEnabled,
  };

  const actions: GraphLayoutActions = {
    setSelectedLayout,
    setHasInitialLayout,
    setAutoFitEnabled,
  };

  return { ...layout, ...actions };
}
