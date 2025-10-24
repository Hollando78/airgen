#!/usr/bin/env node
/**
 * Convert SYSTEM_REQUIREMENTS.md to ReqIF format
 */

import * as fs from 'fs';
import * as path from 'path';

interface Requirement {
  id: string;
  title: string;
  statement: string;
  pattern: string;
  verification: string;
  priority: string;
  source: string;
}

function parseSystemRequirements(filePath: string): Requirement[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const requirements: Requirement[] = [];

  let currentRequirement: Partial<Requirement> | null = null;
  let currentField: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Match heading format: ### REQ-SYS-001: Title
    const headingMatch = line.match(/^###\s+(REQ-[^\s:]+):\s*(.+)$/);
    if (headingMatch) {
      // Save previous requirement
      if (currentRequirement && currentRequirement.statement) {
        requirements.push(currentRequirement as Requirement);
      }

      // Start new requirement
      currentRequirement = {
        id: headingMatch[1],
        title: headingMatch[2].trim(),
        statement: '',
        pattern: '',
        verification: '',
        priority: '',
        source: ''
      };
      currentField = null;
      continue;
    }

    // Parse field lines
    if (currentRequirement) {
      const statementMatch = line.match(/^\*\*Statement:\*\*\s*(.+)$/);
      const patternMatch = line.match(/^\*\*Pattern:\*\*\s*(.+)$/);
      const verificationMatch = line.match(/^\*\*Verification:\*\*\s*(.+)$/);
      const priorityMatch = line.match(/^\*\*Priority:\*\*\s*(.+)$/);
      const sourceMatch = line.match(/^\*\*Source:\*\*\s*(.+)$/);

      if (statementMatch) {
        currentRequirement.statement = statementMatch[1].trim();
        currentField = 'statement';
      } else if (patternMatch) {
        currentRequirement.pattern = patternMatch[1].trim();
        currentField = null;
      } else if (verificationMatch) {
        currentRequirement.verification = verificationMatch[1].trim();
        currentField = null;
      } else if (priorityMatch) {
        currentRequirement.priority = priorityMatch[1].trim();
        currentField = null;
      } else if (sourceMatch) {
        currentRequirement.source = sourceMatch[1].trim();
        currentField = null;
      } else if (line.trim() && currentField === 'statement') {
        // Continue multi-line statement
        currentRequirement.statement += " " + line.trim();
      }
    }
  }

  // Don't forget the last requirement
  if (currentRequirement && currentRequirement.statement) {
    requirements.push(currentRequirement as Requirement);
  }

  return requirements;
}

function generateReqIF(requirements: Requirement[]): string {
  const timestamp = new Date().toISOString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="AIRGEN-SYS-REQ">
      <COMMENT>AIRGen System Requirements exported from SYSTEM_REQUIREMENTS.md</COMMENT>
      <CREATION-TIME>${timestamp}</CREATION-TIME>
      <REPOSITORY-ID>airgen-system</REPOSITORY-ID>
      <REQ-IF-TOOL-ID>AIRGen</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>AIRGen-Markdown-Converter</SOURCE-TOOL-ID>
      <TITLE>AIRGen System Requirements Specification</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="DT-String" LONG-NAME="String" MAX-LENGTH="4096"/>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="SPEC-OBJECT-TYPE-Requirement" LONG-NAME="Requirement">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-ID" LONG-NAME="ID">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Title" LONG-NAME="Title">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Statement" LONG-NAME="Statement">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Pattern" LONG-NAME="Pattern">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Verification" LONG-NAME="Verification">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Priority" LONG-NAME="Priority">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-Source" LONG-NAME="Source">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
        <SPECIFICATION-TYPE IDENTIFIER="SPEC-TYPE-Document" LONG-NAME="Document">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-DocTitle" LONG-NAME="Title">
              <TYPE>
                <DATATYPE-DEFINITION-STRING-REF>DT-String</DATATYPE-DEFINITION-STRING-REF>
              </TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
          </SPEC-ATTRIBUTES>
        </SPECIFICATION-TYPE>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
`;

  // Add each requirement as a SPEC-OBJECT
  requirements.forEach(req => {
    xml += `        <SPEC-OBJECT IDENTIFIER="${req.id}" LONG-NAME="${escapeXml(req.title)}">
          <TYPE>
            <SPEC-OBJECT-TYPE-REF>SPEC-OBJECT-TYPE-Requirement</SPEC-OBJECT-TYPE-REF>
          </TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.id)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-ID</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.title)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Title</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.statement)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Statement</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.pattern)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Pattern</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.verification)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Verification</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.priority)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Priority</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(req.source)}">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-Source</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
          </VALUES>
        </SPEC-OBJECT>
`;
  });

  xml += `      </SPEC-OBJECTS>
      <SPECIFICATIONS>
        <SPECIFICATION IDENTIFIER="SPEC-Document" LONG-NAME="AIRGen System Requirements Specification">
          <TYPE>
            <SPECIFICATION-TYPE-REF>SPEC-TYPE-Document</SPECIFICATION-TYPE-REF>
          </TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="AIRGen System Requirements Specification">
              <DEFINITION>
                <ATTRIBUTE-DEFINITION-STRING-REF>AD-DocTitle</ATTRIBUTE-DEFINITION-STRING-REF>
              </DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
          </VALUES>
          <CHILDREN>
`;

  // Add all requirements as children of the specification
  requirements.forEach(req => {
    xml += `            <SPEC-HIERARCHY IDENTIFIER="SPEC-HIER-${req.id}">
              <OBJECT>
                <SPEC-OBJECT-REF>${req.id}</SPEC-OBJECT-REF>
              </OBJECT>
            </SPEC-HIERARCHY>
`;
  });

  xml += `          </CHILDREN>
        </SPECIFICATION>
      </SPECIFICATIONS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>
`;

  return xml;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Main execution
const mdPath = path.join(process.cwd(), 'docs', 'SYSTEM_REQUIREMENTS.md');
const reqifPath = path.join(process.cwd(), 'docs', 'SYSTEM_REQUIREMENTS.reqif');

console.log('Parsing SYSTEM_REQUIREMENTS.md...');
const requirements = parseSystemRequirements(mdPath);
console.log(`Found ${requirements.length} requirements`);

console.log('Generating ReqIF XML...');
const reqifXml = generateReqIF(requirements);

console.log(`Writing to ${reqifPath}...`);
fs.writeFileSync(reqifPath, reqifXml, 'utf-8');

console.log('✅ Conversion complete!');
console.log(`📄 Output: ${reqifPath}`);
console.log(`📊 Total requirements: ${requirements.length}`);
