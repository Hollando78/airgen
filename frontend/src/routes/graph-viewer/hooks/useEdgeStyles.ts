/**
 * useEdgeStyles Hook
 *
 * Manages edge styling customization with localStorage persistence,
 * including colors, widths, and line styles.
 */

import { useState } from "react";

export interface EdgeStyle {
  color: string;
  width: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  dashPattern?: number[];
}

export interface EdgeStylesState {
  edgeStyles: Map<string, EdgeStyle>;
}

export interface EdgeStylesActions {
  setEdgeStyles: React.Dispatch<React.SetStateAction<Map<string, EdgeStyle>>>;
  applyEdgeStyle: (tenant: string, project: string, edgeLabel: string, style: EdgeStyle) => void;
  resetEdgeStyle: (tenant: string, project: string, edgeLabel: string) => void;
  resetAllEdgeStyles: (tenant: string, project: string) => void;
}

export function useEdgeStyles(tenant: string | null, project: string | null) {
  const [edgeStyles, setEdgeStyles] = useState<Map<string, EdgeStyle>>(() => {
    // Load saved edge styles from localStorage
    if (tenant && project) {
      const saved = localStorage.getItem(`graph-edge-styles-${tenant}-${project}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Map(Object.entries(parsed));
      }
    }
    return new Map();
  });

  const applyEdgeStyle = (
    tenant: string,
    project: string,
    edgeLabel: string,
    style: EdgeStyle
  ) => {
    const newEdgeStyles = new Map(edgeStyles);
    newEdgeStyles.set(edgeLabel, style);
    setEdgeStyles(newEdgeStyles);

    // Save to localStorage
    const stylesObj: any = {};
    newEdgeStyles.forEach((value, key) => {
      stylesObj[key] = value;
    });
    localStorage.setItem(`graph-edge-styles-${tenant}-${project}`, JSON.stringify(stylesObj));
  };

  const resetEdgeStyle = (tenant: string, project: string, edgeLabel: string) => {
    const newEdgeStyles = new Map(edgeStyles);
    newEdgeStyles.delete(edgeLabel);
    setEdgeStyles(newEdgeStyles);

    // Save to localStorage
    const stylesObj: any = {};
    newEdgeStyles.forEach((value, key) => {
      stylesObj[key] = value;
    });
    localStorage.setItem(`graph-edge-styles-${tenant}-${project}`, JSON.stringify(stylesObj));
  };

  const resetAllEdgeStyles = (tenant: string, project: string) => {
    setEdgeStyles(new Map());
    localStorage.removeItem(`graph-edge-styles-${tenant}-${project}`);
  };

  const state: EdgeStylesState = {
    edgeStyles,
  };

  const actions: EdgeStylesActions = {
    setEdgeStyles,
    applyEdgeStyle,
    resetEdgeStyle,
    resetAllEdgeStyles,
  };

  return { ...state, ...actions };
}
