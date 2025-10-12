import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("@airgen/req-qa", () => ({
  analyzeRequirement: vi.fn(() => ({
    score: 87,
    verdict: "GREEN"
  }))
}));

const { analyzeRequirement } = await import("@airgen/req-qa");
const { generateDrafts } = await import("../drafts.js");

describe("generateDrafts", () => {
  beforeEach(() => {
    vi.mocked(analyzeRequirement).mockClear();
  });

  it("clamps requested count to allowed range and returns QA metadata", () => {
    const drafts = generateDrafts({
      need: "The operator needs timely telemetry.",
      count: 10
    });

    expect(drafts).toHaveLength(5); // clamp to 5
    expect(drafts[0]).toMatchObject({
      qaScore: 87,
      qaVerdict: "GREEN",
      source: "heuristic"
    });
    expect(vi.mocked(analyzeRequirement)).toHaveBeenCalledTimes(5);
  });

  it("respects requested pattern and verification for all drafts", () => {
    const drafts = generateDrafts({
      need: "Provide redundant power during failover.",
      pattern: "state",
      verification: "Analysis",
      count: 3
    });

    expect(drafts).toHaveLength(3);
    drafts.forEach(draft => {
      expect(draft.pattern).toBe("state");
      expect(draft.verification).toBe("Analysis");
      expect(draft.text).toMatch(/Provide redundant power during failover\./);
    });
  });

  it("cycles heuristic patterns when none are requested", () => {
    const drafts = generateDrafts({
      need: "Ensure mission data is replicated.",
      count: 4
    });

    const patterns = drafts.map(draft => draft.pattern);
    expect(patterns).toEqual(["event", "state", "ubiquitous", "unwanted"]);
  });

  it("normalizes whitespace in generated text", () => {
    const drafts = generateDrafts({
      need: "  Maintain situational awareness \n across \t domains. ",
      count: 1
    });

    expect(drafts[0].text).toBe("Maintain situational awareness across domains. When the specified event, the system shall meet the performance objective within 250 ms.");
  });
});
