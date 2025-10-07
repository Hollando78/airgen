import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { requirementMarkdown, type RequirementRecord } from "../services/workspace.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Parse YAML frontmatter from a markdown requirement file
 * This is the inverse of requirementMarkdown()
 */
function parseRequirementMarkdown(markdown: string): Partial<RequirementRecord> {
  const lines = markdown.split("\n");

  // Expect frontmatter to start with ---
  if (lines[0]?.trim() !== "---") {
    throw new Error("Invalid markdown: missing frontmatter start delimiter");
  }

  let i = 1;
  const yamlLines: string[] = [];

  // Collect YAML lines until closing ---
  while (i < lines.length && lines[i]?.trim() !== "---") {
    yamlLines.push(lines[i]);
    i++;
  }

  if (i >= lines.length) {
    throw new Error("Invalid markdown: missing frontmatter end delimiter");
  }

  // Parse YAML (simple parser for test purposes)
  const metadata: any = {};
  let currentKey: string | null = null;
  let currentNestedKey: string | null = null;
  let currentObject: any = null;
  let inArray = false;
  let inNestedArray = false;
  let currentArray: any[] = [];

  for (const line of yamlLines) {
    // Top-level key
    if (line.match(/^(\w+):\s*(.*)$/)) {
      // Save previous array if exists
      if (inArray && currentKey && !inNestedArray) {
        metadata[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
      }
      if (inNestedArray && currentKey && currentNestedKey) {
        if (!metadata[currentKey]) {
          metadata[currentKey] = {};
        }
        metadata[currentKey][currentNestedKey] = currentArray;
        currentArray = [];
        inNestedArray = false;
        currentNestedKey = null;
      }

      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        currentNestedKey = null;
        const value = match[2].trim();

        if (value === "null") {
          metadata[currentKey] = null;
        } else if (value === "[]") {
          metadata[currentKey] = [];
        } else if (value === "") {
          // Object or array coming
          metadata[currentKey] = {};
        } else {
          // Simple value
          metadata[currentKey] = value;
        }
      }
    }
    // Nested key (2 spaces indent)
    else if (line.match(/^  (\w+):\s*(.*)$/)) {
      // Save previous nested array if exists
      if (inNestedArray && currentKey && currentNestedKey) {
        if (!metadata[currentKey]) {
          metadata[currentKey] = {};
        }
        metadata[currentKey][currentNestedKey] = currentArray;
        currentArray = [];
        inNestedArray = false;
      }

      const match = line.match(/^  (\w+):\s*(.*)$/);
      if (match && currentKey) {
        const nestedKey = match[1];
        currentNestedKey = nestedKey;
        const value = match[2].trim();

        if (!metadata[currentKey]) {
          metadata[currentKey] = {};
        }

        if (value === "null") {
          metadata[currentKey][nestedKey] = null;
        } else if (value === "[]") {
          metadata[currentKey][nestedKey] = [];
        } else if (value === "") {
          // Array coming
          inNestedArray = true;
          currentArray = [];
        } else {
          metadata[currentKey][nestedKey] = value;
        }
      }
    }
    // Array item (2 spaces + dash) - top-level array
    else if (line.match(/^  - (.+)$/) && !inNestedArray) {
      const match = line.match(/^  - (.+)$/);
      if (match && currentKey) {
        if (!Array.isArray(metadata[currentKey])) {
          metadata[currentKey] = [];
        }
        metadata[currentKey].push(match[1]);
      }
    }
    // Array item (4 spaces + dash) - nested array
    else if (line.match(/^    - (.+)$/)) {
      const match = line.match(/^    - (.+)$/);
      if (match) {
        currentArray.push(match[1]);
      }
    }
  }

  // Save final array if exists
  if (inNestedArray && currentKey && currentNestedKey && currentArray.length > 0) {
    if (!metadata[currentKey]) {
      metadata[currentKey] = {};
    }
    metadata[currentKey][currentNestedKey] = currentArray;
  }
  if (inArray && currentKey && currentArray.length > 0) {
    metadata[currentKey] = currentArray;
  }

  // Parse text content (everything after frontmatter)
  const textLines = lines.slice(i + 1);
  const text = textLines.join("\n").trim();

  // Convert metadata to RequirementRecord shape
  const record: Partial<RequirementRecord> = {
    id: metadata.id,
    ref: metadata.ref,
    title: metadata.title,
    tenant: metadata.tenant,
    projectKey: metadata.project,
    pattern: (metadata.pattern === "null" || metadata.pattern === null) ? undefined : metadata.pattern,
    verification: (metadata.verification === "null" || metadata.verification === null) ? undefined : metadata.verification,
    tags: metadata.tags || [],
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    text
  };

  // Parse QA data if present
  if (metadata.qa && typeof metadata.qa === 'object') {
    const scoreValue = metadata.qa.score;
    record.qaScore = (scoreValue === "null" || scoreValue === null) ? undefined : Number(scoreValue);
    record.qaVerdict = (metadata.qa.verdict === "null" || metadata.qa.verdict === null) ? undefined : metadata.qa.verdict;
    record.suggestions = metadata.qa.suggestions || [];
  }

  return record;
}

describe("markdown roundtrip integrity", () => {
  describe("basic requirement roundtrip", () => {
    it("should preserve all fields through write -> parse cycle", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-001",
        hashId: "hash123",
        ref: "REQ-001",
        tenant: "tenant",
        projectKey: "project",
        title: "System shall respond within 100ms",
        text: "The system shall respond to user input within 100 milliseconds under normal load conditions.",
        pattern: "ubiquitous",
        verification: "Test",
        tags: ["performance", "critical"],
        path: "tenant/project/requirements/REQ-001.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T12:30:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      // Verify all critical fields are preserved
      expect(parsed.id).toBe(original.id);
      expect(parsed.ref).toBe(original.ref);
      expect(parsed.title).toBe(original.title);
      expect(parsed.text).toBe(original.text);
      expect(parsed.pattern).toBe(original.pattern);
      expect(parsed.verification).toBe(original.verification);
      expect(parsed.tags).toEqual(original.tags);
      expect(parsed.tenant).toBe(original.tenant);
      expect(parsed.projectKey).toBe(original.projectKey);
      expect(parsed.createdAt).toBe(original.createdAt);
      expect(parsed.updatedAt).toBe(original.updatedAt);
    });

    it("should handle null/undefined optional fields", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-002",
        hashId: "hash456",
        ref: "REQ-002",
        tenant: "tenant",
        projectKey: "project",
        title: "Basic requirement",
        text: "The system shall do something.",
        pattern: undefined,
        verification: undefined,
        tags: [],
        path: "tenant/project/requirements/REQ-002.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.pattern).toBeUndefined();
      expect(parsed.verification).toBeUndefined();
      expect(parsed.tags).toEqual([]);
    });
  });

  describe("metadata preservation", () => {
    it("should preserve QA metadata with zero score", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-003",
        hashId: "hash789",
        ref: "REQ-003",
        tenant: "tenant",
        projectKey: "project",
        title: "Poorly written requirement",
        text: "Do the thing",
        qaScore: 0,
        qaVerdict: "Not compliant",
        suggestions: ["Be more specific", "Add measurable criteria"],
        tags: ["needs-review"],
        path: "tenant/project/requirements/REQ-003.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.qaScore).toBe(0);
      expect(parsed.qaVerdict).toBe("Not compliant");
      expect(parsed.suggestions).toEqual(["Be more specific", "Add measurable criteria"]);
    });

    it("should preserve QA metadata with perfect score", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-004",
        hashId: "hash101",
        ref: "REQ-004",
        tenant: "tenant",
        projectKey: "project",
        title: "Well-written requirement",
        text: "The system shall authenticate users using SHA-256 hashed passwords within 200 milliseconds.",
        qaScore: 100,
        qaVerdict: "Fully compliant",
        suggestions: [],
        tags: ["security", "performance"],
        path: "tenant/project/requirements/REQ-004.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.qaScore).toBe(100);
      expect(parsed.qaVerdict).toBe("Fully compliant");
      expect(parsed.suggestions).toEqual([]);
    });

    it("should handle missing QA metadata", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-005",
        hashId: "hash202",
        ref: "REQ-005",
        tenant: "tenant",
        projectKey: "project",
        title: "Unscored requirement",
        text: "The system shall do something.",
        tags: [],
        path: "tenant/project/requirements/REQ-005.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.qaScore).toBeUndefined();
      expect(parsed.qaVerdict).toBeUndefined();
      expect(parsed.suggestions).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle special characters in text", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-006",
        hashId: "hash303",
        ref: "REQ-006",
        tenant: "tenant",
        projectKey: "project",
        title: "Special chars: @#$%^&*()",
        text: "The system shall handle: quotes \"like this\", apostrophes 'like this', and symbols @#$%^&*().",
        tags: ["edge-case"],
        path: "tenant/project/requirements/REQ-006.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.title).toBe(original.title);
      expect(parsed.text).toBe(original.text);
    });

    it("should handle unicode characters", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-007",
        hashId: "hash404",
        ref: "REQ-007",
        tenant: "tenant",
        projectKey: "project",
        title: "Unicode: 日本語 한글 العربية",
        text: "The system shall support unicode: 日本語 (Japanese), 한글 (Korean), العربية (Arabic), émojis 🎉🎊.",
        tags: ["i18n"],
        path: "tenant/project/requirements/REQ-007.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.title).toBe(original.title);
      expect(parsed.text).toBe(original.text);
    });

    it("should handle multiline text content", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-008",
        hashId: "hash505",
        ref: "REQ-008",
        tenant: "tenant",
        projectKey: "project",
        title: "Multiline requirement",
        text: "The system shall:\n1. Authenticate users\n2. Authorize access\n3. Log all actions\n\nThis is additional context.",
        tags: ["security"],
        path: "tenant/project/requirements/REQ-008.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.text).toBe(original.text);
    });

    it("should handle empty tags array", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-009",
        hashId: "hash606",
        ref: "REQ-009",
        tenant: "tenant",
        projectKey: "project",
        title: "No tags",
        text: "The system shall do something without tags.",
        tags: [],
        path: "tenant/project/requirements/REQ-009.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.tags).toEqual([]);
    });

    it("should handle many tags", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-010",
        hashId: "hash707",
        ref: "REQ-010",
        tenant: "tenant",
        projectKey: "project",
        title: "Many tags",
        text: "The system shall have many tags.",
        tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "critical", "performance", "security"],
        path: "tenant/project/requirements/REQ-010.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.tags).toEqual(original.tags);
    });
  });

  describe("hash stability", () => {
    it("should produce identical markdown on multiple serializations", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-011",
        hashId: "hash808",
        ref: "REQ-011",
        tenant: "tenant",
        projectKey: "project",
        title: "Hash stability test",
        text: "The system shall produce consistent output.",
        pattern: "event",
        verification: "Test",
        qaScore: 85,
        qaVerdict: "Good",
        suggestions: ["Minor improvement possible"],
        tags: ["stable"],
        path: "tenant/project/requirements/REQ-011.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown1 = requirementMarkdown(original);
      const markdown2 = requirementMarkdown(original);
      const markdown3 = requirementMarkdown(original);

      expect(markdown1).toBe(markdown2);
      expect(markdown2).toBe(markdown3);
    });

    it("should produce identical markdown after roundtrip", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-012",
        hashId: "hash909",
        ref: "REQ-012",
        tenant: "tenant",
        projectKey: "project",
        title: "Roundtrip stability",
        text: "The system shall maintain data integrity.",
        tags: ["data-integrity"],
        path: "tenant/project/requirements/REQ-012.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown1 = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown1);
      const markdown2 = requirementMarkdown({
        ...original,
        ...parsed
      } as RequirementRecord);

      expect(markdown1).toBe(markdown2);
    });
  });

  describe("yaml frontmatter edge cases", () => {
    it("should handle colons in title", () => {
      const original: RequirementRecord = {
        id: "tenant:project:REQ-013",
        hashId: "hash111",
        ref: "REQ-013",
        tenant: "tenant",
        projectKey: "project",
        title: "System: Component shall work",
        text: "The system component shall function correctly.",
        tags: [],
        path: "tenant/project/requirements/REQ-013.md",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      };

      const markdown = requirementMarkdown(original);
      const parsed = parseRequirementMarkdown(markdown);

      expect(parsed.title).toBe(original.title);
    });

    it("should handle all requirement patterns", () => {
      const patterns: Array<RequirementRecord["pattern"]> = [
        "ubiquitous", "event", "state", "unwanted", "optional"
      ];

      patterns.forEach((pattern, idx) => {
        const original: RequirementRecord = {
          id: `tenant:project:REQ-${100 + idx}`,
          hashId: `hash${100 + idx}`,
          ref: `REQ-${100 + idx}`,
          tenant: "tenant",
          projectKey: "project",
          title: `Pattern test: ${pattern}`,
          text: `Requirement with ${pattern} pattern.`,
          pattern,
          tags: [],
          path: `tenant/project/requirements/REQ-${100 + idx}.md`,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        };

        const markdown = requirementMarkdown(original);
        const parsed = parseRequirementMarkdown(markdown);

        expect(parsed.pattern).toBe(pattern);
      });
    });

    it("should handle all verification methods", () => {
      const methods: Array<RequirementRecord["verification"]> = [
        "Test", "Analysis", "Inspection", "Demonstration"
      ];

      methods.forEach((verification, idx) => {
        const original: RequirementRecord = {
          id: `tenant:project:REQ-${200 + idx}`,
          hashId: `hash${200 + idx}`,
          ref: `REQ-${200 + idx}`,
          tenant: "tenant",
          projectKey: "project",
          title: `Verification test: ${verification}`,
          text: `Requirement verified by ${verification}.`,
          verification,
          tags: [],
          path: `tenant/project/requirements/REQ-${200 + idx}.md`,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        };

        const markdown = requirementMarkdown(original);
        const parsed = parseRequirementMarkdown(markdown);

        expect(parsed.verification).toBe(verification);
      });
    });
  });
});
