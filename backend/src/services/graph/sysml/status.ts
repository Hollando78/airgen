import { config } from "../../../config.js";
import type { SysmlServiceStatus } from "./types.js";

const STATUS_VERSION = "phase0-sysml-scaffold";

/**
 * Provide a simple status payload so front-end clients can detect
 * whether SysML endpoints are ready for interaction.
 */
export function getSysmlServiceStatus(): SysmlServiceStatus {
  const betaEnabled = Boolean(config.features.sysmlBetaEnabled);
  const ready = false; // Phase 0 scaffold; flip once MVP endpoints are functional

  return {
    ready,
    phase: "architecture",
    message: betaEnabled
      ? "SysML services are undergoing Phase 0 architecture setup."
      : "SysML beta feature flag is disabled.",
    version: STATUS_VERSION
  };
}
