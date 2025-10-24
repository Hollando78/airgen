/**
 * Universal Document Parser
 * Handles parsing of multiple document formats (CSV, DOCX, ReqIF, Markdown, JSON)
 * with automatic field detection and confidence scoring
 */

import mammoth from 'mammoth';

export type DocumentFormat = 'csv' | 'docx' | 'reqif' | 'markdown' | 'json' | 'unknown';

export interface ParsedField {
  name: string;
  values: string[];
  sampleValues: string[];
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number; // 0-1
  reason: string;
}

export interface ParsedDocument {
  format: DocumentFormat;
  fields: ParsedField[];
  rows: Record<string, any>[];
  suggestedMappings: FieldMapping[];
  customFields: string[];
}

const STANDARD_FIELDS = [
  'text',
  'pattern',
  'verification',
  'tags',
  'priority',
  'status',
  'category',
  'source',
  'rationale',
  'ref',
  'id',
  'title'
];

/**
 * Detect file format based on extension and content
 */
export async function detectFileFormat(file: File): Promise<DocumentFormat> {
  const fileName = file.name.toLowerCase();

  // Check extension first
  if (fileName.endsWith('.csv')) return 'csv';
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) return 'docx';
  if (fileName.endsWith('.reqif') || fileName.endsWith('.xml')) return 'reqif';
  if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) return 'markdown';
  if (fileName.endsWith('.json')) return 'json';

  // Try content detection
  try {
    const text = await file.text();

    // Check for ReqIF XML
    if (text.trim().startsWith('<?xml') && text.includes('REQ-IF')) {
      return 'reqif';
    }

    // Check for JSON
    if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
      try {
        JSON.parse(text);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }

    // Check for markdown patterns
    if (text.includes(':::requirement') || /^###\s+REQ-/m.test(text)) {
      return 'markdown';
    }

    // Check for CSV (has commas and multiple lines)
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 1 && lines[0].includes(',')) {
      return 'csv';
    }
  } catch (error) {
    console.error('Error detecting format from content:', error);
  }

  return 'unknown';
}

/**
 * Detect which field a column likely maps to with confidence score
 */
function detectFieldMapping(fieldName: string, sampleValues: string[]): FieldMapping | null {
  const lower = fieldName.toLowerCase();
  const trimmedSamples = sampleValues.filter(v => v && v.trim()).slice(0, 5);

  // Text/Requirement field (highest priority)
  if (
    lower.includes('text') ||
    lower.includes('description') ||
    lower.includes('requirement') ||
    lower === 'req' ||
    lower.includes('statement')
  ) {
    return {
      sourceField: fieldName,
      targetField: 'text',
      confidence: 0.95,
      reason: 'Field name indicates requirement text'
    };
  }

  // Check sample values for long text (likely requirement text)
  const avgLength = trimmedSamples.reduce((sum, v) => sum + v.length, 0) / Math.max(trimmedSamples.length, 1);
  if (avgLength > 50 && trimmedSamples.length > 0) {
    return {
      sourceField: fieldName,
      targetField: 'text',
      confidence: 0.7,
      reason: 'Contains long text values (avg length > 50 chars)'
    };
  }

  // Pattern field
  if (lower.includes('pattern') || lower.includes('type')) {
    const hasEarsKeywords = trimmedSamples.some(v =>
      /ubiquitous|event|state|unwanted|optional|when|while|where|if/i.test(v)
    );
    return {
      sourceField: fieldName,
      targetField: 'pattern',
      confidence: hasEarsKeywords ? 0.9 : 0.7,
      reason: hasEarsKeywords ? 'Contains EARS pattern keywords' : 'Field name indicates pattern'
    };
  }

  // Verification field
  if (lower.includes('verification') || lower.includes('verify') || lower.includes('method')) {
    const hasVerificationMethods = trimmedSamples.some(v =>
      /test|analysis|inspection|demonstration/i.test(v)
    );
    return {
      sourceField: fieldName,
      targetField: 'verification',
      confidence: hasVerificationMethods ? 0.9 : 0.7,
      reason: hasVerificationMethods ? 'Contains verification method keywords' : 'Field name indicates verification'
    };
  }

  // ID/Reference field
  if (lower === 'id' || lower === 'ref' || lower === 'reference' || lower.includes('identifier')) {
    return {
      sourceField: fieldName,
      targetField: 'ref',
      confidence: 0.9,
      reason: 'Field name indicates reference ID'
    };
  }

  // Title field
  if (lower.includes('title') || lower.includes('name') || lower.includes('heading')) {
    return {
      sourceField: fieldName,
      targetField: 'title',
      confidence: 0.85,
      reason: 'Field name indicates title'
    };
  }

  // Priority field
  if (lower.includes('priority')) {
    return {
      sourceField: fieldName,
      targetField: 'priority',
      confidence: 0.9,
      reason: 'Field name indicates priority'
    };
  }

  // Status field
  if (lower.includes('status')) {
    return {
      sourceField: fieldName,
      targetField: 'status',
      confidence: 0.9,
      reason: 'Field name indicates status'
    };
  }

  // Category field
  if (lower.includes('category') || lower.includes('group')) {
    return {
      sourceField: fieldName,
      targetField: 'category',
      confidence: 0.85,
      reason: 'Field name indicates category'
    };
  }

  // Tags field
  if (lower.includes('tag') || lower.includes('label')) {
    return {
      sourceField: fieldName,
      targetField: 'tags',
      confidence: 0.85,
      reason: 'Field name indicates tags'
    };
  }

  // Source field
  if (lower.includes('source') || lower.includes('origin')) {
    return {
      sourceField: fieldName,
      targetField: 'source',
      confidence: 0.85,
      reason: 'Field name indicates source'
    };
  }

  // Rationale field
  if (lower.includes('rationale') || lower.includes('reason') || lower.includes('justification')) {
    return {
      sourceField: fieldName,
      targetField: 'rationale',
      confidence: 0.85,
      reason: 'Field name indicates rationale'
    };
  }

  return null;
}

/**
 * Proper CSV parsing that handles quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Normalize pattern values to standard EARS keywords
 */
function normalizePattern(pattern: string): string {
  if (!pattern) return "";
  const lower = pattern.toLowerCase();

  if (lower.includes('event') || lower.includes('when')) return 'event';
  if (lower.includes('state') || lower.includes('while')) return 'state';
  if (lower === 'ubiquitous' || lower.includes('ubiquitous')) return 'ubiquitous';
  if (lower.includes('unwanted') || lower.includes('if ')) return 'unwanted';
  if (lower.includes('optional') || lower.includes('where')) return 'optional';

  if (['event', 'state', 'ubiquitous', 'unwanted', 'optional'].includes(lower)) {
    return lower;
  }

  return pattern;
}

/**
 * Universal Parser Class
 */
export class UniversalParser {
  private format: DocumentFormat = 'unknown';

  async parse(file: File): Promise<ParsedDocument> {
    this.format = await detectFileFormat(file);

    switch (this.format) {
      case 'csv':
        return this.parseCSV(file);
      case 'docx':
        return this.parseDOCX(file);
      case 'reqif':
        return this.parseReqIF(file);
      case 'markdown':
        return this.parseMarkdown(file);
      case 'json':
        return this.parseJSON(file);
      default:
        throw new Error('Unknown or unsupported file format');
    }
  }

  private async parseCSV(file: File): Promise<ParsedDocument> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new Error("CSV file must have at least a header row and one data row");
    }

    const headers = parseCSVLine(lines[0]);
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, any> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }

    // Build fields with sample values
    const fields: ParsedField[] = headers.map(header => ({
      name: header,
      values: rows.map(r => String(r[header] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[header] || ''))
    }));

    // Detect field mappings
    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'csv',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }

  private async parseDOCX(file: File): Promise<ParsedDocument> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    // Parse HTML to extract tables and structured text
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try to extract requirements from tables first
    const tables = doc.querySelectorAll('table');
    if (tables.length > 0) {
      return this.parseDOCXTables(tables);
    }

    // Fallback to paragraph-based parsing
    return this.parseDOCXParagraphs(doc);
  }

  private parseDOCXTables(tables: NodeListOf<HTMLTableElement>): ParsedDocument {
    const rows: Record<string, any>[] = [];
    let headers: string[] = [];

    // Use the first table with headers
    for (const table of Array.from(tables)) {
      const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
      if (!headerRow) continue;

      const headerCells = headerRow.querySelectorAll('th, td');
      headers = Array.from(headerCells).map(cell => cell.textContent?.trim() || '');

      if (headers.length === 0) continue;

      const bodyRows = table.querySelectorAll('tbody tr, tr');
      for (let i = (headerRow.parentElement?.tagName === 'THEAD' ? 0 : 1); i < bodyRows.length; i++) {
        const row = bodyRows[i];
        const cells = row.querySelectorAll('td, th');
        const rowData: Record<string, any> = {};

        cells.forEach((cell, idx) => {
          const header = headers[idx] || `Column_${idx + 1}`;
          rowData[header] = cell.textContent?.trim() || '';
        });

        rows.push(rowData);
      }

      break; // Use only the first valid table
    }

    if (rows.length === 0) {
      throw new Error('No valid tables found in DOCX file');
    }

    const fields: ParsedField[] = headers.map(header => ({
      name: header,
      values: rows.map(r => String(r[header] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[header] || ''))
    }));

    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'docx',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }

  private parseDOCXParagraphs(doc: Document): ParsedDocument {
    const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    const rows: Record<string, any>[] = [];

    // Look for requirement patterns in paragraphs
    let currentReq: Record<string, any> | null = null;

    for (const p of Array.from(paragraphs)) {
      const text = p.textContent?.trim() || '';
      if (!text) continue;

      // Check for heading that looks like a requirement ID
      if (/^(REQ|REQUIREMENT)[\s\-_:]+\w+/i.test(text)) {
        // Save previous requirement
        if (currentReq && currentReq.text) {
          rows.push(currentReq);
        }

        // Start new requirement
        const match = text.match(/^(REQ[\w\-]+)[:\s]+(.+)/i);
        currentReq = {
          ref: match ? match[1] : text.split(/[\s:]/)[0],
          title: match ? match[2] : text,
          text: ''
        };
      } else if (currentReq) {
        // Check for field labels
        if (/^(pattern|type)[\s:]+/i.test(text)) {
          currentReq.pattern = text.replace(/^(pattern|type)[\s:]+/i, '').trim();
        } else if (/^(verification|verify)[\s:]+/i.test(text)) {
          currentReq.verification = text.replace(/^(verification|verify)[\s:]+/i, '').trim();
        } else if (/^(priority)[\s:]+/i.test(text)) {
          currentReq.priority = text.replace(/^(priority)[\s:]+/i, '').trim();
        } else if (/^(status)[\s:]+/i.test(text)) {
          currentReq.status = text.replace(/^(status)[\s:]+/i, '').trim();
        } else if (text.length > 10) {
          // Accumulate requirement text
          currentReq.text = currentReq.text ? currentReq.text + ' ' + text : text;
        }
      } else if (text.length > 50) {
        // Standalone requirement without ID
        rows.push({
          text,
          ref: `REQ-${rows.length + 1}`
        });
      }
    }

    // Don't forget the last requirement
    if (currentReq && currentReq.text) {
      rows.push(currentReq);
    }

    if (rows.length === 0) {
      throw new Error('No requirements found in DOCX file');
    }

    // Build fields from discovered data
    const allKeys = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });

    const fields: ParsedField[] = Array.from(allKeys).map(key => ({
      name: key,
      values: rows.map(r => String(r[key] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[key] || ''))
    }));

    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'docx',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }

  private async parseReqIF(file: File): Promise<ParsedDocument> {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    const specObjects = xmlDoc.getElementsByTagName("SPEC-OBJECT");
    const rows: Record<string, any>[] = [];

    for (let i = 0; i < specObjects.length; i++) {
      const specObject = specObjects[i];
      const row: Record<string, any> = {
        id: specObject.getAttribute("IDENTIFIER") || '',
        ref: specObject.getAttribute("LONG-NAME") || ''
      };

      const attributeValues = specObject.getElementsByTagName("ATTRIBUTE-VALUE-STRING");
      for (let j = 0; j < attributeValues.length; j++) {
        const attrValue = attributeValues[j];
        const definitionRef = attrValue.getElementsByTagName("ATTRIBUTE-DEFINITION-STRING-REF")[0];
        const attrName = definitionRef?.textContent?.trim() || '';
        const value = attrValue.getAttribute("THE-VALUE") || '';

        if (attrName && value) {
          row[attrName] = value;
        }
      }

      rows.push(row);
    }

    if (rows.length === 0) {
      throw new Error('No requirements found in ReqIF file');
    }

    const allKeys = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });

    const fields: ParsedField[] = Array.from(allKeys).map(key => ({
      name: key,
      values: rows.map(r => String(r[key] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[key] || ''))
    }));

    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'reqif',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }

  private async parseMarkdown(file: File): Promise<ParsedDocument> {
    const text = await file.text();
    const lines = text.split('\n');
    const rows: Record<string, any>[] = [];

    const hasBlockFormat = /:::requirement/.test(text);
    const hasHeadingFormat = /^###\s+REQ-/m.test(text);

    if (hasBlockFormat) {
      this.parseMarkdownBlocks(lines, rows);
    }

    if (hasHeadingFormat) {
      this.parseMarkdownHeadings(lines, rows);
    }

    if (rows.length === 0) {
      throw new Error("No requirements found in markdown file");
    }

    // Normalize patterns
    rows.forEach(row => {
      if (row.pattern) {
        row.pattern = normalizePattern(row.pattern);
      }
    });

    const allKeys = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });

    const fields: ParsedField[] = Array.from(allKeys).map(key => ({
      name: key,
      values: rows.map(r => String(r[key] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[key] || ''))
    }));

    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'markdown',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }

  private parseMarkdownBlocks(lines: string[], rows: Record<string, any>[]) {
    let inBlock = false;
    let currentReq: Record<string, any> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      if (!inBlock && line.trim().startsWith(":::requirement")) {
        inBlock = true;
        currentReq = {};

        const attrMatch = line.match(/:::requirement\{([^}]+)\}/);
        if (attrMatch) {
          const attrs = attrMatch[1];
          const idMatch = attrs.match(/#([^\s}]+)/);
          const titleMatch = attrs.match(/title="([^"]+)"/);

          if (idMatch) {
            currentReq.id = idMatch[1];
            currentReq.ref = idMatch[1];
          }
          if (titleMatch) {
            currentReq.title = titleMatch[1];
          }
        }
        continue;
      }

      if (inBlock && line.trim() === ":::") {
        if (currentReq && currentReq.text) {
          rows.push(currentReq);
        }
        inBlock = false;
        currentReq = null;
        continue;
      }

      if (inBlock && currentReq) {
        if (line.trim().startsWith("**Pattern:**")) {
          currentReq.pattern = line.replace(/\*\*Pattern:\*\*\s*/, "").trim();
        } else if (line.trim().startsWith("**Verification:**")) {
          currentReq.verification = line.replace(/\*\*Verification:\*\*\s*/, "").trim();
        } else if (line.trim() && !currentReq.text) {
          currentReq.text = line.trim();
        } else if (currentReq.text && line.trim()) {
          currentReq.text += " " + line.trim();
        }
      }
    }
  }

  private parseMarkdownHeadings(lines: string[], rows: Record<string, any>[]) {
    let currentReq: Record<string, any> | null = null;
    let currentField: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      const headingMatch = line.match(/^###\s+(REQ-[^\s:]+):\s*(.+)$/);
      if (headingMatch) {
        if (currentReq && currentReq.text) {
          rows.push(currentReq);
        }

        currentReq = {
          id: headingMatch[1],
          ref: headingMatch[1],
          title: headingMatch[2].trim()
        };
        currentField = null;
        continue;
      }

      if (currentReq) {
        const statementMatch = line.match(/^\*\*Statement:\*\*\s*(.+)$/);
        const patternMatch = line.match(/^\*\*Pattern:\*\*\s*(.+)$/);
        const verificationMatch = line.match(/^\*\*Verification:\*\*\s*(.+)$/);
        const priorityMatch = line.match(/^\*\*Priority:\*\*\s*(.+)$/);
        const sourceMatch = line.match(/^\*\*Source:\*\*\s*(.+)$/);

        if (statementMatch) {
          currentReq.text = statementMatch[1].trim();
          currentField = 'text';
        } else if (patternMatch) {
          currentReq.pattern = patternMatch[1].trim();
          currentField = null;
        } else if (verificationMatch) {
          currentReq.verification = verificationMatch[1].trim();
          currentField = null;
        } else if (priorityMatch) {
          currentReq.priority = priorityMatch[1].trim();
          currentField = null;
        } else if (sourceMatch) {
          currentReq.source = sourceMatch[1].trim();
          currentField = null;
        } else if (line.trim() && currentField === 'text') {
          currentReq.text += " " + line.trim();
        }
      }
    }

    if (currentReq && currentReq.text) {
      rows.push(currentReq);
    }
  }

  private async parseJSON(file: File): Promise<ParsedDocument> {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      throw new Error("JSON file must contain an array of requirements");
    }

    const rows = data as Record<string, any>[];

    if (rows.length === 0) {
      throw new Error('No requirements found in JSON file');
    }

    const allKeys = new Set<string>();
    rows.forEach(row => {
      Object.keys(row).forEach(key => allKeys.add(key));
    });

    const fields: ParsedField[] = Array.from(allKeys).map(key => ({
      name: key,
      values: rows.map(r => String(r[key] || '')),
      sampleValues: rows.slice(0, 5).map(r => String(r[key] || ''))
    }));

    const suggestedMappings: FieldMapping[] = [];
    const customFields: string[] = [];

    fields.forEach(field => {
      const mapping = detectFieldMapping(field.name, field.sampleValues);
      if (mapping) {
        suggestedMappings.push(mapping);
      } else {
        customFields.push(field.name);
      }
    });

    return {
      format: 'json',
      fields,
      rows,
      suggestedMappings,
      customFields
    };
  }
}
