import { openai, model } from "../lib/openai.js";

export type DraftRequest = {
  user_input: string; // stakeholder need / instruction
  glossary?: string; // optional glossary text
  constraints?: string; // optional constraints
  n?: number; // number of candidates (default 5, max 10)
};

export async function draftCandidates(req: DraftRequest): Promise<string[]> {
  if (!openai) {
    throw new Error("OpenAI client not configured. Please set LLM_API_KEY environment variable.");
  }

  const n = Math.min(Math.max(req.n ?? 5, 1), 10);

  const sys = [
    "You are a systems requirements engineer.",
    "Write binding requirements using SHALL, following ISO/IEC/IEEE 29148 and EARS patterns.",
    "Avoid ambiguous terms (fast, user-friendly, optimal, adequate, etc.).",
    "Include measurable criteria and units where applicable.",
    "Return ONLY a JSON object with this shape:",
    '{ "candidates": ["<req1>", "<req2>", ...] }',
    "No markdown fencing, no preface, no comments—just JSON."
  ].join("\n");

  const content = [
    `USER_INPUT:\n${req.user_input}`,
    req.glossary ? `GLOSSARY:\n${req.glossary}` : "",
    req.constraints ? `CONSTRAINTS:\n${req.constraints}` : "",
    `COUNT: ${n}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content }
    ],
    temperature: 0.2
  });

  const text = completion.choices[0]?.message?.content ?? "{}";

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to salvage JSON if the model adds extra prose around it.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        /* noop */
      }
    }
  }

  const arr = Array.isArray((parsed as { candidates?: unknown }).candidates)
    ? (parsed as { candidates: unknown[] }).candidates
    : [];

  const candidates = arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  if (!candidates.length) {
    throw new Error("Failed to parse candidate requirements from model response.");
  }

  return candidates;
}
