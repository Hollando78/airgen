import type { FastifyInstance } from "fastify";
import { analyzeRequirement, AMBIGUOUS } from "@airgen/req-qa";
import { generateDrafts } from "../services/drafts.js";
import { generateLlmDrafts, isLlmConfigured } from "../services/llm.js";
import { getErrorMessage } from "../lib/type-guards.js";
import {
  qaAnalysisSchema,
  draftGenerationSchema,
  applyFixSchema
} from "../validation/core-routes.schemas.js";
import {
  qaAnalysisRequestSchema,
  qaAnalysisResponseSchema,
  draftGenerationRequestSchema,
  draftGenerationResponseSchema,
  applyFixRequestSchema,
  applyFixResponseSchema
} from "../schemas/core-api.schemas.js";

/**
 * Requirement quality analysis routes
 *
 * Extracted from routes/core.ts for better organization
 */
export default async function registerRequirementQualityRoutes(app: FastifyInstance): Promise<void> {
  // Analyze requirement quality
  app.post("/qa", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["quality"],
      summary: "Analyze requirement quality",
      description: "Performs quality analysis on requirement text using @airgen/req-qa",
      security: [{ bearerAuth: [] }],
      body: qaAnalysisRequestSchema,
      response: {
        200: qaAnalysisResponseSchema
      }
    }
  }, async (req) => {
    const body = qaAnalysisSchema.parse(req.body);
    return analyzeRequirement(body.text);
  });

  // Generate requirement drafts
  app.post("/draft", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["quality"],
      summary: "Generate requirement drafts",
      description: "Generates requirement drafts using heuristics and optionally LLM",
      security: [{ bearerAuth: [] }],
      body: draftGenerationRequestSchema,
      response: {
        200: draftGenerationResponseSchema
      }
    }
  }, async (req) => {
    const body = draftGenerationSchema.parse(req.body);
    const heuristicDrafts = generateDrafts(body);
    let llmDrafts: typeof heuristicDrafts = [];
    let llmError: string | undefined;

    if (body.useLlm) {
      if (!isLlmConfigured()) {
        llmError = "LLM provider not configured";
      } else {
        try {
          llmDrafts = await generateLlmDrafts(body);
        } catch (error) {
          llmError = getErrorMessage(error);
          app.log.error({ err: error }, "LLM draft generation failed");
        }
      }
    }

    return {
      items: [...llmDrafts, ...heuristicDrafts],
      meta: {
        heuristics: heuristicDrafts.length,
        llm: {
          requested: Boolean(body.useLlm),
          provided: llmDrafts.length,
          error: llmError
        }
      }
    };
  });

  // Apply automatic fixes to requirement
  app.post("/apply-fix", {
    preHandler: [app.authenticate],
    schema: {
      tags: ["quality"],
      summary: "Apply quality fixes to requirement",
      description: "Applies automatic fixes to improve requirement quality based on QA analysis",
      security: [{ bearerAuth: [] }],
      body: applyFixRequestSchema,
      response: {
        200: applyFixResponseSchema
      }
    }
  }, async (req) => {
    const { text } = applyFixSchema.parse(req.body);
    const lower = text.toLowerCase();
    const hits = AMBIGUOUS.filter(word => lower.includes(word));
    let replacement = text;
    const notes: string[] = [];

    if (hits.length) {
      for (const word of hits) {
        const pattern = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "gi");
        replacement = replacement.replace(pattern, `${word.toUpperCase()} [DEFINE]`);
        notes.push(`Flagged ambiguous phrase '${word}'.`);
      }
    }

    if (!/\bshall\b/i.test(replacement)) {
      replacement = replacement.replace(/\b(will|should|may|can)\b/i, "shall");
      notes.push("Replaced weak modal with 'shall'.");
    }

    if (!/\b(ms|s|kg|m|bar|v|a|hz|%)\b/i.test(replacement)) {
      notes.push("Consider adding measurable units (e.g. ms, bar, %).");
    }

    return { before: text, after: replacement, notes };
  });
}
