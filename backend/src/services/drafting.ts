import { promises as fs } from "node:fs";
import { openai, model } from "../lib/openai.js";
import {
  sanitizeDraftingInputs,
  wrapUserInput,
  detectSuspiciousOutput,
  buildSecureSystemPrompt
} from "../lib/prompt-security.js";

export type DraftRequest = {
  user_input: string; // stakeholder need / instruction
  glossary?: string; // optional glossary text
  constraints?: string; // optional constraints
  n?: number; // number of candidates (default 5, max 10)
  documentContext?: string; // additional context from attached documents
  imageAttachments?: Array<{ documentName: string; filePath: string; mimeType: string }>; // attached images for vision analysis
};

export async function draftCandidates(req: DraftRequest): Promise<string[]> {
  if (!openai) {
    throw new Error("OpenAI client not configured. Please set LLM_API_KEY environment variable.");
  }

  // Sanitize and validate all inputs
  const sanitized = sanitizeDraftingInputs(req);
  const n = sanitized.n;

  const sys = buildSecureSystemPrompt("systems requirements engineer", [
    "Write binding requirements using SHALL, following ISO/IEC/IEEE 29148 and EARS patterns.",
    "Avoid ambiguous terms (fast, user-friendly, optimal, adequate, etc.).",
    "Include measurable criteria and units where applicable.",
    "When DOCUMENT_CONTEXT is provided, use it as reference material to ensure consistency",
    "and alignment with existing requirements and specifications.",
    "When diagram context is provided, generate architecture-aware requirements that consider",
    "component interactions, interfaces, data flows, and system boundaries shown in the diagrams.",
    "When images are provided, analyze the visual content (diagrams, visualizations, screenshots) to",
    "extract technical requirements based on what is shown in the images.",
    "IMPORTANT: Generate exactly the number of candidate requirements specified in the <COUNT> tag.",
    "For example, if <COUNT>3</COUNT> is provided, generate exactly 3 requirements.",
    "Return ONLY a JSON object with this shape:",
    '{ "candidates": ["<req1>", "<req2>", ...] }',
    "No markdown fencing, no preface, no comments—just JSON."
  ]);

  // Build content with secure delimiters
  const contentParts = [
    wrapUserInput(sanitized.user_input, "USER_INPUT"),
    sanitized.documentContext ? wrapUserInput(sanitized.documentContext, "DOCUMENT_CONTEXT") : "",
    sanitized.glossary ? wrapUserInput(sanitized.glossary, "GLOSSARY") : "",
    sanitized.constraints ? wrapUserInput(sanitized.constraints, "CONSTRAINTS") : "",
    `<COUNT>${n}</COUNT>`
  ];

  const textContent = contentParts.filter(Boolean).join("\n\n");

  // Build multimodal message content if images are present
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } };

  let userContent: string | ContentPart[];

  if (req.imageAttachments && req.imageAttachments.length > 0) {
    // Read images and convert to base64 data URLs
    const imagePromises = req.imageAttachments.map(async (img) => {
      const imageBuffer = await fs.readFile(img.filePath);
      const base64 = imageBuffer.toString('base64');
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${img.mimeType};base64,${base64}`,
          detail: "high" as const
        }
      };
    });

    const imageParts = await Promise.all(imagePromises);

    userContent = [
      { type: "text" as const, text: textContent },
      ...imageParts
    ];
  } else {
    userContent = textContent;
  }

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userContent }
    ],
    temperature: 0.2
  });

  const text = completion.choices[0]?.message?.content ?? "{}";

  // Detect suspicious output that may indicate successful prompt injection
  if (detectSuspiciousOutput(text)) {
    throw new Error("LLM response validation failed. Please rephrase your request.");
  }

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
