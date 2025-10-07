import { createHash } from "node:crypto";
import type { RequirementRecord } from "../services/workspace.js";

/**
 * Computes a deterministic SHA-256 hash of requirement content
 * Used to detect if markdown has drifted from Neo4j database
 */
export function computeRequirementHash(requirement: {
  text: string;
  pattern?: string | null;
  verification?: string | null;
}): string {
  // Create a canonical representation of the requirement
  const canonical = JSON.stringify({
    text: requirement.text.trim(),
    pattern: requirement.pattern || null,
    verification: requirement.verification || null
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Verifies if a requirement's stored hash matches its current content
 */
export function verifyRequirementHash(
  requirement: RequirementRecord
): boolean {
  if (!requirement.contentHash) {
    // No hash stored, cannot verify
    return false;
  }

  const computedHash = computeRequirementHash({
    text: requirement.text,
    pattern: requirement.pattern,
    verification: requirement.verification
  });

  return computedHash === requirement.contentHash;
}

/**
 * Detects if markdown content has drifted from database
 * Returns true if there's a mismatch between stored and computed hash
 */
export function hasDrift(requirement: RequirementRecord): boolean {
  if (!requirement.contentHash) {
    // No hash means we can't detect drift, assume no drift
    return false;
  }

  return !verifyRequirementHash(requirement);
}

/**
 * Computes hash from markdown text without parsing full requirement
 * Useful for quick drift detection
 */
export function computeMarkdownContentHash(
  text: string,
  pattern?: string | null,
  verification?: string | null
): string {
  return computeRequirementHash({ text, pattern, verification });
}
