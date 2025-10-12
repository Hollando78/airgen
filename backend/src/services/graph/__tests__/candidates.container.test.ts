import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startNeo4jTestEnvironment, stopNeo4jTestEnvironment, type Neo4jTestEnvironment } from "../../../__tests__/helpers/neo4j-test-container.js";
import type { RequirementCandidateStatus } from "../requirement-candidates.ts";

let env: Neo4jTestEnvironment | null = null;
let runtimeAvailable = true;
let initGraph: () => Promise<void>;
let closeGraph: () => Promise<void>;
let createRequirementCandidates: typeof import("../requirement-candidates.ts").createRequirementCandidates;
let listRequirementCandidates: typeof import("../requirement-candidates.ts").listRequirementCandidates;
let updateRequirementCandidate: typeof import("../requirement-candidates.ts").updateRequirementCandidate;
let getRequirementCandidate: typeof import("../requirement-candidates.ts").getRequirementCandidate;
let bulkResetCandidates: typeof import("../requirement-candidates.ts").bulkResetCandidates;
let bulkArchiveCandidates: typeof import("../requirement-candidates.ts").bulkArchiveCandidates;
let bulkDeleteCandidates: typeof import("../requirement-candidates.ts").bulkDeleteCandidates;

const tenant = "hollando";
const projectKey = "main-battle-tank";

beforeAll(async () => {
  try {
    env = await startNeo4jTestEnvironment();
  } catch (error) {
    runtimeAvailable = false;
    console.warn("[candidates.container.test] Skipping - container runtime unavailable:", (error as Error).message);
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
    createRequirementCandidates,
    listRequirementCandidates,
    updateRequirementCandidate,
    getRequirementCandidate,
    bulkResetCandidates,
    bulkArchiveCandidates,
    bulkDeleteCandidates
  } = await import("../requirement-candidates.ts"));

  await initGraph();
}, 60_000);

afterAll(async () => {
  if (!runtimeAvailable) {return;}
  await closeGraph();
  await stopNeo4jTestEnvironment(env);
  env = null;
});

describe("Requirement candidate lifecycle (Neo4j container)", () => {
  it("creates, transitions, resets, and archives candidates", async () => {
    if (!runtimeAvailable) {return;}
    const [first, second] = await createRequirementCandidates([
      {
        tenant,
        projectKey,
        text: "The system shall encrypt telemetry within 50 ms.",
        qaScore: 90,
        prompt: "Telemetry protection",
        querySessionId: "session-1"
      },
      {
        tenant,
        projectKey,
        text: "The system shall log operator commands within 100 ms.",
        qaScore: 85,
        prompt: "Operational logging",
        querySessionId: "session-1"
      }
    ]);

    expect(first.status).toBe("pending");
    expect(second.status).toBe("pending");

    const listed = await listRequirementCandidates(tenant, projectKey);
    expect(listed).toHaveLength(2);
    expect(listed[0].text).toContain("log operator commands");

    const accepted = await updateRequirementCandidate(first.id, {
      status: "accepted" as RequirementCandidateStatus,
      requirementId: "req-123",
      requirementRef: "REQ-123"
    });

    expect(accepted?.status).toBe("accepted");
    expect(accepted?.requirementRef).toBe("REQ-123");

    const fetched = await getRequirementCandidate(first.id);
    expect(fetched?.status).toBe("accepted");

    const resetResult = await bulkResetCandidates([first.id]);
    expect(resetResult.reset).toBe(1);

    const reset = await getRequirementCandidate(first.id);
    expect(reset?.status).toBe("pending");
    expect(reset?.requirementRef).toBeNull();

    await updateRequirementCandidate(first.id, {
      status: "accepted" as RequirementCandidateStatus,
      requirementId: "req-123",
      requirementRef: "REQ-123"
    });

    const archiveResult = await bulkArchiveCandidates([first.id]);
    expect(archiveResult.archived).toBe(1);
    expect(await getRequirementCandidate(first.id)).toBeNull();

    const deleteResult = await bulkDeleteCandidates([second.id]);
    expect(deleteResult.deleted).toBe(1);

    const remaining = await listRequirementCandidates(tenant, projectKey);
    expect(remaining).toHaveLength(0);
  });
});
