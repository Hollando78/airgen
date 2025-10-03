import { analyzeRequirement } from "@airgen/req-qa";

export type ParsedRequirement = {
  id?: string;
  text: string;
  title?: string;
  pattern?: string;
  verification?: string;
  line: number;
};

export type ParsedSection = {
  name: string;
  shortCode?: string;
  level: number;
  line: number;
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
  metadata: Record<string, unknown>;
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
  let metadata: Record<string, unknown> = {};

  let inRequirementBlock = false;
  let currentRequirement: Partial<ParsedRequirement> | null = null;
  let requirementStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
        // Simple YAML parsing (key: value format)
        yamlLines.forEach(yamlLine => {
          const match = yamlLine.match(/^(\w+):\s*(.+)$/);
          if (match) {
            metadata[match[1]] = match[2].trim();
          }
        });
        i = j; // Skip past frontmatter
        continue;
      }
    }

    // Parse section headers (# Header or # [CODE] Header)
    const headerMatch = line.match(/^(#{1,6})\s+(?:\[([^\]]+)\]\s+)?(.+)$/);
    if (headerMatch) {
      sections.push({
        level: headerMatch[1].length,
        shortCode: headerMatch[2],
        name: headerMatch[3].trim(),
        line: lineNum
      });
      continue;
    }

    // Parse requirement blocks (:::requirement{...})
    if (line.trim().startsWith(":::requirement")) {
      inRequirementBlock = true;
      requirementStartLine = lineNum;

      // Parse attributes from directive
      const attrMatch = line.match(/:::requirement\{([^}]+)\}/);
      currentRequirement = {
        line: lineNum
      };

      if (attrMatch) {
        const attrs = attrMatch[1];
        const idMatch = attrs.match(/#([^\s]+)/);
        const titleMatch = attrs.match(/title="([^"]+)"/);

        if (idMatch) currentRequirement.id = idMatch[1];
        if (titleMatch) currentRequirement.title = titleMatch[1];
      }
      continue;
    }

    // End of requirement block
    if (inRequirementBlock && line.trim() === ":::") {
      if (currentRequirement && currentRequirement.text) {
        requirements.push(currentRequirement as ParsedRequirement);
      }
      inRequirementBlock = false;
      currentRequirement = null;
      continue;
    }

    // Parse requirement content
    if (inRequirementBlock && currentRequirement) {
      if (line.trim().startsWith("**Pattern:**")) {
        currentRequirement.pattern = line.replace(/\*\*Pattern:\*\*\s*/, "").trim();
      } else if (line.trim().startsWith("**Verification:**")) {
        currentRequirement.verification = line.replace(/\*\*Verification:\*\*\s*/, "").trim();
      } else if (line.trim() && !currentRequirement.text) {
        // First non-empty line is the requirement text
        currentRequirement.text = line.trim();
      } else if (currentRequirement.text && line.trim()) {
        // Continuation of requirement text
        currentRequirement.text += " " + line.trim();
      }
    }
  }

  return {
    requirements,
    sections,
    metadata
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
    const line = lines[i];
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
