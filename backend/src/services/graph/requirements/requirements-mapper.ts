import type { Node as Neo4jNode } from "neo4j-driver";
import { toNumber } from "../../../lib/neo4j-utils.js";
import type {
  RequirementRecord,
  RequirementPattern,
  VerificationMethod
} from "../../workspace.js";

/**
 * Compliance status for requirements
 */
export type ComplianceStatus = "N/A" | "Compliant" | "Compliance Risk" | "Non-Compliant";

/**
 * Input type for creating/updating requirements
 */
export type RequirementInput = {
  tenant: string;
  projectKey: string;
  documentSlug?: string;
  sectionId?: string;
  ref?: string;
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: ComplianceStatus;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  userId?: string; // User making the change (for version tracking)
};

/**
 * Maps a Neo4j node to a RequirementRecord
 *
 * @param node - Neo4j node from query result
 * @param documentSlug - Optional document slug if requirement is in a document
 * @returns Mapped requirement record
 */
export function mapRequirement(node: Neo4jNode, documentSlug?: string): RequirementRecord {
  const props = node.properties as Record<string, unknown>;
  const text = props.text ? String(props.text) : "";
  const titleProp = props.title ? String(props.title) : null;

  return {
    id: String(props.id),
    hashId: props.hashId ? String(props.hashId) : "",
    ref: String(props.ref),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    title:
      titleProp && titleProp.trim().length > 0
        ? titleProp
        : text.split(" ").slice(0, 8).join(" ") + (text.split(" ").length > 8 ? "..." : ""),
    text,
    pattern: props.pattern ? (props.pattern as RequirementPattern) : undefined,
    verification: props.verification ? (props.verification as VerificationMethod) : undefined,
    rationale: props.rationale ? String(props.rationale) : undefined,
    complianceStatus: props.complianceStatus ? (props.complianceStatus as ComplianceStatus) : undefined,
    complianceRationale: props.complianceRationale ? String(props.complianceRationale) : undefined,
    qaScore:
      props.qaScore !== null && props.qaScore !== undefined
        ? toNumber(props.qaScore)
        : undefined,
    qaVerdict: props.qaVerdict ? String(props.qaVerdict) : undefined,
    suggestions: Array.isArray(props.suggestions)
      ? (props.suggestions as string[])
      : typeof props.suggestions === "string"
        ? (JSON.parse(props.suggestions as string) as string[])
        : [],
    tags: Array.isArray(props.tags)
      ? (props.tags as string[])
      : typeof props.tags === "string"
        ? (JSON.parse(props.tags as string) as string[])
        : [],
    path: String(props.path),
    documentSlug,
    order: props.order !== undefined && props.order !== null ? toNumber(props.order) : undefined,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt),
    deleted: props.deleted ? Boolean(props.deleted) : undefined,
    archived: props.archived ? Boolean(props.archived) : undefined,
    attributes: props.attributes && typeof props.attributes === 'string'
      ? JSON.parse(props.attributes as string) as Record<string, string | number | boolean | null>
      : undefined,
    // Data integrity fields
    contentHash: props.contentHash ? String(props.contentHash) : undefined,
    deletedAt: props.deletedAt ? String(props.deletedAt) : undefined,
    deletedBy: props.deletedBy ? String(props.deletedBy) : undefined,
    restoredAt: props.restoredAt ? String(props.restoredAt) : undefined
  };
}
