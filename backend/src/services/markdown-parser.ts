import { analyzeRequirement } from "@airgen/req-qa";

export type ParsedRequirement = {
  id?: string;
  ref?: string;
  text: string;
  title?: string;
  pattern?: string;
  verification?: string;
  line: number;
  sectionName?: string;
};

export type ParsedSection = {
  name: string;
  shortCode?: string;
  level: number;
  line: number;
};

export type ParsedInfo = {
  id?: string;
  ref?: string;
  text: string;
  title?: string;
  line: number;
  sectionName?: string;
};

export type ParsedContentBlockType =
  | "frontmatter"
  | "heading"
  | "requirement"
  | "info"
  | "raw";

export type ParsedContentBlock = {
  type: ParsedContentBlockType;
  raw: string;
  line: number;
  metadata?: Record<string, unknown>;
};

export type ValidationError = {
  line: number;
  column?: number;
  severity: "error" | "warning" | "info";
  message: string;
  type: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

export type ParsedDocument = {
  requirements: ParsedRequirement[];
  sections: ParsedSection[];
  infos: ParsedInfo[];
  metadata: Record<string, unknown>;
  blocks: ParsedContentBlock[];
};

/**
 * Parse markdown document to extract requirements and sections
 */
export async function parseMarkdownDocument(
  content: string,
  context: {
    tenant: string;
    projectKey: string;
    documentSlug: string;
  }
): Promise<ParsedDocument> {
  const lines = content.split("\n");
  const requirements: ParsedRequirement[] = [];
  const sections: ParsedSection[] = [];
  const infos: ParsedInfo[] = [];
  const blocks: ParsedContentBlock[] = [];
  let metadata: Record<string, unknown> = {};
  let currentSection: string | undefined;

  let inRequirementBlock = false;
  let currentRequirement: Partial<ParsedRequirement> | null = null;
  let requirementStartLine = 0;
  let requirementLines: string[] = [];

  let inInfoBlock = false;
  let currentInfo: Partial<ParsedInfo> | null = null;
  let infoStartLine = 0;
  let infoLines: string[] = [];

  let rawBuffer: string[] = [];
  let rawStartLine: number | null = null;

  const flushRawBuffer = () => {
    if (rawBuffer.length === 0) {
      return;
    }
    blocks.push({
      type: "raw",
      raw: rawBuffer.join("\n"),
      line: rawStartLine ?? 1
    });
    rawBuffer = [];
    rawStartLine = null;
  };

  const addToRawBuffer = (value: string, lineNum: number) => {
    if (rawStartLine === null) {
      rawStartLine = lineNum;
    }
    rawBuffer.push(value);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const lineNum = i + 1;

    // Parse YAML frontmatter (first block)
    if (i === 0 && line.trim() === "---") {
      let j = i + 1;
      const yamlLines: string[] = [];
      while (j < lines.length && lines[j].trim() !== "---") {
        yamlLines.push(lines[j]);
        j++;
      }
      if (j < lines.length) {
        const frontmatterLines = [lines[i], ...yamlLines, lines[j]];
        const frontmatterMetadata: Record<string, unknown> = {};

        yamlLines.forEach(yamlLine => {
          const match = yamlLine.match(/^(\w+):\s*(.+)$/);
          if (match) {
            frontmatterMetadata[match[1]] = match[2].trim();
          }
        });

        metadata = frontmatterMetadata;

        blocks.push({
          type: "frontmatter",
          raw: frontmatterLines.join("\n"),
          line: lineNum,
          metadata: frontmatterMetadata
        });

        i = j;
        continue;
      }
    }

    // Parse section headers (# Header or # [CODE] Header)
    const headerMatch = line.match(/^(#{1,6})\s+(?:\[([^\]]+)\]\s+)?(.+)$/);
    if (!inRequirementBlock && !inInfoBlock && headerMatch) {
      flushRawBuffer();

      const sectionName = headerMatch[3].trim();
      const level = headerMatch[1].length;
      const shortCode = headerMatch[2];

      sections.push({
        level,
        shortCode,
        name: sectionName,
        line: lineNum
      });
      currentSection = sectionName;

      blocks.push({
        type: "heading",
        raw: line,
        line: lineNum,
        metadata: {
          level,
          shortCode: shortCode ?? null,
          title: sectionName
        }
      });
      continue;
    }

    // Parse requirement blocks (:::requirement{...})
    if (!inRequirementBlock && line.trim().startsWith(":::requirement")) {
      flushRawBuffer();
      inRequirementBlock = true;
      requirementStartLine = lineNum;
      requirementLines = [rawLine];

      const attrMatch = line.match(/:::requirement\{([^}]+)\}/);
      currentRequirement = {
        line: lineNum,
        sectionName: currentSection
      };

      if (attrMatch) {
        const attrs = attrMatch[1];
        const idMatch = attrs.match(/#([^\s]+)/);
        const titleMatch = attrs.match(/title="([^"]+)"/);

        if (idMatch) {
          currentRequirement.id = idMatch[1];
          currentRequirement.ref = idMatch[1];
        }
        if (titleMatch) currentRequirement.title = titleMatch[1];
      }
      continue;
    }

    // Parse info blocks (:::info{...})
    if (!inInfoBlock && line.trim().startsWith(":::info")) {
      flushRawBuffer();
      inInfoBlock = true;
      infoStartLine = lineNum;
      infoLines = [rawLine];

      const attrMatch = line.match(/:::info\{([^}]+)\}/);
      currentInfo = {
        line: lineNum,
        sectionName: currentSection
      };

      if (attrMatch) {
        const attrs = attrMatch[1];
        const idMatch = attrs.match(/#([^\s]+)/);
        const titleMatch = attrs.match(/title="([^"]+)"/);

        if (idMatch) currentInfo.id = idMatch[1];
        if (titleMatch) currentInfo.title = titleMatch[1];
      }
      continue;
    }

    if (inRequirementBlock) {
      requirementLines.push(rawLine);

      if (line.trim() === ":::") {
        if (currentRequirement) {
          if (currentRequirement.text) {
            requirements.push(currentRequirement as ParsedRequirement);
          }

          blocks.push({
            type: "requirement",
            raw: requirementLines.join("\n"),
            line: requirementStartLine,
            metadata: {
              ref: currentRequirement.ref ?? null,
              title: currentRequirement.title ?? null,
              sectionName: currentRequirement.sectionName ?? null
            }
          });
        }

        inRequirementBlock = false;
        currentRequirement = null;
        requirementLines = [];
        continue;
      }

      if (currentRequirement) {
        if (line.trim().startsWith("**Pattern:**")) {
          currentRequirement.pattern = line.replace(/\*\*Pattern:\*\*\s*/, "").trim();
        } else if (line.trim().startsWith("**Verification:**")) {
          currentRequirement.verification = line.replace(/\*\*Verification:\*\*\s*/, "").trim();
        } else if (line.trim() && !currentRequirement.text) {
          currentRequirement.text = line.trim();
        } else if (currentRequirement.text && line.trim()) {
          currentRequirement.text += " " + line.trim();
        }
      }
      continue;
    }

    if (inInfoBlock) {
      infoLines.push(rawLine);

      if (line.trim() === ":::") {
        if (currentInfo) {
          if (currentInfo.text) {
            infos.push(currentInfo as ParsedInfo);
          }

          blocks.push({
            type: "info",
            raw: infoLines.join("\n"),
            line: infoStartLine,
            metadata: {
              ref: currentInfo.ref ?? null,
              title: currentInfo.title ?? null,
              sectionName: currentInfo.sectionName ?? null
            }
          });
        }

        inInfoBlock = false;
        currentInfo = null;
        infoLines = [];
        continue;
      }

      if (currentInfo) {
        if (line.trim() && !currentInfo.text) {
          currentInfo.text = line.trim();
        } else if (currentInfo.text && line.trim()) {
          currentInfo.text += " " + line.trim();
        }
      }
      continue;
    }

    // Default handling: aggregate raw content
    addToRawBuffer(rawLine, lineNum);
  }

  flushRawBuffer();

  return {
    requirements,
    sections,
    infos,
    metadata,
    blocks
  };
}

/**
 * Validate markdown structure and content
 */
export async function validateMarkdownStructure(content: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const lines = content.split("\n");

  let inRequirementBlock = false;
  let requirementStartLine = 0;
  let requirementId: string | undefined;
  let requirementText: string | undefined;
  const seenIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const lineNum = i + 1;

    // Check for requirement block start
    if (line.trim().startsWith(":::requirement")) {
      if (inRequirementBlock) {
        errors.push({
          line: lineNum,
          severity: "error",
          message: "Nested requirement blocks are not allowed",
          type: "NESTED_REQUIREMENT"
        });
      }

      inRequirementBlock = true;
      requirementStartLine = lineNum;
      requirementText = undefined;

      // Validate requirement ID
      const attrMatch = line.match(/:::requirement\{([^}]+)\}/);
      if (attrMatch) {
        const idMatch = attrMatch[1].match(/#([^\s]+)/);
        if (idMatch) {
          requirementId = idMatch[1];
          if (seenIds.has(requirementId)) {
            errors.push({
              line: lineNum,
              severity: "error",
              message: `Duplicate requirement ID: ${requirementId}`,
              type: "DUPLICATE_ID"
            });
          } else {
            seenIds.add(requirementId);
          }
        } else {
          warnings.push({
            line: lineNum,
            severity: "warning",
            message: "Requirement block missing ID",
            type: "MISSING_ID"
          });
        }
      }
      continue;
    }

    // Check for requirement block end
    if (inRequirementBlock && line.trim() === ":::") {
      if (!requirementText) {
        errors.push({
          line: requirementStartLine,
          severity: "error",
          message: "Requirement block is empty",
          type: "EMPTY_REQUIREMENT"
        });
      } else {
        // Validate requirement text using QA rules
        const qaResult = analyzeRequirement(requirementText);
        if (qaResult.score < 70) {
          warnings.push({
            line: requirementStartLine,
            severity: "warning",
            message: `Low QA score (${qaResult.score}): ${qaResult.verdict}`,
            type: "LOW_QA_SCORE"
          });
        }
      }

      inRequirementBlock = false;
      requirementId = undefined;
      requirementText = undefined;
      continue;
    }

    // Capture requirement text
    if (inRequirementBlock && line.trim() && !line.trim().startsWith("**")) {
      if (!requirementText) {
        requirementText = line.trim();
      } else {
        requirementText += " " + line.trim();
      }
    }
  }

  // Check for unclosed requirement block
  if (inRequirementBlock) {
    errors.push({
      line: requirementStartLine,
      severity: "error",
      message: "Unclosed requirement block",
      type: "UNCLOSED_BLOCK"
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
