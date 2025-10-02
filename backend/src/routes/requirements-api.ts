import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  readRequirementMarkdown,
  writeRequirementMarkdown
} from "../services/workspace.js";
import {
  createRequirement,
  listRequirements,
  countRequirements,
  getRequirement,
  updateRequirement,
  softDeleteRequirement,
  archiveRequirements,
  unarchiveRequirements,
  findDuplicateRequirementRefs,
  fixDuplicateRequirementRefs,
  createBaseline,
  listBaselines,
  suggestLinks
} from "../services/graph.js";
import { parsePaginationParams, createPaginatedResponse, getSkipLimit } from "../lib/pagination.js";

const requirementSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  text: z.string().min(10),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  qaScore: z.number().int().min(0).max(100).optional(),
  qaVerdict: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

const baselineSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  label: z.string().min(1).optional(),
  author: z.string().min(1).optional()
});

export default async function registerRequirementRoutes(app: FastifyInstance): Promise<void> {
  app.post("/requirements", {
    schema: {
      tags: ["requirements"],
      summary: "Create a new requirement",
      description: "Creates a new requirement and writes it to markdown file",
      body: {
        type: "object",
        required: ["tenant", "projectKey", "text"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          documentSlug: { type: "string", minLength: 1, description: "Document slug" },
          sectionId: { type: "string", minLength: 1, description: "Section identifier" },
          text: { type: "string", minLength: 10, description: "Requirement text" },
          pattern: {
            type: "string",
            enum: ["ubiquitous", "event", "state", "unwanted", "optional"],
            description: "Requirement pattern"
          },
          verification: {
            type: "string",
            enum: ["Test", "Analysis", "Inspection", "Demonstration"],
            description: "Verification method"
          },
          qaScore: { type: "integer", minimum: 0, maximum: 100, description: "Quality score" },
          qaVerdict: { type: "string", description: "Quality verdict" },
          suggestions: { type: "array", items: { type: "string" }, description: "QA suggestions" },
          tags: { type: "array", items: { type: "string" }, description: "Requirement tags" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" }
          }
        }
      }
    }
  }, async (req) => {
    const payload = requirementSchema.parse(req.body);
    const record = await createRequirement({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      documentSlug: payload.documentSlug,
      sectionId: payload.sectionId,
      text: payload.text,
      pattern: payload.pattern,
      verification: payload.verification,
      qaScore: payload.qaScore,
      qaVerdict: payload.qaVerdict,
      suggestions: payload.suggestions,
      tags: payload.tags
    });

    await writeRequirementMarkdown(record);

    return { requirement: record };
  });

  app.get("/requirements/:tenant/:project", {
    schema: {
      tags: ["requirements"],
      summary: "List requirements for a project",
      description: "Retrieves paginated list of requirements with optional sorting",
      params: {
        type: "object",
        required: ["tenant", "project"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" }
        }
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1, description: "Page number" },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Items per page" },
          sortBy: { type: "string", enum: ["createdAt", "ref", "qaScore"], description: "Field to sort by" },
          sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc", description: "Sort direction" }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const pagination = parsePaginationParams(req.query);

    const { skip, limit } = getSkipLimit(pagination.page, pagination.limit);
    const orderBy = (pagination.sortBy as "createdAt" | "ref" | "qaScore" | undefined) ?? "ref";
    const orderDirection = pagination.sortBy
      ? (pagination.sortOrder === "asc" ? "ASC" : "DESC")
      : "ASC";

    const [items, total] = await Promise.all([
      listRequirements(params.tenant, params.project, {
        limit,
        offset: skip,
        orderBy,
        orderDirection
      }),
      countRequirements(params.tenant, params.project)
    ]);

    return createPaginatedResponse(items, total, pagination);
  });

  app.get("/requirements/:tenant/:project/:ref", {
    schema: {
      tags: ["requirements"],
      summary: "Get a specific requirement",
      description: "Retrieves a requirement by reference with markdown content",
      params: {
        type: "object",
        required: ["tenant", "project", "ref"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          ref: { type: "string", description: "Requirement reference" }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      ref: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);
    const record = await getRequirement(params.tenant, params.project, params.ref);
    if (!record) {return reply.status(404).send({ error: "Requirement not found" });}
    let markdown: string;
    try {
      markdown = await readRequirementMarkdown({
        tenant: record.tenant,
        projectKey: record.projectKey,
        ref: record.ref
      });
    } catch (error) {
      markdown = record.text;
      (app.log as any).info?.({ err: error, ref: record.ref }, "Markdown file missing; returning raw text");
    }

    return { record, markdown };
  });

  app.patch("/requirements/:tenant/:project/:requirementId", {
    schema: {
      tags: ["requirements"],
      summary: "Update a requirement",
      description: "Updates requirement text, pattern, or verification method",
      params: {
        type: "object",
        required: ["tenant", "project", "requirementId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          requirementId: { type: "string", description: "Requirement ID" }
        }
      },
      body: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 10, description: "Requirement text" },
          pattern: {
            type: "string",
            enum: ["ubiquitous", "event", "state", "unwanted", "optional"],
            description: "Requirement pattern"
          },
          verification: {
            type: "string",
            enum: ["Test", "Analysis", "Inspection", "Demonstration"],
            description: "Verification method"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      requirementId: z.string().min(1)
    });
    const bodySchema = z.object({
      text: z.string().min(10).optional(),
      pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const requirement = await updateRequirement(params.tenant, params.project, params.requirementId, body);
    if (!requirement) {return reply.status(404).send({ error: "Requirement not found" });}
    return { requirement };
  });

  app.delete("/requirements/:tenant/:project/:requirementId", {
    schema: {
      tags: ["requirements"],
      summary: "Delete a requirement",
      description: "Soft deletes a requirement (marks as deleted)",
      params: {
        type: "object",
        required: ["tenant", "project", "requirementId"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          requirementId: { type: "string", description: "Requirement ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" }
          }
        },
        404: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      requirementId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const requirement = await softDeleteRequirement(params.tenant, params.project, params.requirementId);
    if (!requirement) {return reply.status(404).send({ error: "Requirement not found" });}
    return { requirement };
  });

  app.post("/requirements/:tenant/:project/archive", {
    schema: {
      tags: ["requirements"],
      summary: "Archive requirements",
      description: "Archives one or more requirements (hides from default view)",
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
        required: ["requirementIds"],
        properties: {
          requirementIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Array of requirement IDs to archive"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirements: { type: "array", items: { type: "object" } },
            count: { type: "integer" }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const bodySchema = z.object({
      requirementIds: z.array(z.string().min(1)).min(1)
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const requirements = await archiveRequirements(params.tenant, params.project, body.requirementIds);
    return { requirements, count: requirements.length };
  });

  app.post("/requirements/:tenant/:project/unarchive", {
    schema: {
      tags: ["requirements"],
      summary: "Unarchive requirements",
      description: "Unarchives one or more requirements (shows in default view)",
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
        required: ["requirementIds"],
        properties: {
          requirementIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Array of requirement IDs to unarchive"
          }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirements: { type: "array", items: { type: "object" } },
            count: { type: "integer" }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const bodySchema = z.object({
      requirementIds: z.array(z.string().min(1)).min(1)
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    const requirements = await unarchiveRequirements(params.tenant, params.project, body.requirementIds);
    return { requirements, count: requirements.length };
  });

  app.get("/requirements/:tenant/:project/duplicates", {
    schema: {
      tags: ["requirements"],
      summary: "Find duplicate requirement references",
      description: "Identifies requirements with duplicate reference identifiers",
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
            duplicates: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const duplicates = await findDuplicateRequirementRefs(params.tenant, params.project);
    return { duplicates };
  });

  app.post("/requirements/:tenant/:project/fix-duplicates", {
    schema: {
      tags: ["requirements"],
      summary: "Fix duplicate requirement references",
      description: "Automatically renumbers duplicate requirement references",
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
            fixed: { type: "integer" },
            results: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    const result = await fixDuplicateRequirementRefs(params.tenant, params.project);
    return result;
  });

  app.post("/baseline", {
    schema: {
      tags: ["baselines"],
      summary: "Create a new baseline",
      description: "Creates a snapshot baseline of current requirements",
      body: {
        type: "object",
        required: ["tenant", "projectKey"],
        properties: {
          tenant: { type: "string", minLength: 1, description: "Tenant slug" },
          projectKey: { type: "string", minLength: 1, description: "Project key" },
          label: { type: "string", minLength: 1, description: "Baseline label" },
          author: { type: "string", minLength: 1, description: "Baseline author" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            baseline: { type: "object" }
          }
        }
      }
    }
  }, async (req) => {
    const payload = baselineSchema.parse(req.body);
    const record = await createBaseline({
      tenant: payload.tenant,
      projectKey: payload.projectKey,
      label: payload.label,
      author: payload.author
    });
    return { baseline: record };
  });

  app.get("/baselines/:tenant/:project", {
    schema: {
      tags: ["baselines"],
      summary: "List baselines for a project",
      description: "Retrieves all baselines for a project",
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
            items: { type: "array", items: { type: "object" } }
          }
        }
      }
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const items = await listBaselines(params.tenant, params.project);
    return { items };
  });

  app.post("/link/suggest", {
    schema: {
      tags: ["links"],
      summary: "Suggest requirement links",
      description: "Suggests related requirements based on text similarity",
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
  }, async (req) => {
    const schema = z.object({ tenant: z.string(), project: z.string(), text: z.string().min(10) });
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
