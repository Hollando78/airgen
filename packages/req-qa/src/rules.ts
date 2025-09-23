import { AMBIGUOUS } from "./ambiguity.js";

export type RuleHit = { rule: string; ok: boolean; message?: string };
export type Verdict = "pass" | "fail" | "warn";

export type QaResult = {
  score: number;
  hits: RuleHit[];
  suggestions: string[];
  verdict: string;
  pattern?: "ubiquitous" | "event" | "state" | "unwanted" | "optional";
  verification?: "Test" | "Analysis" | "Inspection" | "Demonstration";
};

const SHALL_REGEX = /\bshall\b/i;
const FORBIDDEN_MODALS = /\b(will|should|may|can|could|might)\b/i;
const AND_OR = /\b(and\/or)\b/i;

function words(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function containsAmbiguous(s: string) {
  const low = s.toLowerCase();
  return AMBIGUOUS.filter(w => low.includes(w));
}

function hasUnits(s: string) {
  // naive units check (SI-like symbols)
  return /(ms|s|kg|g|m|km|cm|mm|°c|kpa|bar|v|a|w|hz|db|m\/?s|m\/?s²|%)\b/i.test(s);
}

function singleVerbLike(s: string) {
  // crude heuristic: count main verbs like "shall <verb>"
  const m = s.match(/\bshall\s+([a-z]+)/i);
  return !!m;
}

function lengthOk(s: string) {
  const n = words(s);
  return n >= 8 && n <= 35;
}

function patternDetect(s: string): QaResult["pattern"] {
  if (/^when\b/i.test(s)) return "event";
  if (/^while\b/i.test(s)) return "state";
  if (/^if\b/i.test(s)) return "unwanted";
  if (/^where\b/i.test(s)) return "optional";
  return "ubiquitous";
}

export function analyzeRequirement(text: string): QaResult {
  const hits: RuleHit[] = [];

  hits.push({ rule: "ShallVoice", ok: SHALL_REGEX.test(text), message: "Use 'shall' for binding requirements." });
  hits.push({ rule: "NoForbiddenModals", ok: !FORBIDDEN_MODALS.test(text), message: "Avoid will/should/may for binding reqs." });
  hits.push({ rule: "NoAndOr", ok: !AND_OR.test(text), message: "Avoid 'and/or'." });
  hits.push({ rule: "SingleVerb", ok: singleVerbLike(text), message: "Prefer one main action." });
  hits.push({ rule: "Length<=35Words", ok: lengthOk(text), message: "Aim for 12–25 words, hard cap 35." });

  const amb = containsAmbiguous(text);
  hits.push({ rule: "AmbiguityBlacklist", ok: amb.length === 0, message: amb.length ? `Ambiguous terms: ${amb.join(", ")}` : undefined });

  // minimal check for verifiability via units/tolerances
  hits.push({ rule: "UnitsPresent", ok: hasUnits(text), message: "Include measurable units/tolerances." });

  // Score = proportion of OKs * 100 minus minor penalties
  const okCount = hits.filter(h => h.ok).length;
  const scoreBase = Math.round((okCount / hits.length) * 100);
  const suggestions: string[] = [];

  if (amb.length) suggestions.push(`Replace ambiguous terms: ${amb.join(", ")}.`);
  if (!SHALL_REGEX.test(text)) suggestions.push("Use 'shall' for binding language.");
  if (FORBIDDEN_MODALS.test(text)) suggestions.push("Remove 'will/should/may/can...' from binding text.");
  if (!hasUnits(text)) suggestions.push("Add measurable criteria with units (e.g., ms, bar, m/s²).");
  if (!lengthOk(text)) suggestions.push("Rewrite to 12–25 words (hard cap 35).");
  if (!singleVerbLike(text)) suggestions.push("Ensure one main action after 'shall'.");

  const pattern = patternDetect(text);
  const verdict: Verdict = scoreBase >= 85 ? "pass" : scoreBase >= 70 ? "warn" : "fail";

  return {
    score: scoreBase,
    hits,
    suggestions,
    verdict: verdict === "pass" ? "Compliant with 29148, EARS:" + pattern : verdict === "warn" ? "Usable with edits" : "Not compliant",
    pattern
  };
}
