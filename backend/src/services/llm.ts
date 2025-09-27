import OpenAI from "openai";
import { analyzeRequirement } from "@airgen/req-qa";
import { config } from "../config.js";
import type { DraftRequest, Draft } from "./drafts.js";

let openAiClient: OpenAI | null = null;

export function isLlmConfigured(): boolean {
  return Boolean(config.llm.provider && config.llm.apiKey);
}

function getOpenAiClient(): OpenAI {
  if (!config.llm.apiKey) {
    throw new Error("OpenAI API key missing (set LLM_API_KEY or OPENAI_API_KEY)");
  }
  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl || undefined
    });
  }
  return openAiClient;
}

function clampCount(count: number | undefined): number {
  return Math.min(Math.max(count ?? 3, 1), config.draftsPerRequestLimit);
}

export async function generateLlmDrafts(request: DraftRequest): Promise<Draft[]> {
  if (!isLlmConfigured()) {
    throw new Error("LLM provider is not configured");
  }

  if (config.llm.provider !== "openai") {
    throw new Error(`Unsupported LLM provider '${config.llm.provider}'`);
  }

  const client = getOpenAiClient();
  const count = clampCount(request.count);

  const prompt = [
    "You are a senior systems requirements engineer.",
    "Author concise, testable requirements using the SHALL form (ISO/IEC/IEEE 29148, EARS).",
    "Return JSON with an array named requirements. Each requirement item must include:",
    "- text: the full requirement",
    "- pattern: one of ubiquitous, event, state, unwanted, optional (infer if unspecified)",
    "- verification: Test, Analysis, Inspection, or Demonstration",
    "- rationale: brief justification",
    "- tags (optional)",
    "Ensure all requirements align with the provided need/context and include measurable criteria."
  ].join(" ");

  const userContext = {
    need: request.need,
    preferredPattern: request.pattern ?? null,
    verification: request.verification ?? null,
    actor: request.actor ?? null,
    system: request.system ?? null,
    trigger: request.trigger ?? null,
    response: request.response ?? null,
    constraint: request.constraint ?? null,
    count
  };

  const completion = await client.chat.completions.create({
    model: config.llm.model,
    temperature: config.llm.temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Context: ${JSON.stringify(userContext)}\nRespond with valid JSON.`
      }
    ]
  });

  const content = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`LLM returned non-JSON payload: ${(error as Error).message}`);
  }

  const requirements = Array.isArray((parsed as Record<string, unknown>).requirements)
    ? ((parsed as Record<string, unknown>).requirements as Array<Record<string, unknown>>)
    : [];

  if (requirements.length === 0) {
    throw new Error("LLM response did not contain any requirements");
  }

  const drafts: Draft[] = [];

  for (const item of requirements.slice(0, count)) {
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    const pattern = (item.pattern as Draft["pattern"]) ?? request.pattern ?? "ubiquitous";
    const verification = (item.verification as Draft["verification"]) ?? request.verification ?? "Test";
    const rationale = String(item.rationale ?? "LLM-generated requirement");
    const qa = analyzeRequirement(text);

    drafts.push({
      text,
      pattern,
      verification,
      qaScore: qa.score,
      qaVerdict: qa.verdict,
      rationale,
      source: "llm"
    });
  }

  if (drafts.length === 0) {
    throw new Error("LLM provided requirements with empty text");
  }

  return drafts;
}
