import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AirgenClient } from "../client.js";
import { ok, formatError, truncate } from "../format.js";

// ── CSV helpers ───────────────────────────────────────────────

function parseCsv(content: string): { headers: string[]; rows: string[][] } {
  const result: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field.trim());
        if (current.some((c) => c !== "")) result.push(current);
        current = [];
        field = "";
        if (ch === "\r") i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }
  // Last field
  current.push(field.trim());
  if (current.some((c) => c !== "")) result.push(current);

  if (result.length === 0) return { headers: [], rows: [] };
  return { headers: result[0], rows: result.slice(1) };
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\n");
}

// ── ReqIF helpers ─────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractReqifSpecObjects(
  xml: string,
  textAttr: string,
  externalIdAttr?: string,
  rationaleAttr?: string,
): Array<{ text: string; externalId?: string; rationale?: string }> {
  const results: Array<{ text: string; externalId?: string; rationale?: string }> = [];

  // Simple regex-based extraction of SPEC-OBJECT elements
  const specObjectRegex = /<SPEC-OBJECT[\s\S]*?<\/SPEC-OBJECT>/g;
  let match;
  while ((match = specObjectRegex.exec(xml)) !== null) {
    const obj = match[0];
    const item: { text: string; externalId?: string; rationale?: string } = {
      text: "",
    };

    // Extract attribute values by definition ref
    const attrValueRegex =
      /<ATTRIBUTE-VALUE-STRING[\s\S]*?<\/ATTRIBUTE-VALUE-STRING>/g;
    let attrMatch;
    while ((attrMatch = attrValueRegex.exec(obj)) !== null) {
      const attrBlock = attrMatch[0];
      const theValue = attrBlock.match(/THE-VALUE="([^"]*)"/)?.[1] ?? "";
      const defRef =
        attrBlock.match(/ATTRIBUTE-DEFINITION-STRING-REF>([^<]*)</)?.[1] ?? "";

      if (defRef === textAttr || defRef.includes(textAttr)) {
        item.text = theValue;
      }
      if (externalIdAttr && (defRef === externalIdAttr || defRef.includes(externalIdAttr))) {
        item.externalId = theValue;
      }
      if (rationaleAttr && (defRef === rationaleAttr || defRef.includes(rationaleAttr))) {
        item.rationale = theValue;
      }
    }

    // Also check XHTML content
    const xhtmlRegex =
      /<ATTRIBUTE-VALUE-XHTML[\s\S]*?<\/ATTRIBUTE-VALUE-XHTML>/g;
    let xhtmlMatch;
    while ((xhtmlMatch = xhtmlRegex.exec(obj)) !== null) {
      const xhtmlBlock = xhtmlMatch[0];
      const defRef =
        xhtmlBlock.match(/ATTRIBUTE-DEFINITION-XHTML-REF>([^<]*)</)?.[1] ?? "";
      // Strip HTML tags to get plain text
      const content = xhtmlBlock
        .match(/<THE-VALUE>([\s\S]*?)<\/THE-VALUE>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ?? "";

      if (defRef === textAttr || defRef.includes(textAttr)) {
        item.text = content;
      }
    }

    if (item.text) results.push(item);
  }

  return results;
}

// ── Types ─────────────────────────────────────────────────────

interface ReqResult {
  id?: string;
  ref?: string;
  text?: string;
  qaScore?: number;
}

interface FullRequirement {
  id?: string;
  ref?: string;
  text?: string;
  pattern?: string;
  verification?: string;
  tags?: string[];
  qaScore?: number | null;
  complianceStatus?: string;
  complianceRationale?: string;
  rationale?: string;
  documentSlug?: string;
  sectionId?: string;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string | null;
}

interface TraceLink {
  sourceRequirementId?: string;
  targetRequirementId?: string;
  linkType?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

async function fetchAllRequirements(
  client: AirgenClient,
  tenant: string,
  project: string,
): Promise<FullRequirement[]> {
  const all: FullRequirement[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get<{
      items: FullRequirement[];
      total: number;
      pages: number;
    }>(`/requirements/${tenant}/${project}`, {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    all.push(...(data.items ?? []));
    if (page >= (data.pages ?? 1)) break;
  }
  return all.filter((r) => !r.deleted && !r.deletedAt);
}

export function registerImportExportTools(
  server: McpServer,
  client: AirgenClient,
) {
  // ── import_requirements_csv ─────────────────────────────────
  server.tool(
    "import_requirements_csv",
    "Bulk import requirements from CSV data. First row must be headers. Supports dry-run mode for validation.",
    {
      projectKey: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      csvContent: z
        .string()
        .describe("CSV content as a string. First row must be headers."),
      columnMapping: z
        .object({
          text: z.string().describe("Column name for requirement text (required)"),
          externalId: z
            .string()
            .optional()
            .describe("Column name for external ID"),
          pattern: z.string().optional().describe("Column name for EARS pattern"),
          verification: z
            .string()
            .optional()
            .describe("Column name for verification method"),
          tags: z
            .string()
            .optional()
            .describe("Column name for tags (comma-separated)"),
          rationale: z
            .string()
            .optional()
            .describe("Column name for rationale"),
        })
        .describe("Maps CSV column headers to AIRGen fields"),
      documentSlug: z
        .string()
        .optional()
        .describe("Assign all imported requirements to this document"),
      sectionId: z
        .string()
        .optional()
        .describe("Assign all imported requirements to this section"),
      tagAll: z
        .array(z.string())
        .optional()
        .describe("Apply these tags to all imported requirements"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "If true, validate without creating. Default: false",
        ),
    },
    async ({
      projectKey,
      tenant,
      csvContent,
      columnMapping,
      documentSlug,
      sectionId,
      tagAll,
      dryRun,
    }) => {
      try {
        const isDryRun = dryRun ?? false;
        const { headers, rows } = parseCsv(csvContent);

        if (headers.length === 0) {
          return ok("CSV is empty or has no headers.");
        }

        // Resolve column indices
        const textIdx = headers.indexOf(columnMapping.text);
        if (textIdx === -1) {
          return ok(
            `Column '${columnMapping.text}' not found in CSV headers: ${headers.join(", ")}`,
          );
        }

        const extIdIdx = columnMapping.externalId
          ? headers.indexOf(columnMapping.externalId)
          : -1;
        const patternIdx = columnMapping.pattern
          ? headers.indexOf(columnMapping.pattern)
          : -1;
        const verificationIdx = columnMapping.verification
          ? headers.indexOf(columnMapping.verification)
          : -1;
        const tagsIdx = columnMapping.tags
          ? headers.indexOf(columnMapping.tags)
          : -1;
        const rationaleIdx = columnMapping.rationale
          ? headers.indexOf(columnMapping.rationale)
          : -1;

        const created: ReqResult[] = [];
        const skipped: Array<{ row: number; reason: string }> = [];
        const errors: Array<{ row: number; error: string }> = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNum = i + 2; // 1-indexed + header

          const text = row[textIdx]?.trim();
          if (!text) {
            skipped.push({ row: rowNum, reason: "Empty text field" });
            continue;
          }

          const body: Record<string, unknown> = {
            tenant,
            projectKey,
            text,
          };

          if (documentSlug) body.documentSlug = documentSlug;
          if (sectionId) body.sectionId = sectionId;

          // Pattern
          if (patternIdx >= 0 && row[patternIdx]) {
            const p = row[patternIdx].trim().toLowerCase();
            const valid = ["ubiquitous", "event", "state", "unwanted", "optional"];
            if (valid.includes(p)) body.pattern = p;
          }

          // Verification
          if (verificationIdx >= 0 && row[verificationIdx]) {
            const v = row[verificationIdx].trim();
            const valid = ["Test", "Analysis", "Inspection", "Demonstration"];
            const match = valid.find(
              (m) => m.toLowerCase() === v.toLowerCase(),
            );
            if (match) body.verification = match;
          }

          // Tags
          const rowTags: string[] = [...(tagAll ?? [])];
          if (tagsIdx >= 0 && row[tagsIdx]) {
            rowTags.push(
              ...row[tagsIdx]
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            );
          }
          if (rowTags.length > 0) body.tags = rowTags;

          // Rationale
          if (rationaleIdx >= 0 && row[rationaleIdx]) {
            body.rationale = row[rationaleIdx].trim();
          }

          if (isDryRun) {
            created.push({ text, ref: `(dry-run-${rowNum})` });
            continue;
          }

          try {
            const data = await client.post<{ requirement: ReqResult }>(
              "/requirements",
              body,
            );
            created.push(data.requirement);
          } catch (err) {
            errors.push({
              row: rowNum,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const lines = [
          `## CSV Import ${isDryRun ? "(DRY RUN)" : "Results"}\n`,
          `- **${isDryRun ? "Would import" : "Imported"}:** ${created.length}`,
          `- **Skipped:** ${skipped.length}`,
          `- **Failed:** ${errors.length}`,
          `- **Total rows:** ${rows.length}\n`,
        ];

        if (skipped.length > 0) {
          lines.push(`### Skipped Rows\n`);
          for (const s of skipped) {
            lines.push(`- Row ${s.row}: ${s.reason}`);
          }
        }

        if (errors.length > 0) {
          lines.push(`\n### Errors\n`);
          for (const e of errors) {
            lines.push(`- Row ${e.row}: ${e.error}`);
          }
        }

        if (!isDryRun && created.length > 0) {
          lines.push(`\n### Created Requirements\n`);
          for (const r of created.slice(0, 20)) {
            const score = r.qaScore != null ? ` (QA: ${r.qaScore})` : "";
            lines.push(`- **${r.ref ?? "?"}**${score}: ${truncate(r.text ?? "", 80)}`);
          }
          if (created.length > 20)
            lines.push(`_... and ${created.length - 20} more_`);
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── export_requirements_csv ─────────────────────────────────
  server.tool(
    "export_requirements_csv",
    "Export requirements as CSV. Returns the CSV content as text.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("Export only this document. Omit for all."),
      includeFields: z
        .array(z.string())
        .optional()
        .describe(
          "Fields to include. Options: ref, text, pattern, verification, tags, qaScore, complianceStatus, complianceRationale, rationale, documentSlug, createdAt, updatedAt. Default: all.",
        ),
      includeTraceLinks: z
        .boolean()
        .optional()
        .describe("Add columns for trace links. Default: false"),
    },
    async ({ project, tenant, documentSlug, includeFields, includeTraceLinks }) => {
      try {
        let requirements: FullRequirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{
              id: string;
              title?: string;
              name?: string;
              requirements?: Array<FullRequirement>;
            }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
          requirements = [];
          for (const sec of secData.sections ?? []) {
            for (const r of sec.requirements ?? []) {
              requirements.push({ ...r, documentSlug });
            }
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

        if (requirements.length === 0) {
          return ok("No requirements to export.");
        }

        // Determine fields
        const allFields = [
          "ref",
          "text",
          "pattern",
          "verification",
          "tags",
          "qaScore",
          "complianceStatus",
          "complianceRationale",
          "rationale",
          "documentSlug",
          "createdAt",
          "updatedAt",
        ];
        const fields = includeFields?.length ? includeFields : allFields;

        // Build trace link columns if requested
        let linkMap: Map<string, string[]> | undefined;
        if (includeTraceLinks) {
          const linkData = await client.get<{ traceLinks: TraceLink[] }>(
            `/trace-links/${tenant}/${project}`,
          );
          linkMap = new Map();
          for (const link of linkData.traceLinks ?? []) {
            const src = link.sourceRequirementId ?? "";
            const tgt = link.targetRequirementId ?? "";
            const lt = link.linkType ?? "";
            if (!linkMap.has(src))
              linkMap.set(src, []);
            linkMap.get(src)!.push(`${lt}→${tgt}`);
            if (!linkMap.has(tgt))
              linkMap.set(tgt, []);
            linkMap.get(tgt)!.push(`${lt}←${src}`);
          }
        }

        const headers = [...fields];
        if (includeTraceLinks) headers.push("traceLinks");

        const rows = requirements.map((r) => {
          const row = fields.map((f) => {
            const val = (r as Record<string, unknown>)[f];
            if (Array.isArray(val)) return val.join(", ");
            if (val == null) return "";
            return String(val);
          });
          if (includeTraceLinks) {
            row.push((linkMap?.get(r.id ?? "") ?? []).join("; "));
          }
          return row;
        });

        const csv = generateCsv(headers, rows);
        return ok(csv);
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── import_reqif ────────────────────────────────────────────
  server.tool(
    "import_reqif",
    "Import requirements from ReqIF XML format (standard interchange for DOORS, Polarion, etc.). Supports dry-run mode.",
    {
      projectKey: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      reqifContent: z
        .string()
        .describe("ReqIF XML content as a string"),
      attributeMapping: z
        .object({
          text: z
            .string()
            .describe(
              "ReqIF attribute name for requirement text (e.g. 'ReqIF.Text', 'Object Text')",
            ),
          externalId: z
            .string()
            .optional()
            .describe("ReqIF attribute for ID"),
          rationale: z
            .string()
            .optional()
            .describe("ReqIF attribute for rationale"),
        })
        .describe("Maps ReqIF attributes to AIRGen fields"),
      documentSlug: z
        .string()
        .optional()
        .describe("Assign all imported requirements to this document"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Validate without importing. Default: false"),
    },
    async ({
      projectKey,
      tenant,
      reqifContent,
      attributeMapping,
      documentSlug,
      dryRun,
    }) => {
      try {
        const isDryRun = dryRun ?? false;

        const items = extractReqifSpecObjects(
          reqifContent,
          attributeMapping.text,
          attributeMapping.externalId,
          attributeMapping.rationale,
        );

        if (items.length === 0) {
          return ok(
            "No requirements found in ReqIF content. Check that the attributeMapping.text matches the correct attribute definition identifier.",
          );
        }

        const created: ReqResult[] = [];
        const errors: Array<{ index: number; error: string }> = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.text.trim()) continue;

          if (isDryRun) {
            created.push({
              text: item.text,
              ref: `(dry-run-${i + 1})`,
            });
            continue;
          }

          try {
            const body: Record<string, unknown> = {
              tenant,
              projectKey,
              text: item.text,
            };
            if (item.rationale) body.rationale = item.rationale;
            if (documentSlug) body.documentSlug = documentSlug;
            if (item.externalId) {
              body.tags = [`external:${item.externalId}`];
            }

            const data = await client.post<{ requirement: ReqResult }>(
              "/requirements",
              body,
            );
            created.push(data.requirement);
          } catch (err) {
            errors.push({
              index: i,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const lines = [
          `## ReqIF Import ${isDryRun ? "(DRY RUN)" : "Results"}\n`,
          `- **Parsed spec objects:** ${items.length}`,
          `- **${isDryRun ? "Would import" : "Imported"}:** ${created.length}`,
          `- **Failed:** ${errors.length}\n`,
        ];

        if (errors.length > 0) {
          lines.push(`### Errors\n`);
          for (const e of errors.slice(0, 10)) {
            lines.push(`- Item ${e.index}: ${e.error}`);
          }
          if (errors.length > 10)
            lines.push(`_... and ${errors.length - 10} more_`);
        }

        if (!isDryRun && created.length > 0) {
          lines.push(`\n### Created\n`);
          for (const r of created.slice(0, 20)) {
            const score = r.qaScore != null ? ` (QA: ${r.qaScore})` : "";
            lines.push(`- **${r.ref ?? "?"}**${score}: ${truncate(r.text ?? "", 80)}`);
          }
          if (created.length > 20)
            lines.push(`_... and ${created.length - 20} more_`);
        }

        return ok(lines.join("\n"));
      } catch (err) {
        return formatError(err);
      }
    },
  );

  // ── export_reqif ────────────────────────────────────────────
  server.tool(
    "export_reqif",
    "Export requirements as ReqIF XML for interchange with DOORS, Polarion, and other RM tools.",
    {
      project: z.string().describe("Project slug"),
      tenant: z.string().describe("Tenant slug"),
      documentSlug: z
        .string()
        .optional()
        .describe("Export this document. Omit for entire project."),
      includeTraceLinks: z
        .boolean()
        .optional()
        .describe("Include trace links as SpecRelations. Default: true"),
    },
    async ({ project, tenant, documentSlug, includeTraceLinks }) => {
      try {
        const withLinks = includeTraceLinks !== false;

        let requirements: FullRequirement[];
        if (documentSlug) {
          const secData = await client.get<{
            sections: Array<{ requirements?: Array<FullRequirement> }>;
          }>(`/sections/${tenant}/${project}/${documentSlug}/full`);
          requirements = [];
          for (const sec of secData.sections ?? []) {
            requirements.push(...(sec.requirements ?? []));
          }
        } else {
          requirements = await fetchAllRequirements(client, tenant, project);
        }

        let links: TraceLink[] = [];
        if (withLinks) {
          const linkData = await client.get<{ traceLinks: TraceLink[] }>(
            `/trace-links/${tenant}/${project}`,
          );
          links = linkData.traceLinks ?? [];

          // Filter to only links involving exported requirements
          const exportedIds = new Set(requirements.map((r) => r.id));
          links = links.filter(
            (l) =>
              exportedIds.has(l.sourceRequirementId ?? "") ||
              exportedIds.has(l.targetRequirementId ?? ""),
          );
        }

        const now = new Date().toISOString();
        const docTitle = documentSlug ?? project;

        // Generate ReqIF XML
        const specObjects = requirements
          .map(
            (r) => `      <SPEC-OBJECT IDENTIFIER="${escapeXml(r.id ?? "")}" LAST-CHANGE="${now}">
        <VALUES>
          <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(r.ref ?? "")}">
            <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>attr-ref</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
          </ATTRIBUTE-VALUE-STRING>
          <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(r.text ?? "")}">
            <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>attr-text</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
          </ATTRIBUTE-VALUE-STRING>${
            r.rationale
              ? `
          <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(r.rationale)}">
            <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>attr-rationale</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
          </ATTRIBUTE-VALUE-STRING>`
              : ""
          }
        </VALUES>
        <TYPE><SPEC-OBJECT-TYPE-REF>req-type</SPEC-OBJECT-TYPE-REF></TYPE>
      </SPEC-OBJECT>`,
          )
          .join("\n");

        const specRelations = links
          .map(
            (l, i) => `      <SPEC-RELATION IDENTIFIER="rel-${i}" LAST-CHANGE="${now}">
        <SOURCE><SPEC-OBJECT-REF>${escapeXml(l.sourceRequirementId ?? "")}</SPEC-OBJECT-REF></SOURCE>
        <TARGET><SPEC-OBJECT-REF>${escapeXml(l.targetRequirementId ?? "")}</SPEC-OBJECT-REF></TARGET>
        <TYPE><SPEC-RELATION-TYPE-REF>trace-link-type</SPEC-RELATION-TYPE-REF></TYPE>
      </SPEC-RELATION>`,
          )
          .join("\n");

        const specHierarchy = requirements
          .map(
            (r) =>
              `          <SPEC-HIERARCHY IDENTIFIER="hier-${escapeXml(r.id ?? "")}"><OBJECT><SPEC-OBJECT-REF>${escapeXml(r.id ?? "")}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>`,
          )
          .join("\n");

        const reqif = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="header-${project}">
      <CREATION-TIME>${now}</CREATION-TIME>
      <REQ-IF-TOOL-ID>AIRGen</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>AIRGen</SOURCE-TOOL-ID>
      <TITLE>${escapeXml(docTitle)}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="string-type" LAST-CHANGE="${now}" MAX-LENGTH="65535"/>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="req-type" LAST-CHANGE="${now}">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="attr-ref" LAST-CHANGE="${now}">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>string-type</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="attr-text" LAST-CHANGE="${now}">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>string-type</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="attr-rationale" LAST-CHANGE="${now}">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>string-type</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
        <SPEC-RELATION-TYPE IDENTIFIER="trace-link-type" LAST-CHANGE="${now}"/>
        <SPECIFICATION-TYPE IDENTIFIER="spec-type" LAST-CHANGE="${now}"/>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
${specObjects}
      </SPEC-OBJECTS>
      <SPEC-RELATIONS>
${specRelations}
      </SPEC-RELATIONS>
      <SPECIFICATIONS>
        <SPECIFICATION IDENTIFIER="spec-${escapeXml(docTitle)}" LAST-CHANGE="${now}">
          <TYPE><SPECIFICATION-TYPE-REF>spec-type</SPECIFICATION-TYPE-REF></TYPE>
          <CHILDREN>
${specHierarchy}
          </CHILDREN>
        </SPECIFICATION>
      </SPECIFICATIONS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;

        return ok(reqif);
      } catch (err) {
        return formatError(err);
      }
    },
  );
}
