import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createArchitectureBlock,
  getArchitectureBlocks,
  getArchitectureBlockLibrary,
  updateArchitectureBlock,
  deleteArchitectureBlock,
  createArchitectureConnector,
  getArchitectureConnectors,
  updateArchitectureConnector,
  deleteArchitectureConnector,
  createArchitectureDiagram,
  getArchitectureDiagrams,
  updateArchitectureDiagram,
  deleteArchitectureDiagram,
  createPackage,
  getPackages,
  updatePackage,
  moveToPackage,
  reorderInPackage,
  deletePackage
} from "../services/graph.js";
import { requireTenantAccess, type AuthUser } from "../lib/authorization.js";

const portOverrideSchema = z.object({
  edge: z.enum(["top", "right", "bottom", "left"]).optional(),
  offset: z.number().min(0).max(100).nullable().optional(),
  hidden: z.boolean().nullable().optional(),
  showLabel: z.boolean().nullable().optional(),
  labelOffsetX: z.number().nullable().optional(),
  labelOffsetY: z.number().nullable().optional()
});

const architectureBlockSchema = z
  .object({
    tenant: z.string().min(1),
    projectKey: z.string().min(1),
    diagramId: z.string().min(1),
    positionX: z.number(),
    positionY: z.number(),
    sizeWidth: z.number().optional(),
    sizeHeight: z.number().optional(),
    name: z.string().min(1).optional(),
    kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"]).optional(),
    stereotype: z.string().optional(),
    description: z.string().optional(),
    ports: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          direction: z.enum(["in", "out", "inout", "none"])
        })
      )
      .optional(),
    documentIds: z.array(z.string()).optional(),
    existingBlockId: z.string().optional()
  })
  .refine(
    (value) => Boolean(value.existingBlockId) || (Boolean(value.name) && Boolean(value.kind)),
    "name and kind are required when creating a new block"
  );

const architectureConnectorSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(["association", "flow", "dependency", "composition"]),
  label: z.string().optional(),
  sourcePortId: z.string().optional(),
  targetPortId: z.string().optional(),
  diagramId: z.string().min(1),
  documentIds: z.array(z.string()).optional(),
  // Styling properties
  lineStyle: z.enum(["straight", "smoothstep", "step", "bezier"]).optional(),
  markerStart: z.enum(["arrow", "arrowclosed", "none"]).optional(),
  markerEnd: z.enum(["arrow", "arrowclosed", "none"]).optional(),
  linePattern: z.enum(["solid", "dashed", "dotted"]).optional(),
  color: z.string().optional(),
  strokeWidth: z.number().min(1).max(10).optional(),
  labelOffsetX: z.number().optional(),
  labelOffsetY: z.number().optional(),
  controlPoints: z
    .array(
      z.object({
        x: z.number(),
        y: z.number()
      })
    )
    .max(16)
    .optional()
});

const architectureDiagramSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  view: z.enum(["block", "internal", "deployment", "requirements_schema"]).optional()
});

export default async function registerArchitectureRoutes(app: FastifyInstance): Promise<void> {
  app.post("/architecture/diagrams", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const payload = architectureDiagramSchema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    try {
      const diagram = await createArchitectureDiagram({
        ...payload,
        userId: req.currentUser!.sub
      });
      return { diagram };
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return reply.status(404).send({ error: (error as Error).message });
      }
      throw error;
    }
  });

  app.get("/architecture/diagrams/:tenant/:project", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const diagrams = await getArchitectureDiagrams({ tenant: params.tenant, projectKey: params.project });
    return { diagrams };
  });

  app.get("/architecture/block-library/:tenant/:project", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const blocks = await getArchitectureBlockLibrary({ tenant: params.tenant, projectKey: params.project });
    return { blocks };
  });

  app.patch("/architecture/diagrams/:tenant/:project/:diagramId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      diagramId: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      view: z.enum(["block", "internal", "deployment", "requirements_schema"]).optional()
    });

    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const diagram = await updateArchitectureDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        diagramId: params.diagramId,
        ...body,
        userId: req.currentUser!.sub
      });
      return { diagram };
    } catch (error) {
      if ((error as Error).message === "Architecture diagram not found") {
        return reply.status(404).send({ error: "Architecture diagram not found" });
      }
      throw error;
    }
  });

  app.delete("/architecture/diagrams/:tenant/:project/:diagramId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      diagramId: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      await deleteArchitectureDiagram({
        tenant: params.tenant,
        projectKey: params.project,
        diagramId: params.diagramId,
        userId: req.currentUser!.sub
      });
      return { success: true };
    } catch (error) {
      if ((error as Error).message === "Architecture diagram not found") {
        return reply.status(404).send({ error: "Architecture diagram not found" });
      }
      throw error;
    }
  });

  app.post("/architecture/blocks", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const payload = architectureBlockSchema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    try {
      const block = await createArchitectureBlock({
        tenant: payload.tenant,
        projectKey: payload.projectKey,
        diagramId: payload.diagramId,
        name: payload.name,
        kind: payload.kind,
        stereotype: payload.stereotype,
        description: payload.description,
        positionX: payload.positionX,
        positionY: payload.positionY,
        sizeWidth: payload.sizeWidth,
        sizeHeight: payload.sizeHeight,
        ports: payload.ports,
        documentIds: payload.documentIds,
        existingBlockId: payload.existingBlockId,
        userId: req.currentUser!.sub
      });
      return { block };
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return reply.status(404).send({ error: (error as Error).message });
      }
      throw error;
    }
  });

  app.get("/architecture/blocks/:tenant/:project/:diagramId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1), diagramId: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const blocks = await getArchitectureBlocks({ tenant: params.tenant, projectKey: params.project, diagramId: params.diagramId });
    return { blocks };
  });

  app.patch("/architecture/blocks/:tenant/:project/:blockId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      blockId: z.string().min(1)
    });
    const bodySchema = z.object({
      diagramId: z.string().min(1),
      name: z.string().min(1).optional(),
      kind: z.enum(["system", "subsystem", "component", "actor", "external", "interface"]).optional(),
      stereotype: z.string().optional(),
      description: z.string().optional(),
      positionX: z.number().optional(),
      positionY: z.number().optional(),
      sizeWidth: z.number().optional(),
      sizeHeight: z.number().optional(),
      ports: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            direction: z.enum(["in", "out", "inout", "none"]),
            edge: z.enum(["top", "right", "bottom", "left"]).optional(),
            offset: z.number().min(0).max(100).optional(),
            // Styling properties
            backgroundColor: z.string().optional(),
            borderColor: z.string().optional(),
            borderWidth: z.number().optional(),
            size: z.number().optional(),
            shape: z.enum(["circle", "square", "diamond"]).optional(),
            iconColor: z.string().optional(),
            hidden: z.boolean().optional(),
            showLabel: z.boolean().optional(),
            labelOffsetX: z.number().optional(),
            labelOffsetY: z.number().optional()
          })
        )
        .optional(),
      documentIds: z.array(z.string()).optional(),
      // Styling properties
      backgroundColor: z.string().optional(),
      borderColor: z.string().optional(),
      borderWidth: z.number().min(1).max(10).optional(),
      borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      textColor: z.string().optional(),
      fontSize: z.number().min(8).max(24).optional(),
      fontWeight: z.enum(["normal", "bold"]).optional(),
      borderRadius: z.number().min(0).max(20).optional(),
      portOverrides: z.record(z.string(), portOverrideSchema).optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);
    const { diagramId, ...updateFields } = body;

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const block = await updateArchitectureBlock({
        tenant: params.tenant,
        projectKey: params.project,
        blockId: params.blockId,
        diagramId,
        ...updateFields,
        userId: req.currentUser!.sub
      });
      return { block };
    } catch (error) {
      if ((error as Error).message === "Architecture block not found") {
        return reply.status(404).send({ error: "Architecture block not found" });
      }
      throw error;
    }
  });

  app.delete("/architecture/blocks/:tenant/:project/:blockId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      blockId: z.string().min(1)
    });
    const querySchema = z.object({ diagramId: z.string().optional() });
    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      await deleteArchitectureBlock({
        tenant: params.tenant,
        projectKey: params.project,
        blockId: params.blockId,
        diagramId: query.diagramId,
        userId: req.currentUser!.sub
      });
      return { success: true };
    } catch {
      return reply.status(404).send({ error: "Architecture block not found" });
    }
  });

  app.post("/architecture/connectors", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const payload = architectureConnectorSchema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    try {
      const connector = await createArchitectureConnector({
        tenant: payload.tenant,
        projectKey: payload.projectKey,
        diagramId: payload.diagramId,
        source: payload.source,
        target: payload.target,
        kind: payload.kind,
        label: payload.label,
        sourcePortId: payload.sourcePortId,
        targetPortId: payload.targetPortId,
        documentIds: payload.documentIds,
        lineStyle: payload.lineStyle,
        markerStart: payload.markerStart,
        markerEnd: payload.markerEnd,
        linePattern: payload.linePattern,
        color: payload.color,
        strokeWidth: payload.strokeWidth,
        labelOffsetX: payload.labelOffsetX,
        labelOffsetY: payload.labelOffsetY,
        controlPoints: payload.controlPoints,
        userId: req.currentUser!.sub
      });
      return { connector };
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return reply.status(404).send({ error: (error as Error).message });
      }
      throw error;
    }
  });

  app.get("/architecture/connectors/:tenant/:project/:diagramId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({ tenant: z.string().min(1), project: z.string().min(1), diagramId: z.string().min(1) });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const connectors = await getArchitectureConnectors({ tenant: params.tenant, projectKey: params.project, diagramId: params.diagramId });
    return { connectors };
  });

  app.patch("/architecture/connectors/:tenant/:project/:connectorId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      connectorId: z.string().min(1)
    });
    const bodySchema = z.object({
      diagramId: z.string().min(1),
      kind: z.enum(["association", "flow", "dependency", "composition"]).optional(),
      label: z.string().optional(),
      sourcePortId: z.string().optional(),
      targetPortId: z.string().optional(),
      documentIds: z.array(z.string()).optional(),
      // Styling properties
      lineStyle: z.enum(["straight", "smoothstep", "step", "bezier"]).optional(),
      markerStart: z.enum(["arrow", "arrowclosed", "diamond", "circle", "none"]).optional(),
      markerEnd: z.enum(["arrow", "arrowclosed", "diamond", "circle", "none"]).optional(),
      linePattern: z.enum(["solid", "dashed", "dotted"]).optional(),
      color: z.string().optional(),
      strokeWidth: z.number().min(1).max(10).optional(),
      labelOffsetX: z.number().optional(),
      labelOffsetY: z.number().optional(),
      controlPoints: z
        .array(
          z.object({
            x: z.number(),
            y: z.number()
          })
        )
        .max(16)
        .optional()
    });
    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);
    const { diagramId, ...updateFields } = body;

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const connector = await updateArchitectureConnector({
        tenant: params.tenant,
        projectKey: params.project,
        connectorId: params.connectorId,
        diagramId,
        ...updateFields,
        userId: req.currentUser!.sub
      });
      return { connector };
    } catch (error) {
      if ((error as Error).message === "Architecture connector not found") {
        return reply.status(404).send({ error: "Architecture connector not found" });
      }
      throw error;
    }
  });

  app.delete("/architecture/connectors/:tenant/:project/:connectorId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      connectorId: z.string().min(1)
    });
    const querySchema = z.object({ diagramId: z.string().min(1) });
    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      await deleteArchitectureConnector({
        tenant: params.tenant,
        projectKey: params.project,
        connectorId: params.connectorId,
        diagramId: query.diagramId,
        userId: req.currentUser!.sub
      });
      return { success: true };
    } catch {
      return reply.status(404).send({ error: "Architecture connector not found" });
    }
  });

  // Package routes
  app.post("/architecture/packages", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const schema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      parentId: z.string().nullable().optional(),
      order: z.number().optional()
    });
    const payload = schema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    try {
      const pkg = await createPackage(payload);
      return { package: pkg };
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return reply.status(404).send({ error: (error as Error).message });
      }
      throw error;
    }
  });

  app.get("/architecture/packages/:tenant/:project", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1)
    });
    const params = paramsSchema.parse(req.params);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    const packages = await getPackages({
      tenant: params.tenant,
      projectKey: params.project
    });
    return { packages };
  });

  app.patch("/architecture/packages/:tenant/:project/:packageId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      packageId: z.string().min(1)
    });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      order: z.number().optional()
    });

    const params = paramsSchema.parse(req.params);
    const body = bodySchema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      const pkg = await updatePackage({
        tenant: params.tenant,
        projectKey: params.project,
        packageId: params.packageId,
        ...body
      });
      return { package: pkg };
    } catch (error) {
      if ((error as Error).message === "Package not found") {
        return reply.status(404).send({ error: "Package not found" });
      }
      throw error;
    }
  });

  app.delete("/architecture/packages/:tenant/:project/:packageId", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const paramsSchema = z.object({
      tenant: z.string().min(1),
      project: z.string().min(1),
      packageId: z.string().min(1)
    });
    const querySchema = z.object({
      cascade: z.enum(["true", "false"]).optional()
    });

    const params = paramsSchema.parse(req.params);
    const query = querySchema.parse(req.query);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, params.tenant, reply);

    try {
      await deletePackage({
        tenant: params.tenant,
        projectKey: params.project,
        packageId: params.packageId,
        cascade: query.cascade === "true"
      });
      return { success: true };
    } catch (error) {
      if ((error as Error).message.includes("Cannot delete package")) {
        return reply.status(400).send({ error: (error as Error).message });
      }
      return reply.status(404).send({ error: "Package not found" });
    }
  });

  app.post("/architecture/packages/move", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const schema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      itemId: z.string().min(1),
      itemType: z.enum(["package", "block", "diagram"]),
      targetPackageId: z.string().nullable(),
      order: z.number().optional()
    });
    const payload = schema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    try {
      await moveToPackage(payload);
      return { success: true };
    } catch (error) {
      return reply.status(404).send({ error: (error as Error).message });
    }
  });

  app.post("/architecture/packages/reorder", {
    onRequest: [app.authenticate]
  }, async (req, reply) => {
    const schema = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      packageId: z.string().nullable(),
      itemIds: z.array(z.string().min(1))
    });
    const payload = schema.parse(req.body);

    // Verify tenant access
    requireTenantAccess(req.currentUser as AuthUser, payload.tenant, reply);

    await reorderInPackage(payload);
    return { success: true };
  });
}
