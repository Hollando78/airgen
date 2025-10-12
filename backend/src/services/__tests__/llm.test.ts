import { beforeEach, describe, expect, it, vi } from "vitest";

const createChatCompletionMock = vi.fn();
const openAiConstructorMock = vi.fn(() => ({
  chat: {
    completions: {
      create: createChatCompletionMock
    }
  }
}));

vi.mock("openai", () => ({
  default: openAiConstructorMock
}));

const analyzeRequirementMock = vi.fn(() => ({
  score: 92,
  verdict: "ACCEPTABLE"
}));

vi.mock("@airgen/req-qa", () => ({
  analyzeRequirement: analyzeRequirementMock
}));

const { config } = await import("../../config.js");
const {
  generateLlmDrafts,
  isLlmConfigured,
  __resetOpenAiClientForTests
} = await import("../llm.js");

const mutableConfig = config as unknown as {
  llm: {
    provider: string | null;
    apiKey: string | null;
    baseUrl: string | null;
    model: string;
    temperature: number;
  };
  draftsPerRequestLimit: number;
};

const originalLlmConfig = { ...config.llm };
const originalDraftLimit = config.draftsPerRequestLimit;

describe("generateLlmDrafts", () => {
  beforeEach(() => {
    Object.assign(mutableConfig.llm, originalLlmConfig);
    mutableConfig.draftsPerRequestLimit = originalDraftLimit;
    __resetOpenAiClientForTests();
    openAiConstructorMock.mockClear();
    createChatCompletionMock.mockReset();
    analyzeRequirementMock.mockClear();
  });

  it("reports LLM as not configured by default", () => {
    expect(isLlmConfigured()).toBe(false);
  });

  it("throws when LLM provider is not configured", async () => {
    mutableConfig.llm.provider = null;
    mutableConfig.llm.apiKey = null;

    await expect(generateLlmDrafts({
      need: "Capture mission telemetry.",
      count: 2
    })).rejects.toThrow("LLM provider is not configured");

    expect(openAiConstructorMock).not.toHaveBeenCalled();
  });

  it("throws when configured with an unsupported provider", async () => {
    mutableConfig.llm.provider = "anthropic";
    mutableConfig.llm.apiKey = "test-key";

    await expect(generateLlmDrafts({
      need: "Synchronize guidance software.",
      count: 2
    })).rejects.toThrow("Unsupported LLM provider 'anthropic'");

    expect(openAiConstructorMock).not.toHaveBeenCalled();
  });

  it("generates drafts using OpenAI and clamps request count", async () => {
    mutableConfig.llm.provider = "openai";
    mutableConfig.llm.apiKey = "test-key";
    mutableConfig.llm.model = "gpt-4o-mini";
    mutableConfig.llm.temperature = 0.1;
    mutableConfig.draftsPerRequestLimit = 4;

    createChatCompletionMock.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            requirements: [
              { text: "Requirement A", pattern: "event", verification: "Test", rationale: "A" },
              { text: "Requirement B", pattern: "state", verification: "Analysis", rationale: "B" },
              { text: "Requirement C", verification: "Inspection", rationale: "C" },
              { text: "Requirement D" }
            ]
          })
        }
      }]
    });

    const drafts = await generateLlmDrafts({
      need: "Maintain uplink integrity.",
      count: 10,
      pattern: "optional",
      verification: "Demonstration"
    });

    expect(openAiConstructorMock).toHaveBeenCalledTimes(1);
    expect(createChatCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" }
    }));
    expect(drafts).toHaveLength(4);
    drafts.forEach(draft => {
      expect(draft.qaScore).toBe(92);
      expect(draft.qaVerdict).toBe("ACCEPTABLE");
      expect(draft.source).toBe("llm");
    });
    expect(drafts[2].pattern).toBe("optional"); // falls back to request pattern
    expect(drafts[3].verification).toBe("Demonstration"); // falls back to request verification
    expect(analyzeRequirementMock).toHaveBeenCalledTimes(4);
  });

  it("throws when OpenAI response is not valid JSON", async () => {
    mutableConfig.llm.provider = "openai";
    mutableConfig.llm.apiKey = "test-key";

    createChatCompletionMock.mockResolvedValue({
      choices: [{
        message: {
          content: "not-json"
        }
      }]
    });

    await expect(generateLlmDrafts({
      need: "Provide redundant navigation.",
      count: 1
    })).rejects.toThrow("LLM returned non-JSON payload");

    expect(analyzeRequirementMock).not.toHaveBeenCalled();
  });
});
