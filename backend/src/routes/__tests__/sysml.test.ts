import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp, createTestToken, authenticatedInject } from "../../__tests__/helpers/test-app.js";
import { testUsers } from "../../__tests__/helpers/test-data.js";
import { config } from "../../config.js";
import registerSysmlRoutes from "../sysml.js";

const ISO_NOW = "2025-01-01T00:00:00.000Z";

vi.mock("../../services/graph.js", () => ({
  getSysmlServiceStatus: vi.fn(() => ({
    ready: false,
    phase: "architecture",
    message: "SysML beta feature flag is disabled.",
    version: "phase0-sysml-scaffold"
  })),
  listSysmlPackages: vi.fn(async () => []),
  listSysmlElements: vi.fn(async () => []),
  listSysmlDiagrams: vi.fn(async () => []),
  createSysmlPackage: vi.fn(async (params: any) => ({
    id: "pkg-new",
    name: params.name,
    packageKind: params.packageKind,
    parentId: params.parentId ?? null,
    tenant: params.tenant,
    projectKey: params.projectKey,
    isRoot: !params.parentId,
    defaultViewpoints: params.defaultViewpoints ?? [],
    metadata: params.metadata ?? null,
    lifecycleState: "active",
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  getSysmlElement: vi.fn(async () => ({
    element: {
      id: "element-1",
      sysmlId: "sysml-1",
      name: "Engine Controller",
      elementType: "block",
      packageId: "pkg-1",
      tenant: "test-tenant",
      projectKey: "test-project",
      lifecycleState: "draft",
      versionId: null,
      stereotype: null,
      documentation: "Controls engine",
      metadata: null,
      createdAt: ISO_NOW,
      updatedAt: ISO_NOW,
      block: {
        blockKind: "component",
        isAbstract: false,
        defaultSize: { width: 320, height: 180 },
        defaultStyle: { fill: "#ffffff" }
      },
      port: {
        direction: "out",
        portType: "full",
        conjugated: false
      }
    },
    relationships: [
      {
        id: "rel-1",
        type: "HAS_PART",
        direction: "outgoing",
        targetId: "element-2"
      }
    ]
  })),
  createSysmlElement: vi.fn(async (params: any) => ({
    id: "element-new",
    sysmlId: "element-new",
    name: params.name,
    elementType: params.elementType,
    packageId: params.packageId ?? null,
    tenant: params.tenant,
    projectKey: params.projectKey,
    lifecycleState: "draft",
    stereotype: params.stereotype ?? null,
    documentation: params.documentation ?? null,
    metadata: params.metadata ?? null,
    block: {
      blockKind: params.block.blockKind ?? null,
      isAbstract: params.block.isAbstract ?? null,
      defaultSize: params.block.defaultSize ?? null,
      defaultStyle: params.block.defaultStyle ?? null
    },
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  updateSysmlElement: vi.fn(async (params: any) => ({
    id: params.elementId,
    sysmlId: params.elementId,
    name: params.name ?? "Engine Controller",
    elementType: "block",
    packageId: "pkg-1",
    tenant: params.tenant,
    projectKey: params.projectKey,
    lifecycleState: "draft",
    stereotype: params.stereotype ?? null,
    documentation: params.documentation ?? null,
    metadata: params.metadata ?? null,
    block: params.block ?? {
      blockKind: "component",
      defaultSize: { width: 320, height: 180 }
    },
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  deleteSysmlElement: vi.fn(async () => undefined),
  getSysmlDiagram: vi.fn(async () => ({
    diagram: {
      id: "diag-1",
      name: "Propulsion Overview",
      description: "High-level structure",
      diagramType: "bdd",
      tenant: "test-tenant",
      projectKey: "test-project",
      packageId: "pkg-1",
      layoutEngine: "manual",
      viewport: { x: 0, y: 0, zoom: 1.1 },
      versionId: null,
      metadata: { colorScheme: "sysml" },
      createdAt: ISO_NOW,
      updatedAt: ISO_NOW
    },
    nodes: [
      {
        elementId: "element-1",
        position: { x: 120, y: 80 },
        size: { width: 320, height: 180 },
        styleOverrides: { label: "Engine Controller" }
      }
    ],
    connections: [
      {
        connectionId: "conn-1",
        sourceId: "element-1",
        targetId: "element-2",
        controlPoints: [{ x: 160, y: 120 }],
        style: {
          lineStyle: "straight",
          color: "#000000"
        }
      }
    ]
  })),
  createSysmlDiagram: vi.fn(async (params: any) => ({
    id: "diag-new",
    name: params.name,
    description: params.description ?? null,
    diagramType: params.diagramType,
    tenant: params.tenant,
    projectKey: params.projectKey,
    packageId: params.packageId ?? null,
    layoutEngine: params.layoutEngine ?? "manual",
    viewport: params.viewport ?? null,
    metadata: params.metadata ?? null,
    lifecycleState: "active",
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  updateSysmlDiagram: vi.fn(async (params: any) => ({
    id: params.diagramId,
    name: params.name ?? "Propulsion Overview",
    description: params.description ?? "High-level structure",
    diagramType: "bdd",
    tenant: params.tenant,
    projectKey: params.projectKey,
    packageId: "pkg-1",
    layoutEngine: params.layoutEngine ?? "manual",
    viewport: params.viewport ?? { x: 0, y: 0, zoom: 1.1 },
    metadata: params.metadata ?? { colorScheme: "sysml" },
    lifecycleState: "active",
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  deleteSysmlDiagram: vi.fn(async () => undefined),
  createSysmlElementRelationship: vi.fn(async (params: any) => ({
    id: "rel-new",
    type: params.type,
    direction: "outgoing",
    targetId: params.targetElementId,
    metadata: params.metadata ?? null
  })),
  deleteSysmlElementRelationship: vi.fn(async () => undefined),
  updateSysmlPackage: vi.fn(async (params: any) => ({
    id: params.packageId,
    name: params.name ?? "Updated Package",
    packageKind: params.packageKind ?? "model",
    parentId: null,
    tenant: params.tenant,
    projectKey: params.projectKey,
    isRoot: true,
    defaultViewpoints: params.defaultViewpoints ?? ["bdd"],
    metadata: params.metadata ?? null,
    lifecycleState: "active",
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW
  })),
  deleteSysmlPackage: vi.fn(async () => undefined
  )
}));

const {
  getSysmlServiceStatus,
  listSysmlPackages,
  listSysmlElements,
  listSysmlDiagrams,
  getSysmlElement,
  getSysmlDiagram,
  createSysmlElement,
  updateSysmlElement,
  deleteSysmlElement,
  createSysmlElementRelationship,
  deleteSysmlElementRelationship,
  createSysmlDiagram,
  updateSysmlDiagram,
  deleteSysmlDiagram,
  createSysmlPackage,
  updateSysmlPackage,
  deleteSysmlPackage
} = await import("../../services/graph.js");

describe("SysML routes", () => {
  const originalFlag = config.features.sysmlBetaEnabled;
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let authToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    app.addHook("preHandler", (request, _reply, done) => {
      request.currentUser = {
        sub: testUsers.regularUser.sub,
        email: testUsers.regularUser.email,
        name: testUsers.regularUser.name,
        roles: testUsers.regularUser.roles,
        tenantSlugs: testUsers.regularUser.tenantSlugs,
        ownedTenantSlugs: testUsers.regularUser.ownedTenantSlugs
      } as any;
      done();
    });

    // Enable SysML routes by default for tests
    (config.features as any).sysmlBetaEnabled = true;

    await app.register(registerSysmlRoutes, { prefix: "/api" });
    await app.ready();

    authToken = await createTestToken(app, testUsers.regularUser);
  });

  afterEach(async () => {
    await app.close();
    (config.features as any).sysmlBetaEnabled = originalFlag;
    vi.resetAllMocks();
  });

  it("returns status payload for tenant/project", async () => {
    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/status",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toMatchObject({
      phase: "architecture",
      version: "phase0-sysml-scaffold"
    });
    expect(getSysmlServiceStatus).toHaveBeenCalledTimes(1);
  });

  it("returns packages payload with meta information", async () => {
    const mockPackages = [
      {
        id: "pkg-1",
        name: "Propulsion",
        packageKind: "model",
        tenant: "test-tenant",
        projectKey: "test-project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    vi.mocked(listSysmlPackages).mockResolvedValue(mockPackages as any);

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/packages",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.packages).toHaveLength(1);
    expect(body.meta).toMatchObject({
      implementationPhase: "phase-0"
    });
    expect(listSysmlPackages).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project"
    });
  });

  it("lists SysML elements", async () => {
    const mockElements = [
      {
        id: "element-1",
        sysmlId: "sysml-1",
        name: "Engine Controller",
        elementType: "block",
      packageId: "pkg-1",
      tenant: "test-tenant",
        projectKey: "test-project",
        lifecycleState: "draft",
        createdAt: ISO_NOW,
        updatedAt: ISO_NOW,
        block: {
          blockKind: "component",
          defaultSize: { width: 320, height: 180 }
        }
      },
      {
        id: "port-1",
        sysmlId: "sysml-port-1",
        name: "Outflow",
        elementType: "port",
        packageId: "pkg-1",
        tenant: "test-tenant",
        projectKey: "test-project",
        lifecycleState: "draft",
        createdAt: ISO_NOW,
        updatedAt: ISO_NOW,
        port: {
          direction: "out",
          portType: "flow",
          conjugated: false,
          typeRef: "Signal"
        }
      }
    ];
    vi.mocked(listSysmlElements).mockResolvedValueOnce(mockElements as any);

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/elements?elementType=block&packageId=pkg-1&search=engine&limit=50",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    expect(listSysmlElements).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementType: "block",
      packageId: "pkg-1",
      search: "engine",
      limit: 50
    });
    const body = JSON.parse(response.body);
    expect(body.meta.count).toBe(2);
    expect(body.elements[0].block?.blockKind).toBe("component");
    expect(body.elements[1].port?.direction).toBe("out");
  });

  it("returns element details", async () => {
    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.element.name).toBe("Engine Controller");
    expect(body.element.block?.defaultSize).toEqual({ width: 320, height: 180 });
    expect(body.element.port?.portType).toBe("full");
    expect(body.relationships[0].type).toBe("HAS_PART");
    expect(getSysmlElement).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementId: "element-1"
    });
  });

  it("translates missing element errors", async () => {
    vi.mocked(getSysmlElement).mockRejectedValueOnce(new Error("SysML element not found"));

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/elements/missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML element not found");
  });

  it("creates a new package", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/packages",
      token: authToken,
      payload: {
        name: "Navigation",
        packageKind: "model",
        defaultViewpoints: ["bdd"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.package.name).toBe("Navigation");
    expect(createSysmlPackage).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      name: "Navigation",
      packageKind: "model",
      defaultViewpoints: ["bdd"],
      metadata: null
    });
  });

  it("translates parent not found error during create", async () => {
    vi.mocked(createSysmlPackage).mockRejectedValueOnce(new Error("Parent package not found"));

    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/packages",
      token: authToken,
      payload: {
        name: "Derived",
        packageKind: "view",
        parentId: "missing-parent"
      }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("Parent package not found");
  });

  it("updates a package", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/packages/pkg-123",
      token: authToken,
      payload: {
        name: "Updated Name",
        metadata: { description: "Updated" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.package.metadata).toEqual({ description: "Updated" });
    expect(updateSysmlPackage).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      packageId: "pkg-123",
      name: "Updated Name",
      metadata: { description: "Updated" }
    });
  });

  it("returns 404 when updating a missing package", async () => {
    vi.mocked(updateSysmlPackage).mockRejectedValueOnce(new Error("SysML package not found"));

    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/packages/pkg-missing",
      token: authToken,
      payload: {
        name: "Updated Name"
      }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML package not found");
  });

  it("archives a package", async () => {
    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/packages/pkg-123",
      token: authToken
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSysmlPackage).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      packageId: "pkg-123"
    });
  });

  it("returns 404 when deleting missing package", async () => {
    vi.mocked(deleteSysmlPackage).mockRejectedValueOnce(new Error("SysML package not found"));

    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/packages/pkg-missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML package not found");
  });

  it("lists SysML diagrams", async () => {
    const mockDiagrams = [
      {
        id: "diag-1",
        name: "Propulsion Overview",
        description: "High-level structure",
        diagramType: "bdd",
        tenant: "test-tenant",
        projectKey: "test-project",
        packageId: "pkg-1",
        layoutEngine: "manual",
        viewport: { x: 0, y: 0, zoom: 1.1 },
        metadata: { colorScheme: "sysml" },
        createdAt: ISO_NOW,
        updatedAt: ISO_NOW
      }
    ];
    vi.mocked(listSysmlDiagrams).mockResolvedValueOnce(mockDiagrams as any);

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/diagrams?diagramType=bdd&packageId=pkg-1&search=propulsion",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    expect(listSysmlDiagrams).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      diagramType: "bdd",
      packageId: "pkg-1",
      search: "propulsion"
    });
    const body = JSON.parse(response.body);
    expect(body.meta.count).toBe(1);
    expect(body.diagrams[0].name).toBe("Propulsion Overview");
  });

  it("creates a block element", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken,
      payload: {
        elementType: "block",
        name: "New Block",
        packageId: "pkg-1",
        block: {
          blockKind: "component",
          defaultSize: { width: 200, height: 120 }
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.element.name).toBe("New Block");
    expect(createSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementType: "block",
      name: "New Block",
      packageId: "pkg-1",
      block: expect.objectContaining({
        blockKind: "component",
        defaultSize: { width: 200, height: 120 }
      })
    }));
  });

  it("creates an interface element", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken,
      payload: {
        elementType: "interface",
        name: "Thermal Interface",
        packageId: "pkg-1",
        interface: {
          protocol: "CAN",
          direction: "inout",
          rate: 10
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.element.name).toBe("Thermal Interface");
    expect(createSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      elementType: "interface",
      interface: expect.objectContaining({
        protocol: "CAN",
        direction: "inout",
        rate: 10
      })
    }));
  });

  it("creates a port element", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken,
      payload: {
        elementType: "port",
        name: "Throttle Out",
        packageId: "pkg-1",
        port: {
          direction: "out",
          portType: "flow",
          conjugated: false,
          typeRef: "ThrottleSignal"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.element.name).toBe("Throttle Out");
    expect(createSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      elementType: "port",
      port: expect.objectContaining({
        direction: "out",
        portType: "flow",
        isConjugated: false,
        typeRef: "ThrottleSignal"
      })
    }));
  });

  it("returns 404 when creating element for missing package", async () => {
    vi.mocked(createSysmlElement).mockRejectedValueOnce(new Error("SysML package not found"));

    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken,
      payload: {
        elementType: "block",
        name: "New Block",
        packageId: "missing",
        block: {
          blockKind: "component"
        }
      }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML package not found");
  });

  it("rejects unsupported element types", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken,
      payload: {
        elementType: "activity",
        name: "New Activity"
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("updates a block element", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken,
      payload: {
        name: "Updated Block",
        block: {
          blockKind: "component",
          defaultStyle: { fill: "#f0f0f0" }
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.element.name).toBe("Engine Controller");
    expect(updateSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementId: "element-1",
      name: "Updated Block",
      block: expect.objectContaining({ blockKind: "component" })
    }));
  });

  it("updates an interface element", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken,
      payload: {
        interface: {
          protocol: "ARINC",
          direction: "in"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      interface: expect.objectContaining({ protocol: "ARINC", direction: "in" })
    }));
  });

  it("updates a port element", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken,
      payload: {
        port: {
          direction: "in",
          isConjugated: true,
          protocol: "MIL-STD"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSysmlElement).toHaveBeenCalledWith(expect.objectContaining({
      port: expect.objectContaining({
        direction: "in",
        isConjugated: true,
        protocol: "MIL-STD"
      })
    }));
  });

  it("returns 404 when updating missing element", async () => {
    vi.mocked(updateSysmlElement).mockRejectedValueOnce(new Error("SysML element not found"));

    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/elements/missing",
      token: authToken,
      payload: { name: "Updated" }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML element not found");
  });

  it("rejects update without fields", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken,
      payload: {}
    });

    expect(response.statusCode).toBe(400);
  });

  it("soft deletes an element", async () => {
    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/elements/element-1",
      token: authToken
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSysmlElement).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementId: "element-1"
    });
  });

  it("returns 404 when deleting missing element", async () => {
    vi.mocked(deleteSysmlElement).mockRejectedValueOnce(new Error("SysML element not found"));

    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/elements/missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
  });

  it("creates an element relationship", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements/element-1/relationships",
      token: authToken,
      payload: {
        targetElementId: "element-2",
        type: "HAS_PART",
        metadata: { multiplicity: "1..*" }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createSysmlElementRelationship).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      sourceElementId: "element-1",
      targetElementId: "element-2",
      type: "HAS_PART",
      metadata: { multiplicity: "1..*" }
    });
  });

  it("returns 404 when creating relationship with missing element", async () => {
    vi.mocked(createSysmlElementRelationship).mockRejectedValueOnce(new Error("SysML element not found"));

    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/elements/missing/relationships",
      token: authToken,
      payload: {
        targetElementId: "element-2",
        type: "HAS_PART"
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it("deletes an element relationship", async () => {
    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/elements/element-1/relationships/rel-1",
      token: authToken
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSysmlElementRelationship).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      elementId: "element-1",
      relationshipId: "rel-1"
    });
  });

  it("returns 404 when deleting missing relationship", async () => {
    vi.mocked(deleteSysmlElementRelationship).mockRejectedValueOnce(new Error("SysML relationship not found"));

    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/elements/element-1/relationships/rel-missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns diagram detail", async () => {
    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/diagrams/diag-1",
      token: authToken
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.diagram.name).toBe("Propulsion Overview");
    expect(body.nodes[0].styleOverrides.label).toBe("Engine Controller");
    expect(body.connections[0].connectionId).toBe("conn-1");
    expect(getSysmlDiagram).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      diagramId: "diag-1"
    });
  });

  it("creates a diagram", async () => {
    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/diagrams",
      token: authToken,
      payload: {
        name: "New Diagram",
        diagramType: "bdd",
        packageId: "pkg-1"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["x-sysml-implementation"]).toBe("phase-0");
    const body = JSON.parse(response.body);
    expect(body.diagram.name).toBe("New Diagram");
    expect(createSysmlDiagram).toHaveBeenCalledWith(expect.objectContaining({
      tenant: "test-tenant",
      projectKey: "test-project",
      name: "New Diagram",
      diagramType: "bdd",
      packageId: "pkg-1"
    }));
  });

  it("returns 404 when creating diagram for missing package", async () => {
    vi.mocked(createSysmlDiagram).mockRejectedValueOnce(new Error("SysML package not found"));

    const response = await authenticatedInject(app, {
      method: "POST",
      url: "/api/sysml/test-tenant/test-project/diagrams",
      token: authToken,
      payload: {
        name: "New Diagram",
        diagramType: "bdd",
        packageId: "missing"
      }
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML package not found");
  });

  it("updates a diagram", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/diagrams/diag-1",
      token: authToken,
      payload: {
        name: "Updated Diagram",
        metadata: { colorScheme: "mono" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSysmlDiagram).toHaveBeenCalledWith(expect.objectContaining({
      tenant: "test-tenant",
      projectKey: "test-project",
      diagramId: "diag-1",
      name: "Updated Diagram"
    }));
  });

  it("returns 404 when updating missing diagram", async () => {
    vi.mocked(updateSysmlDiagram).mockRejectedValueOnce(new Error("SysML diagram not found"));

    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/diagrams/missing",
      token: authToken,
      payload: { name: "Updated" }
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects diagram update without fields", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/diagrams/diag-1",
      token: authToken,
      payload: {}
    });

    expect(response.statusCode).toBe(400);
  });

  it("archives a diagram", async () => {
    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/diagrams/diag-1",
      token: authToken
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSysmlDiagram).toHaveBeenCalledWith({
      tenant: "test-tenant",
      projectKey: "test-project",
      diagramId: "diag-1"
    });
  });

  it("returns 404 when deleting missing diagram", async () => {
    vi.mocked(deleteSysmlDiagram).mockRejectedValueOnce(new Error("SysML diagram not found"));

    const response = await authenticatedInject(app, {
      method: "DELETE",
      url: "/api/sysml/test-tenant/test-project/diagrams/missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 when diagram is missing", async () => {
    vi.mocked(getSysmlDiagram).mockRejectedValueOnce(new Error("SysML diagram not found"));

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/diagrams/missing",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("SysML diagram not found");
  });

  it("returns 404 when SysML beta feature is disabled", async () => {
    vi.mocked(listSysmlPackages).mockResolvedValue([]);
    (config.features as any).sysmlBetaEnabled = false;

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/packages",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ error: "SysML beta feature disabled." });
    expect(listSysmlPackages).not.toHaveBeenCalled();
  });

  it("returns 404 for elements endpoint when feature disabled", async () => {
    (config.features as any).sysmlBetaEnabled = false;

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/elements",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 for diagrams endpoint when feature disabled", async () => {
    (config.features as any).sysmlBetaEnabled = false;

    const response = await authenticatedInject(app, {
      method: "GET",
      url: "/api/sysml/test-tenant/test-project/diagrams",
      token: authToken
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 when update payload is empty", async () => {
    const response = await authenticatedInject(app, {
      method: "PATCH",
      url: "/api/sysml/test-tenant/test-project/packages/pkg-123",
      token: authToken,
      payload: {}
    });

    expect(response.statusCode).toBe(400);
  });
});
