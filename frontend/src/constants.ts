import type { RequirementPattern, VerificationMethod } from "./types";

export const REQUIREMENT_PATTERNS: RequirementPattern[] = [
  "ubiquitous",
  "event",
  "state",
  "unwanted",
  "optional"
];

export const VERIFICATION_METHODS: VerificationMethod[] = [
  "Test",
  "Analysis",
  "Inspection",
  "Demonstration"
];
