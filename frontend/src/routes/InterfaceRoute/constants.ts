import type { BlockPreset } from "./types";

export const INTERFACE_PRESETS: BlockPreset[] = [
  { label: "Interface", kind: "component", stereotype: "interface" },
  { label: "API", kind: "component", stereotype: "api" },
  { label: "Service", kind: "component", stereotype: "service" },
  { label: "Protocol", kind: "component", stereotype: "protocol" },
  { label: "Port", kind: "component", stereotype: "port" }
];
