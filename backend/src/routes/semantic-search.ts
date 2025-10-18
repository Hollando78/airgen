import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  findSimilarRequirements,
  searchRequirementsByQuery,
  findPotentialDuplicates
} from "../services/graph/requirements/semantic-search.js";

const semanticSearchRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/requirements/:tenant/:project/:id/similar
  const similarParamsSchema = z.object({
    tenant: z.string(),
    project: z.string(),
    id: z.string()
  });
  const similarQuerySchema = z.object({
    minSimilarity: z.string().optional(),
    limit: z.string().optional()
  }).partial();

  fastify.get<{
    Params: z.infer<typeof similarParamsSchema>;
    Querystring: z.infer<typeof similarQuerySchema>;
  }>(
    '/requirements/:tenant/:project/:id/similar',
    async (request, reply) => {
      const { tenant, project, id } = similarParamsSchema.parse(request.params);
      const query = similarQuerySchema.parse(request.query ?? {});
      const minSimilarity = query.minSimilarity
        ? parseFloat(query.minSimilarity)
        : undefined;
      const limit = query.limit
        ? parseInt(query.limit, 10)
        : undefined;

      const similar = await findSimilarRequirements(tenant, project, id, {
        minSimilarity,
        limit
      });

      return reply.send({ similar });
    }
  );

  // POST /api/requirements/search/semantic
  const semanticSearchBodySchema = z.object({
    tenant: z.string(),
    project: z.string(),
    query: z.string().min(1),
    minSimilarity: z.number().min(0).max(1).optional(),
    limit: z.number().int().min(1).max(100).optional()
  });

  fastify.post<{
    Body: z.infer<typeof semanticSearchBodySchema>;
  }>(
    '/requirements/search/semantic',
    async (request, reply) => {
      const { tenant, project, query, minSimilarity, limit } = semanticSearchBodySchema.parse(request.body);

      const results = await searchRequirementsByQuery(tenant, project, query, {
        minSimilarity,
        limit
      });

      return reply.send({ results });
    }
  );

  // GET /api/requirements/:tenant/:project/:id/duplicates
  const duplicatesParamsSchema = similarParamsSchema;

  fastify.get<{
    Params: z.infer<typeof duplicatesParamsSchema>;
  }>(
    '/requirements/:tenant/:project/:id/duplicates',
    async (request, reply) => {
      const { tenant, project, id } = duplicatesParamsSchema.parse(request.params);

      const duplicates = await findPotentialDuplicates(tenant, project, id);

      return reply.send({ duplicates });
    }
  );
};

export default semanticSearchRoutes;
