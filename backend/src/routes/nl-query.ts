import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyTenantAccessFromBodyHook } from "../lib/authorization.js";
import { config } from "../config.js";
import {
  processNaturalLanguageQuery,
  getExampleQueries,
  type NLQueryRequest
} from "../services/nl-query.js";
import { INPUT_LIMITS } from "../lib/prompt-security.js";

export default async function nlQueryRoutes(app: FastifyInstance) {
  // Rate limiter for NL queries (per-user, hourly limit)
  const nlQueryRateLimitConfig = {
    max: Math.min(config.rateLimit.llm.max, 30), // Max 30 queries per hour
    timeWindow: "1h",
    keyGenerator: (req: any) => {
      // Per-user rate limiting using the authenticated user's ID
      return req.currentUser?.sub || req.ip;
    },
    errorResponseBuilder: () => ({
      error: "Too many natural language queries. Please try again later.",
      statusCode: 429,
      retryAfter: "1 hour"
    })
  };

  const querySchema = z.object({
    tenant: z.string().min(1).max(100),
    projectKey: z.string().min(1).max(100),
    query: z.string().min(5).max(INPUT_LIMITS.USER_INPUT),
    includeExplanation: z.boolean().optional()
  });

  // POST /api/query/natural-language
  // Translate natural language to Cypher and execute query
  app.post(
    "/query/natural-language",
    {
      preHandler: [app.authenticate, verifyTenantAccessFromBodyHook],
      config: {
        rateLimit: nlQueryRateLimitConfig
      }
    },
    async (req, reply) => {
      let body: z.infer<typeof querySchema>;
      try {
        body = querySchema.parse(req.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Invalid request payload",
            issues: error.issues
          });
        }
        throw error;
      }

      try {
        const result = await processNaturalLanguageQuery({
          tenant: body.tenant,
          projectKey: body.projectKey,
          query: body.query,
          includeExplanation: body.includeExplanation
        } as NLQueryRequest);

        return {
          cypherQuery: result.cypherQuery,
          results: result.results,
          resultCount: result.resultCount,
          executionTime: result.executionTime,
          explanation: result.explanation
        };
      } catch (error) {
        req.log.error({ err: error }, "Natural language query processing failed");
        return reply.status(502).send({
          error: "Bad Gateway",
          message: "Failed to process natural language query",
          detail: error instanceof Error ? error.message : undefined
        });
      }
    }
  );

  // GET /api/query/examples
  // Get example queries for the UI
  app.get(
    "/query/examples",
    { preHandler: [app.authenticate] },
    async (_req, reply) => {
      try {
        const examples = getExampleQueries();
        return { examples };
      } catch (error) {
        return reply.status(500).send({
          error: "Internal Server Error",
          message: "Failed to fetch example queries"
        });
      }
    }
  );
}
