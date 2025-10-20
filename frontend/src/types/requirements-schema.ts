/**
 * Requirements Schema Types
 *
 * Type definitions and constants specific to the requirements schema view.
 */

export type { SysmlBlock, SysmlConnector } from "../hooks/useArchitectureApi";

/**
 * Document block preset for requirements schema
 * Only document blocks are allowed in this view
 */
export const DOCUMENT_BLOCK_PRESET = {
  kind: "component" as const,
  stereotype: "<<document>>",
  backgroundColor: "#fef3c7",
  borderColor: "#f59e0b",
  borderWidth: 2,
  textColor: "#92400e",
  size: { width: 240, height: 140 }
};

/**
 * Pending linkset creation state
 */
export interface PendingLinksetCreation {
  sourceSlug: string;
  targetSlug: string;
  pendingConnector: {
    source: string;
    target: string;
    sourcePortId?: string;
    targetPortId?: string;
    label?: string;
  };
}

/**
 * Link type labels mapping
 */
export const LINK_TYPE_LABELS: Record<string, string> = {
  "satisfies": "satisfies",
  "derives": "derives from",
  "verifies": "verifies",
  "implements": "implements",
  "refines": "refines",
  "conflicts": "conflicts with"
};
