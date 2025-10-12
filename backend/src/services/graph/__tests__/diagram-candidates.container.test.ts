import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startNeo4jTestEnvironment, stopNeo4jTestEnvironment, type Neo4jTestEnvironment } from "../../../__tests__/helpers/neo4j-test-container.js";

let env: Neo4jTestEnvironment | null = null;
let runtimeAvailable = true;
let initGraph: () => Promise<void>;
let closeGraph: () => Promise<void>;
let createDiagramCandidate: typeof import("../diagram-candidates.js").createDiagramCandidate;
let listDiagramCandidates: typeof import("../diagram-candidates.js").listDiagramCandidates;
let updateDiagramCandidate: typeof import("../diagram-candidates.js").updateDiagramCandidate;
let createArchitectureDiagram: typeof import("../architecture/index.js").createArchitectureDiagram;
let createArchitectureBlock: typeof import("../architecture/index.js").createArchitectureBlock;
let createArchitectureConnector: typeof import("../architecture/index.js").createArchitectureConnector;
let getArchitectureDiagrams: typeof import("../architecture/index.js").getArchitectureDiagrams;

const tenant = "hollando";
const projectKey = "main-battle-tank";

beforeAll(async () => {
  try {
    env = await startNeo4jTestEnvironment();
  } catch (error) {
    runtimeAvailable = false;
    console.warn("[diagram-candidates.container.test] Skipping - container runtime unavailable:", (error as Error).message);
    return;
  }

  process.env.API_ENV = "test";
  process.env.GRAPH_URL = env.container.getBoltUri();
  process.env.GRAPH_USERNAME = env.container.getUsername();
  process.env.GRAPH_PASSWORD = env.container.getPassword();
  process.env.GRAPH_DATABASE = "neo4j";

  vi.resetModules();

  ({ initGraph, closeGraph } = await import("../driver.ts"));
  ({
    createDiagramCandidate,
    listDiagramCandidates,
    updateDiagramCandidate
  } = await import("../diagram-candidates.js"));
  ({
    createArchitectureDiagram,
    createArchitectureBlock,
    createArchitectureConnector,
    getArchitectureDiagrams
  } = await import("../architecture/index.js"));

  await initGraph();
}, 60_000);

afterAll(async () => {
  if (!runtimeAvailable) {return;}
  await closeGraph();
  await stopNeo4jTestEnvironment(env);
  env = null;
});

describe("Diagram candidate lifecycle (Neo4j container)", () => {
  it("handles rejection, return, and acceptance with diagram creation", async () => {
    if (!runtimeAvailable) {return;}
    const candidate = await createDiagramCandidate({
      tenant,
      projectKey,
      status: "pending",
      action: "create",
      diagramName: "Telemetry Flow",
      diagramDescription: "Auto-generated diagram",
      diagramView: "block",
      prompt: "Generate telemetry architecture",
      reasoning: "Ensures redundancy across components.",
      blocks: [
        {
          name: "Sensor Suite",
          kind: "component",
          positionX: 100,
          positionY: 200,
          ports: []
        },
        {
          name: "Telemetry Gateway",
          kind: "component",
          positionX: 400,
          positionY: 200,
          ports: []
        }
      ],
      connectors: [
        {
          source: "Sensor Suite",
          target: "Telemetry Gateway",
          kind: "flow",
          label: "Telemetry stream"
        }
      ]
    });

    expect(candidate.status).toBe("pending");

    const listed = await listDiagramCandidates(tenant, projectKey);
    expect(listed).toHaveLength(1);

    const rejected = await updateDiagramCandidate(candidate.id, { status: "rejected" });
    expect(rejected?.status).toBe("rejected");

    const pending = await updateDiagramCandidate(candidate.id, { status: "pending" });
    expect(pending?.status).toBe("pending");

    const diagram = await createArchitectureDiagram({
      tenant,
      projectKey,
      name: candidate.diagramName ?? "Generated Diagram",
      description: candidate.diagramDescription ?? undefined,
      view: "block"
    });

    const blockIdMap = new Map<string, string>();
    for (const block of candidate.blocks) {
      const createdBlock = await createArchitectureBlock({
        tenant,
        projectKey,
        diagramId: diagram.id,
        name: block.name,
        kind: block.kind as any,
        positionX: block.positionX,
        positionY: block.positionY,
        ports: block.ports,
        documentIds: []
      });
      blockIdMap.set(block.name, createdBlock.id);
    }

    for (const connector of candidate.connectors) {
      await createArchitectureConnector({
        tenant,
        projectKey,
        diagramId: diagram.id,
        source: blockIdMap.get(connector.source) as string,
        target: blockIdMap.get(connector.target) as string,
        kind: connector.kind as any,
        label: connector.label
      });
    }

    const accepted = await updateDiagramCandidate(candidate.id, {
      status: "accepted",
      diagramId: diagram.id,
      diagramName: "Telemetry Flow",
      diagramDescription: "Auto-generated diagram"
    });

    expect(accepted?.status).toBe("accepted");
    expect(accepted?.diagramId).toBe(diagram.id);

    const diagrams = await getArchitectureDiagrams({ tenant, projectKey });
    expect(diagrams.some(d => d.id === diagram.id)).toBe(true);
  });
});
