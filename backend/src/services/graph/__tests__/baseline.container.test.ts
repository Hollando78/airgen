import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startNeo4jTestEnvironment, stopNeo4jTestEnvironment, type Neo4jTestEnvironment } from "../../../__tests__/helpers/neo4j-test-container.js";

let env: Neo4jTestEnvironment | null = null;
let initGraph: () => Promise<void>;
let closeGraph: () => Promise<void>;
let createBaseline: (params: { tenant: string; projectKey: string; label?: string; author?: string }) => Promise<any>;
let listBaselines: (tenant: string, projectKey: string) => Promise<any[]>;
let getBaselineDetails: (tenant: string, projectKey: string, baselineRef: string) => Promise<any>;

const tenant = "hollando";
const projectKey = "main-battle-tank";

beforeAll(async () => {
  env = await startNeo4jTestEnvironment([
    {
      query: `
        MERGE (tenant:Tenant {slug: $tenantSlug})
          ON CREATE SET tenant.createdAt = datetime($now)
        MERGE (project:Project {slug: $projectSlug, tenantSlug: $tenantSlug})
          ON CREATE SET project.key = $projectKey, project.createdAt = datetime($now), project.baselineCounter = 0
        MERGE (tenant)-[:OWNS]->(project)
        WITH project
        MERGE (req:Requirement {
          id: $requirementId,
          ref: $requirementRef,
          tenant: $tenantSlug,
          projectKey: $projectKey,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (project)-[:CONTAINS]->(req)
        WITH req
        MERGE (reqVer:RequirementVersion {
          versionId: $requirementVersionId,
          requirementId: $requirementId,
          versionNumber: 1,
          timestamp: $now,
          changedBy: $author,
          changeType: "created",
          text: $requirementText,
          contentHash: "hash-001"
        })
        MERGE (req)-[:HAS_VERSION]->(reqVer)
      `,
      params: {
        tenantSlug: tenant,
        projectSlug: projectKey,
        projectKey,
        requirementId: "req-001",
        requirementRef: "REQ-001",
        requirementVersionId: "req-001-v1",
        requirementText: "The system shall maintain telemetry within 100 ms.",
        author: "tester@airgen",
        now: "2024-01-01T00:00:00Z"
      }
    }
  ]);

  process.env.API_ENV = "test";
  process.env.GRAPH_URL = env.container.getBoltUri();
  process.env.GRAPH_USERNAME = env.container.getUsername();
  process.env.GRAPH_PASSWORD = env.container.getPassword();
  process.env.GRAPH_DATABASE = "neo4j";

  vi.resetModules();

  ({ initGraph, closeGraph } = await import("../driver.ts"));
  ({ createBaseline, listBaselines, getBaselineDetails } = await import("../requirement-baselines.ts"));

  await initGraph();
}, 60_000);

afterAll(async () => {
  await closeGraph();
  await stopNeo4jTestEnvironment(env);
  env = null;
});

describe("Baseline integration with Neo4j container", () => {
  it("creates a baseline snapshot with requirement version data", async () => {
    const baseline = await createBaseline({
      tenant,
      projectKey,
      label: "Release 1.0",
      author: "tester@airgen"
    });

    expect(baseline.ref).toMatch(/^BL-MAINBATTLETANK-/);
    expect(baseline.requirementVersionCount).toBe(1);
    expect(baseline.requirementRefs).toEqual(["REQ-001"]);

    const baselines = await listBaselines(tenant, projectKey);
    expect(baselines).toHaveLength(1);
    expect(baselines[0].label).toBe("Release 1.0");

    const snapshot = await getBaselineDetails(tenant, projectKey, baseline.ref);
    expect(snapshot.requirementVersions).toHaveLength(1);
    expect(snapshot.requirementVersions[0].versionId).toBe("req-001-v1");
  });
});
