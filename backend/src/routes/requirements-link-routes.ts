/**
 * Requirements Link Suggestion Routes
 *
 * Semantic link suggestions:
 * - Suggest related requirements based on text similarity
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyTenantAccessFromBodyHook } from "../lib/authorization.js";
import { suggestLinks } from "../services/graph.js";

export async function registerLinkRoutes(app: FastifyInstance): Promise<void> {
  // Suggest requirement links
  app.post("/link/suggest", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: {
      tags: ["links"],
      summary: "Suggest requirement links",
      description: "Suggests related requirements based on text similarity",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["tenant", "project", "text"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          text: { type: "string", minLength: 10, description: "Text to find similar requirements" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            suggestions: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req, reply) => {
    const schema = z.object({
      tenant: z.string(),
      project: z.string(),
      text: z.string().min(10)
    });
    const payload = schema.parse(req.body);

    const suggestions = await suggestLinks({
      tenant: payload.tenant,
      projectKey: payload.project,
      text: payload.text,
      limit: 3
    });
    return { suggestions };
  });
}
