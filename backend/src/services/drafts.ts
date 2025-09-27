import { analyzeRequirement } from "@airgen/req-qa";
import { RequirementPattern, VerificationMethod } from "./workspace.js";

export type DraftRequest = {
  need: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  count?: number;
  actor?: string;
  system?: string;
  trigger?: string;
  response?: string;
  constraint?: string;
};

export type Draft = {
  text: string;
  pattern: RequirementPattern;
  verification: VerificationMethod;
  qaScore: number;
  qaVerdict: string;
  rationale: string;
  source: "heuristic" | "llm";
};

const PATTERNS: RequirementPattern[] = ["event", "state", "ubiquitous", "unwanted", "optional"];
const VERIFICATIONS: VerificationMethod[] = ["Test", "Analysis", "Inspection", "Demonstration"];

function choosePatterns(requested: RequirementPattern | undefined, count: number): RequirementPattern[] {
  if (requested) return Array.from({ length: count }, () => requested);
  const sequences: RequirementPattern[] = [];
  for (let i = 0; i < count; i += 1) {
    sequences.push(PATTERNS[i % PATTERNS.length]);
  }
  return sequences;
}

function chooseVerification(requested?: VerificationMethod): VerificationMethod {
  return requested ?? "Test";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}


function templateFor(pattern: RequirementPattern, params: DraftRequest): string {
  const actor = params.actor ?? "the system";
  const system = params.system ?? "the system";
  const trigger = params.trigger ?? "the specified event";
  const response = params.response ?? "meet the performance objective";
  const constraint = params.constraint ?? "within 250 ms";

  switch (pattern) {
    case "event":
      return `When ${trigger}, ${system} shall ${response} ${constraint}.`;
    case "state":
      return `While ${actor} is in the ${trigger} state, ${system} shall ${response} ${constraint}.`;
    case "unwanted":
      return `If ${trigger} occurs, ${system} shall ${response} ${constraint}.`;
    case "optional":
      return `Where ${actor} engages optional mode ${trigger}, ${system} shall ${response} ${constraint}.`;
    case "ubiquitous":
    default:
      return `${system} shall ${response} ${constraint}.`;
  }
}

export function generateDrafts(request: DraftRequest): Draft[] {
  const count = Math.min(Math.max(request.count ?? 3, 1), 5);
  const patterns = choosePatterns(request.pattern, count);
  const drafts: Draft[] = [];

  for (const pattern of patterns) {
    const template = templateFor(pattern, request);
    const contextual = `${request.need.trim()} ${template}`;
    const text = normalize(contextual);
    const qa = analyzeRequirement(text);
    drafts.push({
      text,
      pattern,
      verification: chooseVerification(request.verification),
      qaScore: qa.score,
      qaVerdict: qa.verdict,
      rationale: `Pattern '${pattern}' with heuristic QA score ${qa.score}.`,
      source: "heuristic"
    });
  }

  return drafts;
}
