import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement } from "@airgen/req-qa";
import { draftCandidates } from "../services/drafting.js";

export default async function draftRoutes(app: FastifyInstance) {
  app.post("/draft/candidates", {
    schema: {
      tags: ["draft"],
      summary: "Generate requirement draft candidates",
      description: "Uses heuristics and LLM to generate draft requirements from natural language input",
      body: {
        type: "object",
        required: ["user_input"],
        properties: {
          user_input: { type: "string", minLength: 1, description: "Natural language description of the requirement need" },
          glossary: { type: "string", description: "Optional glossary or domain terms to guide generation" },
          constraints: { type: "string", description: "Optional constraints or context" },
          n: { type: "integer", minimum: 1, maximum: 10, description: "Number of candidates to generate (default: 5)" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            count: { type: "integer" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  qa: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      verdict: { type: "string" },
                      hits: { type: "array" },
                      suggestions: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (req, reply) => {
    const schema = z.object({
      user_input: z.string().min(1),
      glossary: z.string().optional(),
      constraints: z.string().optional(),
      n: z.number().int().min(1).max(10).optional()
    });

    const body = schema.parse(req.body);

    let candidates: string[];
    try {
      candidates = await draftCandidates(body);
    } catch (error) {
      req.log.error({ err: error }, "draftCandidates failed");
      return reply.status(502).send({
        error: "Bad Gateway",
        message: "Failed to draft requirement candidates.",
        detail: error instanceof Error ? error.message : undefined
      });
    }

    const analyzed = candidates.map((text) => {
      const qa = analyzeRequirement(text);
      return { text, qa };
    });

    return { count: analyzed.length, items: analyzed };
  });
}
