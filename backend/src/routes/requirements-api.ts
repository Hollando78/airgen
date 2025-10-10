import type { FastifyInstance } from "fastify";
import { z } from "zod";
// Workspace markdown functions removed as part of Neo4j single-source migration (Phase 2)
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
import {
  getBaselineDetails,
  compareBaselines
} from "../services/graph/requirement-baselines.js";
import {
  getRequirementHistory,
  getRequirementDiff
} from "../services/graph/requirements/requirements-versions.js";
import { parsePaginationParams, createPaginatedResponse, getSkipLimit } from "../lib/pagination.js";

const requirementSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentSlug: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  text: z.string().min(10),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  rationale: z.string().optional(),
  complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
  complianceRationale: z.string().optional(),
  qaScore: z.number().int().min(0).max(100).optional(),
  qaVerdict: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
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

    // Markdown read removed - Neo4j single-source migration (Phase 2)
    // Clients should use record.text directly
    return { record, markdown: record.text };
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
          },
          rationale: { type: "string", description: "Rationale for the requirement" },
          complianceStatus: {
            type: "string",
            enum: ["N/A", "Compliant", "Compliance Risk", "Non-Compliant"],
            description: "Compliance status"
          },
          complianceRationale: { type: "string", description: "Compliance rationale" },
          sectionId: { type: "string", description: "Section ID to move the requirement to" }
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
      verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
      rationale: z.string().optional(),
      complianceStatus: z.enum(["N/A", "Compliant", "Compliance Risk", "Non-Compliant"]).optional(),
      complianceRationale: z.string().optional(),
      sectionId: z.string().optional(),
      attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
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
      }
      // Response schema removed - let Fastify infer from actual data
    }
  }, async (req) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const items = await listBaselines(params.tenant, params.project);
    return { items };
  });

  app.get("/baselines/:tenant/:project/:baselineRef", {
    schema: {
      tags: ["baselines"],
      summary: "Get baseline details with version snapshots",
      description: "Retrieves complete baseline snapshot including all version data",
      params: {
        type: "object",
        required: ["tenant", "project", "baselineRef"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          baselineRef: { type: "string", description: "Baseline reference" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            baseline: { type: "object" },
            requirementVersions: { type: "array", items: { type: "object" } },
            documentVersions: { type: "array", items: { type: "object" } },
            documentSectionVersions: { type: "array", items: { type: "object" } },
            infoVersions: { type: "array", items: { type: "object" } },
            surrogateReferenceVersions: { type: "array", items: { type: "object" } },
            traceLinkVersions: { type: "array", items: { type: "object" } },
            linksetVersions: { type: "array", items: { type: "object" } },
            diagramVersions: { type: "array", items: { type: "object" } },
            blockVersions: { type: "array", items: { type: "object" } },
            connectorVersions: { type: "array", items: { type: "object" } }
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
      baselineRef: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      const snapshot = await getBaselineDetails(params.tenant, params.project, params.baselineRef);
      return snapshot;
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/baselines/:tenant/:project/compare", {
    schema: {
      tags: ["baselines"],
      summary: "Compare two baselines",
      description: "Compares two baselines and returns differences across all entity types",
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
        required: ["from", "to"],
        properties: {
          from: { type: "string", description: "Source baseline reference" },
          to: { type: "string", description: "Target baseline reference" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            fromBaseline: { type: "object" },
            toBaseline: { type: "object" },
            requirements: { type: "object" },
            documents: { type: "object" },
            documentSections: { type: "object" },
            infos: { type: "object" },
            surrogateReferences: { type: "object" },
            traceLinks: { type: "object" },
            linksets: { type: "object" },
            diagrams: { type: "object" },
            blocks: { type: "object" },
            connectors: { type: "object" }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
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
      project: z.string().min(1)
    });
    const querySchema = z.object({
      from: z.string().min(1),
      to: z.string().min(1)
    });

    try {
      const params = paramsSchema.parse(req.params);
      const query = querySchema.parse(req.query);

      if (query.from === query.to) {
        return reply.status(400).send({ error: "Source and target baselines must be different" });
      }

      const comparison = await compareBaselines(params.tenant, params.project, query.from, query.to);
      return comparison;
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
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

  app.get("/requirements/:tenant/:project/:id/history", {
    schema: {
      tags: ["requirements"],
      summary: "Get requirement version history",
      description: "Retrieves the complete version history for a requirement",
      params: {
        type: "object",
        required: ["tenant", "project", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            history: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  versionId: { type: "string" },
                  requirementId: { type: "string" },
                  versionNumber: { type: "integer" },
                  timestamp: { type: "string" },
                  changedBy: { type: "string" },
                  changeType: { type: "string", enum: ["created", "updated", "archived", "restored", "deleted"] },
                  changeDescription: { type: "string" },
                  text: { type: "string" },
                  contentHash: { type: "string" }
                }
              }
            }
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
      id: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    try {
      const history = await getRequirementHistory(params.tenant, params.project, params.id);
      return { history };
    } catch (error: any) {
      return reply.status(404).send({ error: error.message || "Requirement not found" });
    }
  });

  app.get("/requirements/:tenant/:project/:id/diff", {
    schema: {
      tags: ["requirements"],
      summary: "Get diff between requirement versions",
      description: "Compares two versions of a requirement and returns field-level differences",
      params: {
        type: "object",
        required: ["tenant", "project", "id"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" }
        }
      },
      querystring: {
        type: "object",
        required: ["from", "to"],
        properties: {
          from: { type: "integer", minimum: 1, description: "Source version number" },
          to: { type: "integer", minimum: 1, description: "Target version number" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            diff: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  oldValue: {},
                  newValue: {},
                  changed: { type: "boolean" }
                }
              }
            }
          }
        },
        400: {
          type: "object",
          properties: {
            error: { type: "string" }
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
      id: z.string().min(1)
    });
    const querySchema = z.object({
      from: z.coerce.number().int().min(1),
      to: z.coerce.number().int().min(1)
    });

    try {
      const params = paramsSchema.parse(req.params);
      const query = querySchema.parse(req.query);

      if (query.from === query.to) {
        return reply.status(400).send({ error: "Source and target versions must be different" });
      }

      const diff = await getRequirementDiff(params.tenant, params.project, params.id, query.from, query.to);
      return { diff };
    } catch (error: any) {
      if (error.message === "Version not found") {
        return reply.status(404).send({ error: "One or both versions not found" });
      }
      return reply.status(400).send({ error: error.message || "Invalid request" });
    }
  });

  app.post("/requirements/:tenant/:project/:id/restore/:versionNumber", {
    schema: {
      tags: ["requirements"],
      summary: "Restore requirement to previous version",
      description: "Restores a requirement to a specific previous version, creating a new version in the history",
      params: {
        type: "object",
        required: ["tenant", "project", "id", "versionNumber"],
        properties: {
          tenant: { type: "string", description: "Tenant slug" },
          project: { type: "string", description: "Project slug" },
          id: { type: "string", description: "Requirement ID" },
          versionNumber: { type: "integer", minimum: 1, description: "Version number to restore" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            requirement: { type: "object" },
            restoredFrom: { type: "integer" }
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
            error: { type: "string" }
          }
        }
      }
    }
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      id: z.string().min(1),
      versionNumber: z.coerce.number().int().min(1)
    });

    try {
      const params = paramsSchema.parse(req.params);

      // Get the version history to find the target version
      const history = await getRequirementHistory(params.tenant, params.project, params.id);
      const targetVersion = history.find(v => v.versionNumber === params.versionNumber);

      if (!targetVersion) {
        return reply.status(404).send({ error: `Version ${params.versionNumber} not found` });
      }

      // Extract user from request (assuming JWT auth middleware adds user to request)
      const userId = (req as any).user?.email || (req as any).user?.sub || "system";

      // Restore by updating with the old version's values
      const requirement = await updateRequirement(
        params.tenant,
        params.project,
        params.id,
        {
          text: targetVersion.text,
          pattern: targetVersion.pattern,
          verification: targetVersion.verification,
          rationale: targetVersion.rationale,
          complianceStatus: targetVersion.complianceStatus as "N/A" | "Compliant" | "Compliance Risk" | "Non-Compliant" | undefined,
          complianceRationale: targetVersion.complianceRationale,
          tags: targetVersion.tags,
          attributes: targetVersion.attributes,
          userId
        }
      );

      if (!requirement) {
        return reply.status(404).send({ error: "Requirement not found" });
      }

      return {
        requirement,
        restoredFrom: params.versionNumber
      };
    } catch (error: any) {
      // Catch-all for unexpected errors
      app.log.error(error);
      return reply.status(500).send({ error: error.message || "Failed to restore version" });
    }
  });
}
