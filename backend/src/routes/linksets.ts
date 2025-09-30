import type { FastifyInstance } from "fastify";
import { 
  createLinkset, 
  listLinksets, 
  getLinkset, 
  addLinkToLinkset, 
  removeLinkFromLinkset, 
  deleteLinkset,
  type DocumentLinksetRecord,
  type TraceLinkItem
} from "../services/graph/linksets.js";

export async function linksetRoutes(fastify: FastifyInstance) {
  // List all linksets for a project
  fastify.get<{
    Params: { tenant: string; project: string };
  }>("/linksets/:tenant/:project", {
    schema: {
      tags: ["linksets"],
      summary: "List all linksets for a project",
      description: "Retrieves all document linksets for a project",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            linksets: { type: "array", items: { type: "object" } }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project } = request.params;
      const linksets = await listLinksets({ tenant, projectKey: project });

      return reply.send({ linksets });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to list linksets",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get a specific linkset between two documents
  fastify.get<{
    Params: {
      tenant: string;
      project: string;
      sourceDoc: string;
      targetDoc: string;
    };
  }>("/linksets/:tenant/:project/:sourceDoc/:targetDoc", {
    schema: {
      tags: ["linksets"],
      summary: "Get a specific linkset",
      description: "Retrieves a linkset between two documents",
      params: {
        type: "object",
        required: ["tenant", "project", "sourceDoc", "targetDoc"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          sourceDoc: { type: "string", description: "Source document slug" },
          targetDoc: { type: "string", description: "Target document slug" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            linkset: { type: "object" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project, sourceDoc, targetDoc } = request.params;
      const linkset = await getLinkset({
        tenant,
        projectKey: project,
        sourceDocumentSlug: sourceDoc,
        targetDocumentSlug: targetDoc
      });

      if (!linkset) {
        return reply.status(404).send({ error: "Linkset not found" });
      }

      return reply.send({ linkset });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to get linkset",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Create a new linkset
  fastify.post<{
    Params: { tenant: string; project: string };
    Body: {
      sourceDocumentSlug: string;
      targetDocumentSlug: string;
      links?: TraceLinkItem[];
    };
  }>("/linksets/:tenant/:project", {
    schema: {
      tags: ["linksets"],
      summary: "Create a new linkset",
      description: "Creates a new linkset between two documents",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      },
      body: {
        type: "object",
        required: ["sourceDocumentSlug", "targetDocumentSlug"],
        properties: {
          sourceDocumentSlug: { type: "string", description: "Source document slug" },
          targetDocumentSlug: { type: "string", description: "Target document slug" },
          links: {
            type: "array",
            items: { type: "object" },
            description: "Initial links to add to the linkset"
          }
        }
      },
      response: {
        201: {
          type: "object",
          properties: {
            linkset: { type: "object" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project } = request.params;
      const { sourceDocumentSlug, targetDocumentSlug, links } = request.body;

      const linkset = await createLinkset({
        tenant,
        projectKey: project,
        sourceDocumentSlug,
        targetDocumentSlug,
        links
      });

      return reply.status(201).send({ linkset });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to create linkset",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add a link to an existing linkset
  fastify.post<{
    Params: {
      tenant: string;
      project: string;
      linksetId: string;
    };
    Body: {
      sourceRequirementId: string;
      targetRequirementId: string;
      linkType: TraceLinkItem["linkType"];
      description?: string;
    };
  }>("/linksets/:tenant/:project/:linksetId/links", {
    schema: {
      tags: ["linksets"],
      summary: "Add a link to a linkset",
      description: "Adds a traceability link to an existing linkset",
      params: {
        type: "object",
        required: ["tenant", "project", "linksetId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          linksetId: { type: "string", description: "Linkset ID" }
        }
      },
      body: {
        type: "object",
        required: ["sourceRequirementId", "targetRequirementId", "linkType"],
        properties: {
          sourceRequirementId: { type: "string", description: "Source requirement ID" },
          targetRequirementId: { type: "string", description: "Target requirement ID" },
          linkType: {
            type: "string",
            enum: ["satisfies", "derives", "verifies", "implements", "refines", "conflicts"],
            description: "Type of trace link"
          },
          description: { type: "string", description: "Optional description" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            linkset: { type: "object" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project, linksetId } = request.params;
      const { sourceRequirementId, targetRequirementId, linkType, description } = request.body;

      const linkset = await addLinkToLinkset({
        tenant,
        projectKey: project,
        linksetId,
        sourceRequirementId,
        targetRequirementId,
        linkType,
        description
      });

      return reply.send({ linkset });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to add link to linkset",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Remove a link from a linkset
  fastify.delete<{
    Params: {
      tenant: string;
      project: string;
      linksetId: string;
      linkId: string;
    };
  }>("/linksets/:tenant/:project/:linksetId/links/:linkId", {
    schema: {
      tags: ["linksets"],
      summary: "Remove a link from a linkset",
      description: "Removes a traceability link from a linkset",
      params: {
        type: "object",
        required: ["tenant", "project", "linksetId", "linkId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          linksetId: { type: "string", description: "Linkset ID" },
          linkId: { type: "string", description: "Link ID to remove" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            linkset: { type: "object" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project, linksetId, linkId } = request.params;

      const linkset = await removeLinkFromLinkset({
        tenant,
        projectKey: project,
        linksetId,
        linkId
      });

      return reply.send({ linkset });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to remove link from linkset",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete an entire linkset
  fastify.delete<{
    Params: {
      tenant: string;
      project: string;
      linksetId: string;
    };
  }>("/linksets/:tenant/:project/:linksetId", {
    schema: {
      tags: ["linksets"],
      summary: "Delete a linkset",
      description: "Deletes an entire linkset and all its links",
      params: {
        type: "object",
        required: ["tenant", "project", "linksetId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          linksetId: { type: "string", description: "Linkset ID to delete" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            success: { type: "boolean" }
          }
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { tenant, project, linksetId } = request.params;

      await deleteLinkset({
        tenant,
        projectKey: project,
        linksetId
      });

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: "Failed to delete linkset",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}