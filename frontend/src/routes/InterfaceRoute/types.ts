import type { BlockKind } from "../../hooks/useInterfaceApi";

export interface BlockPreset {
  label: string;
  kind: BlockKind;
  stereotype: string;
  description?: string;
}
