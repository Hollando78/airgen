import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { verifyTenantAccessHook } from "../lib/authorization.js";
import type { FastifyReply } from "fastify";
import {
  getSysmlServiceStatus,
  listSysmlPackages,
  createSysmlPackage,
  updateSysmlPackage,
  deleteSysmlPackage,
  listSysmlElements,
  getSysmlElement,
  createSysmlElement,
  updateSysmlElement,
  deleteSysmlElement,
  createSysmlElementRelationship,
  deleteSysmlElementRelationship,
  listSysmlDiagrams,
  getSysmlDiagram,
  createSysmlDiagram,
  updateSysmlDiagram,
  deleteSysmlDiagram
} from "../services/graph.js";

const tenantProjectParams = z.object({
  tenant: z.string().min(1),
  project: z.string().min(1)
});

const packageKindEnum = z.enum(["model", "view", "library"]);
const elementTypeEnum = z.enum(["block", "interface", "port", "activity", "state", "requirement", "diagram"]);
const diagramTypeEnum = z.enum(["bdd", "ibd", "deployment", "requirements"]);
const blockPayloadSchema = z.object({
  blockKind: z.string().min(1).optional(),
  isAbstract: z.boolean().optional(),
  defaultSize: z.object({
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional()
  }).optional(),
  defaultStyle: z.record(z.string(), z.unknown()).nullable().optional()
});

const interfacePayloadSchema = z.object({
  protocol: z.string().optional(),
  direction: z.enum(["in", "out", "inout", "none"]).optional(),
  rate: z.number().nullable().optional()
});

const portPayloadSchema = z.object({
  direction: z.enum(["in", "out", "inout", "none"]).optional(),
  portType: z.string().optional(),
  conjugated: z.boolean().optional(),
  typeRef: z.string().optional(),
  protocol: z.string().optional(),
  rate: z.number().nullable().optional()
});

const createElementSchema = z.discriminatedUnion("elementType", [
  z.object({
    elementType: z.literal("block"),
    name: z.string().min(1),
    packageId: z.string().min(1).optional(),
    stereotype: z.string().optional(),
    documentation: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    block: blockPayloadSchema
  }),
  z.object({
    elementType: z.literal("interface"),
    name: z.string().min(1),
    packageId: z.string().min(1).optional(),
    stereotype: z.string().optional(),
    documentation: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    interface: interfacePayloadSchema
  }),
  z.object({
    elementType: z.literal("port"),
    name: z.string().min(1),
    packageId: z.string().min(1).optional(),
    stereotype: z.string().optional(),
    documentation: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    port: portPayloadSchema
  })
]);

const updateElementSchema = z.object({
  name: z.string().min(1).optional(),
  stereotype: z.string().nullable().optional(),
  documentation: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  block: blockPayloadSchema.optional(),
  interface: interfacePayloadSchema.optional(),
  port: portPayloadSchema.optional()
}).superRefine((value, ctx) => {
  if (
    value.name === undefined &&
    value.stereotype === undefined &&
    value.documentation === undefined &&
    value.metadata === undefined &&
    value.block === undefined &&
    value.interface === undefined &&
    value.port === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field must be provided for update",
      path: []
    });
  }
});

const relationshipSchema = z.object({
  targetElementId: z.string().min(1),
  type: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
});

const createPackageSchema = z.object({
  name: z.string().min(1),
  packageKind: packageKindEnum,
  parentId: z.string().min(1).optional(),
  defaultViewpoints: z.array(z.string().min(1)).max(16).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
});

const updatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  packageKind: packageKindEnum.optional(),
  defaultViewpoints: z.array(z.string().min(1)).max(16).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
}).refine(
  value => Object.keys(value).length > 0,
  "At least one field must be provided for update."
);

const packagesQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional()
});

const packageIdParams = tenantProjectParams.extend({
  packageId: z.string().min(1)
});

const elementsQuerySchema = z.object({
  elementType: elementTypeEnum.optional(),
  packageId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

const elementIdParams = tenantProjectParams.extend({
  elementId: z.string().min(1)
});

const diagramsQuerySchema = z.object({
  packageId: z.string().min(1).optional(),
  diagramType: diagramTypeEnum.optional(),
  search: z.string().min(1).optional()
});

const diagramIdParams = tenantProjectParams.extend({
  diagramId: z.string().min(1)
});

const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number()
});

const createDiagramSchema = z.object({
  name: z.string().min(1),
  diagramType: diagramTypeEnum.default("bdd"),
  packageId: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  layoutEngine: z.enum(["manual", "dagre", "fcose"]).optional(),
  viewport: viewportSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
});

const updateDiagramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  layoutEngine: z.enum(["manual", "dagre", "fcose"]).nullable().optional(),
  viewport: viewportSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
}).superRefine((value, ctx) => {
  if (
    value.name === undefined &&
    value.description === undefined &&
    value.layoutEngine === undefined &&
    value.viewport === undefined &&
    value.metadata === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field must be provided for update",
      path: []
    });
  }
});

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

function handleSysmlPackageError(reply: FastifyReply, error: unknown): boolean {
  if (!isError(error)) return false;

  if (error.message === "Parent package not found" || error.message === "SysML package not found") {
    reply.status(404).send({ error: error.message });
    return true;
  }

  if (error.message === "No fields provided for update") {
    reply.status(400).send({ error: error.message });
    return true;
  }

  return false;
}

function ensureSysmlEnabled(reply: FastifyReply): boolean {
  if (!config.features.sysmlBetaEnabled) {
    reply.status(404).send({ error: "SysML beta feature disabled." });
    return false;
  }
  return true;
}

function handleSysmlElementError(reply: FastifyReply, error: unknown): boolean {
  if (!isError(error)) return false;

  if (error.message === "SysML element not found") {
    reply.status(404).send({ error: error.message });
    return true;
  }

  return false;
}

function handleSysmlDiagramError(reply: FastifyReply, error: unknown): boolean {
  if (!isError(error)) return false;

  if (error.message === "SysML diagram not found") {
    reply.status(404).send({ error: error.message });
    return true;
  }

  if (error.message === "No fields provided for update") {
    reply.status(400).send({ error: error.message });
    return true;
  }

  return false;
}

export default async function registerSysmlRoutes(app: FastifyInstance): Promise<void> {
  if (!config.features.sysmlBetaEnabled) {
    app.log.debug("SysML routes registered while feature flag is disabled.");
  }

  app.get("/sysml/:tenant/:project/status", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);

    const status = getSysmlServiceStatus();
    return { status };
  });

  app.get("/sysml/:tenant/:project/elements", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const query = elementsQuerySchema.parse(req.query);

    if (!ensureSysmlEnabled(reply)) return;

    const elements = await listSysmlElements({
      tenant: params.tenant,
      projectKey: params.project,
      elementType: query.elementType,
      packageId: query.packageId,
      search: query.search,
      limit: query.limit
    });

    reply.header("x-sysml-implementation", "phase-0");
    return {
      elements,
      meta: {
        implementationPhase: "phase-0",
        message: "SysML element API is in Phase 0 read-only mode.",
        count: elements.length
      }
    };
  });

  app.post("/sysml/:tenant/:project/elements", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const bodyResult = createElementSchema.safeParse(req.body);

    if (!bodyResult.success) {
      return reply.status(400).send({ error: bodyResult.error.issues[0]?.message ?? "Invalid payload" });
    }
    const body = bodyResult.data;

    if (!ensureSysmlEnabled(reply)) return;

    try {
      let element: Awaited<ReturnType<typeof createSysmlElement>>;

      if (body.elementType === "block") {
        element = await createSysmlElement({
          tenant: params.tenant,
          projectKey: params.project,
          elementType: "block",
          name: body.name,
          packageId: body.packageId,
          stereotype: body.stereotype ?? null,
          documentation: body.documentation ?? null,
          metadata: body.metadata ?? null,
          block: body.block
        });
      } else if (body.elementType === "interface") {
        element = await createSysmlElement({
          tenant: params.tenant,
          projectKey: params.project,
          elementType: "interface",
          name: body.name,
          packageId: body.packageId,
          stereotype: body.stereotype ?? null,
          documentation: body.documentation ?? null,
          metadata: body.metadata ?? null,
          interface: {
            protocol: body.interface.protocol ?? null,
            direction: body.interface.direction ?? null,
            rate: body.interface.rate ?? null
          }
        });
      } else if (body.elementType === "port") {
        element = await createSysmlElement({
          tenant: params.tenant,
          projectKey: params.project,
          elementType: "port",
          name: body.name,
          packageId: body.packageId,
          stereotype: body.stereotype ?? null,
          documentation: body.documentation ?? null,
          metadata: body.metadata ?? null,
          port: {
            direction: body.port.direction ?? null,
            portType: body.port.portType ?? null,
            isConjugated: body.port.conjugated ?? null,
            typeRef: body.port.typeRef ?? null,
            protocol: body.port.protocol ?? null,
            rate: body.port.rate ?? null
          }
        });
      } else {
        return reply.status(400).send({ error: `elementType '${(body as { elementType: string }).elementType}' is not supported yet` });
      }

      reply.header("x-sysml-implementation", "phase-0");
      return reply.status(201).send({ element });
    } catch (error) {
      if (handleSysmlPackageError(reply, error)) return;
      if (isError(error) && error.message.startsWith("Unsupported SysML element type")) {
        reply.status(400).send({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.get("/sysml/:tenant/:project/elements/:elementId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = elementIdParams.parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const result = await getSysmlElement({
        tenant: params.tenant,
        projectKey: params.project,
        elementId: params.elementId
      });

      reply.header("x-sysml-implementation", "phase-0");
      return result;
    } catch (error) {
      if (handleSysmlElementError(reply, error)) return;
      throw error;
    }
  });

  app.patch("/sysml/:tenant/:project/elements/:elementId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = elementIdParams.parse(req.params);
    const bodyResult = updateElementSchema.safeParse(req.body);

    if (!bodyResult.success) {
      return reply.status(400).send({ error: bodyResult.error.issues[0]?.message ?? "Invalid payload" });
    }
    const body = bodyResult.data;

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const updated = await updateSysmlElement({
        tenant: params.tenant,
        projectKey: params.project,
        elementId: params.elementId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.stereotype !== undefined ? { stereotype: body.stereotype } : {}),
        ...(body.documentation !== undefined ? { documentation: body.documentation } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
        ...(body.block !== undefined ? { block: body.block ?? null } : {}),
        ...(body.interface !== undefined ? { interface: body.interface ?? null } : {}),
        ...(body.port !== undefined ? {
          port: body.port
            ? {
                direction: body.port.direction ?? null,
                portType: body.port.portType ?? null,
                isConjugated: body.port.conjugated ?? null,
                typeRef: body.port.typeRef ?? null,
                protocol: body.port.protocol ?? null,
                rate: body.port.rate ?? null
              }
            : null
        } : {})
      });

      reply.header("x-sysml-implementation", "phase-0");
      return { element: updated };
    } catch (error) {
      if (handleSysmlElementError(reply, error)) return;
      if (isError(error) && error.message === "No fields provided for update") {
        reply.status(400).send({ error: error.message });
        return;
      }
      if (isError(error) && error.message.startsWith("Unsupported SysML element type")) {
        reply.status(400).send({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.delete("/sysml/:tenant/:project/elements/:elementId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = elementIdParams.parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      await deleteSysmlElement({
        tenant: params.tenant,
        projectKey: params.project,
        elementId: params.elementId
      });
      reply.status(204).send();
    } catch (error) {
      if (handleSysmlElementError(reply, error)) return;
      throw error;
    }
  });

  app.post("/sysml/:tenant/:project/elements/:elementId/relationships", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = elementIdParams.parse(req.params);
    const body = relationshipSchema.parse(req.body);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const relationship = await createSysmlElementRelationship({
        tenant: params.tenant,
        projectKey: params.project,
        sourceElementId: params.elementId,
        targetElementId: body.targetElementId,
        type: body.type,
        metadata: body.metadata ?? null
      });

      reply.header("x-sysml-implementation", "phase-0");
      return reply.status(201).send({ relationship });
    } catch (error) {
      if (handleSysmlElementError(reply, error)) return;
      throw error;
    }
  });

  app.delete("/sysml/:tenant/:project/elements/:elementId/relationships/:relationshipId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = elementIdParams.extend({ relationshipId: z.string().min(1) }).parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      await deleteSysmlElementRelationship({
        tenant: params.tenant,
        projectKey: params.project,
        elementId: params.elementId,
        relationshipId: params.relationshipId
      });

      reply.status(204).send();
    } catch (error) {
      if (handleSysmlElementError(reply, error)) return;
      if (isError(error) && error.message === "SysML relationship not found") {
        reply.status(404).send({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.get("/sysml/:tenant/:project/diagrams", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const query = diagramsQuerySchema.parse(req.query);

    if (!ensureSysmlEnabled(reply)) return;

    const diagrams = await listSysmlDiagrams({
      tenant: params.tenant,
      projectKey: params.project,
      packageId: query.packageId,
      diagramType: query.diagramType,
      search: query.search
    });

    reply.header("x-sysml-implementation", "phase-0");
    return {
      diagrams,
      meta: {
        implementationPhase: "phase-0",
        message: "SysML diagram API is in Phase 0 read-only mode.",
        count: diagrams.length
      }
    };
  });

  app.post("/sysml/:tenant/:project/diagrams", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const body = createDiagramSchema.parse(req.body);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const diagram = await createSysmlDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        name: body.name,
        diagramType: body.diagramType,
        packageId: body.packageId,
        description: body.description ?? null,
        layoutEngine: body.layoutEngine,
        viewport: body.viewport ?? null,
        metadata: body.metadata ?? null
      });

      reply.header("x-sysml-implementation", "phase-0");
      return reply.status(201).send({ diagram });
    } catch (error) {
      if (handleSysmlPackageError(reply, error)) return;
      if (handleSysmlDiagramError(reply, error)) return;
      throw error;
    }
  });

  app.get("/sysml/:tenant/:project/diagrams/:diagramId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = diagramIdParams.parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const diagram = await getSysmlDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        diagramId: params.diagramId
      });

      reply.header("x-sysml-implementation", "phase-0");
      return diagram;
    } catch (error) {
      if (handleSysmlDiagramError(reply, error)) return;
      throw error;
    }
  });

  app.patch("/sysml/:tenant/:project/diagrams/:diagramId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = diagramIdParams.parse(req.params);
    const body = updateDiagramSchema.parse(req.body);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const diagram = await updateSysmlDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        diagramId: params.diagramId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.layoutEngine !== undefined ? { layoutEngine: body.layoutEngine ?? undefined } : {}),
        ...(body.viewport !== undefined ? { viewport: body.viewport ?? null } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata ?? null } : {})
      });

      reply.header("x-sysml-implementation", "phase-0");
      return { diagram };
    } catch (error) {
      if (handleSysmlDiagramError(reply, error)) return;
      throw error;
    }
  });

  app.delete("/sysml/:tenant/:project/diagrams/:diagramId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = diagramIdParams.parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      await deleteSysmlDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        diagramId: params.diagramId
      });

      reply.status(204).send();
    } catch (error) {
      if (handleSysmlDiagramError(reply, error)) return;
      throw error;
    }
  });

  app.get("/sysml/:tenant/:project/packages", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const query = packagesQuerySchema.parse(req.query);

    if (!ensureSysmlEnabled(reply)) return;

    const packages = await listSysmlPackages({
      tenant: params.tenant,
      projectKey: params.project,
      includeArchived: query.includeArchived
    });

    reply.header("x-sysml-implementation", "phase-0");

    return {
      packages,
      meta: {
        implementationPhase: "phase-0",
        message: "SysML packages API is scaffolded; data seeding pending."
      }
    };
  });

  app.post("/sysml/:tenant/:project/packages", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = tenantProjectParams.parse(req.params);
    const body = createPackageSchema.parse(req.body);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const pkg = await createSysmlPackage({
        tenant: params.tenant,
        projectKey: params.project,
        name: body.name,
        packageKind: body.packageKind,
        parentId: body.parentId ?? undefined,
        defaultViewpoints: body.defaultViewpoints,
        metadata: body.metadata ?? null
      });

      reply.header("x-sysml-implementation", "phase-0");
      return reply.status(201).send({ package: pkg });
    } catch (error) {
      if (handleSysmlPackageError(reply, error)) return;
      throw error;
    }
  });

  app.patch("/sysml/:tenant/:project/packages/:packageId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = packageIdParams.parse(req.params);
    const body = updatePackageSchema.parse(req.body);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      const pkg = await updateSysmlPackage({
        tenant: params.tenant,
        projectKey: params.project,
        packageId: params.packageId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.packageKind !== undefined ? { packageKind: body.packageKind } : {}),
        ...(body.defaultViewpoints !== undefined ? { defaultViewpoints: body.defaultViewpoints } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {})
      });

      reply.header("x-sysml-implementation", "phase-0");
      return { package: pkg };
    } catch (error) {
      if (handleSysmlPackageError(reply, error)) return;
      throw error;
    }
  });

  app.delete("/sysml/:tenant/:project/packages/:packageId", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    config: {
      rateLimit: config.rateLimit.sysml
    }
  }, async (req, reply) => {
    const params = packageIdParams.parse(req.params);

    if (!ensureSysmlEnabled(reply)) return;

    try {
      await deleteSysmlPackage({
        tenant: params.tenant,
        projectKey: params.project,
        packageId: params.packageId
      });

      reply.status(204).send();
    } catch (error) {
      if (handleSysmlPackageError(reply, error)) return;
      throw error;
    }
  });
}
