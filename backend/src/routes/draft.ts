import { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeRequirement } from "@airgen/req-qa";
import { draftCandidates } from "../services/drafting.js";

export default async function draftRoutes(app: FastifyInstance) {
  app.post("/draft/candidates", async (req, reply) => {
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
