# AIRGen AI Capabilities and Extensions

**Version:** 1.0
**Date:** 2025-10-09
**Status:** Comprehensive analysis of current capabilities with proposed extensions

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current AI Capabilities](#current-ai-capabilities)
3. [Prompt Engineering Patterns](#prompt-engineering-patterns)
4. [Quality Assurance System](#quality-assurance-system)
5. [Gaps and Opportunities](#gaps-and-opportunities)
6. [Proposed Extensions](#proposed-extensions)
7. [Implementation Priorities](#implementation-priorities)
8. [Technical Architecture](#technical-architecture)

---

## Executive Summary

AIRGen currently leverages OpenAI's LLM for **two primary generation tasks**:

1. **Requirements Generation** – ISO/IEC/IEEE 29148 compliant requirements with EARS patterns
2. **Architecture Diagram Generation** – Hierarchical SysML block diagrams

The system employs sophisticated prompt engineering with structured JSON outputs, context injection from documents/diagrams, and an internal quality assurance engine (`@airgen/req-qa`) that scores requirements against 7 validation rules.

**Key Strengths:**
- Strict adherence to standards (ISO 29148, EARS)
- Deterministic QA scoring
- Context-aware generation (document and diagram attachments)
- Smart fix capabilities
- Candidate workflow (pending → accepted/rejected)

**Key Gaps:**
- No automated trace link generation
- No test case generation
- No safety/hazard analysis
- No consistency checking across documents
- No natural language query interface
- Limited verification method intelligence

---

## Current AI Capabilities

### 1. Requirements Generation

**File:** `backend/src/services/llm.ts`, `backend/src/services/drafting.ts`, `backend/src/routes/airgen.ts`

**Features:**
- Generates requirements from stakeholder instructions
- Supports EARS patterns (ubiquitous, event, state, unwanted, optional)
- Auto-detects requirement pattern from text structure
- Assigns verification methods (Test, Analysis, Inspection, Demonstration)
- Scores every generated requirement via `@airgen/req-qa`
- Temperature: **0.2** (low for consistency and determinism)

**Context Injection:**
- **Document Context** – Extracts content from native (structured) or surrogate (PDF) documents
- **Diagram Context** – Extracts existing architecture diagrams
- **Glossary** – Domain-specific terminology
- **Constraints** – Project-specific rules and limitations

**Output Format:**
```json
{
  "candidates": [
    "The system shall process sensor input within 100ms.",
    "When the brake pedal is pressed, the system shall activate the ABS within 50ms."
  ]
}
```

**Candidate Workflow:**
1. LLM generates 1-N candidates with QA scores
2. User reviews candidates in UI (`frontend/src/routes/AirGenRoute.tsx`)
3. User can:
   - **Accept** – Adds to requirements database with chosen section/document
   - **Reject** – Marks as rejected (archived)
   - **Return** – Resets to pending for further review
   - **Smart Fix** – Re-runs through LLM for automatic improvement
   - **Re-run QA** – Recalculates QA score after manual edits

**Prompt Pattern:**
```typescript
const sys = [
  "You are a systems requirements engineer.",
  "Write binding requirements using SHALL, following ISO/IEC/IEEE 29148 and EARS.",
  "When DOCUMENT_CONTEXT provided, use it as reference material...",
  'Return ONLY JSON: { "candidates": ["<req1>", "<req2>"] }'
].join("\n");
```

---

### 2. Architecture Diagram Generation

**File:** `backend/src/services/diagram-generation.ts`

**Features:**
- Generates hierarchical SysML block diagrams
- Enforces strict parent-child composition relationships
- Three modes: **create**, **update**, **extend**
- Supports blocks, connectors, and ports
- Temperature: **0.3** (slightly higher for design creativity)

**Block Types:**
- **System** – Top-level (contains subsystems)
- **Subsystem** – Mid-level (contains components)
- **Component** – Leaf-level implementations
- **Actor** – External entities
- **External** – External systems
- **Interface** – System boundaries

**Connector Types:**
- **Composition** – Parent-child relationships (primary)
- **Association** – General relationships
- **Flow** – Data/control flow
- **Dependency** – Dependency relationships

**Layout Rules:**
- Systems positioned at top (Y ~100-200)
- Subsystems in middle (Y ~350-450)
- Components at bottom (Y ~600-700)
- Horizontal spacing: 200px
- Vertical spacing: 250px between hierarchy levels

**Output Format:**
```json
{
  "action": "create",
  "diagramName": "Vehicle Control System",
  "diagramDescription": "Top-level system architecture",
  "diagramView": "block",
  "blocks": [
    {
      "name": "Vehicle Control System",
      "kind": "system",
      "stereotype": "<<system>>",
      "description": "Main vehicle control system",
      "positionX": 400,
      "positionY": 100,
      "sizeWidth": 200,
      "sizeHeight": 120,
      "ports": [
        {"id": "port-1", "name": "SensorInput", "direction": "in"}
      ]
    }
  ],
  "connectors": [
    {
      "source": "Vehicle Control System",
      "target": "Braking Subsystem",
      "kind": "composition",
      "label": "contains"
    }
  ],
  "reasoning": "Created hierarchical architecture with clear system decomposition..."
}
```

**Prompt Pattern:**
```typescript
const sys = [
  "You are a systems architecture expert specializing in hierarchical SysML block diagrams.",
  "CRITICAL RULES for architecture diagrams:",
  "1. Use a strict hierarchy: System -> Subsystem -> Component",
  "2. Create composition connectors to show parent-child relationships",
  "Return ONLY a JSON object with this exact structure: {...}"
].join("\n");
```

---

### 3. Smart Fix Feature

**File:** `backend/src/routes/core.ts`, `frontend/src/components/DraftCard.tsx`

**Features:**
- Re-processes requirement text through LLM for automatic improvement
- Applies QA suggestions (e.g., "replace ambiguous terms", "add SHALL")
- Returns improved text with change notes
- Available in both draft workflow and main requirements table

**API Endpoint:**
```
POST /api/apply-fix
Body: { text: "requirement text" }
Response: { before: "...", after: "...", notes: ["Added SHALL", "Removed 'quickly'"] }
```

---

### 4. QA Analysis Endpoint

**File:** `backend/src/routes/core.ts`, `packages/req-qa/src/rules.ts`

**Features:**
- Deterministic quality analysis (no LLM call)
- Scores requirements 0-100
- Provides verdict: **pass** (≥85), **warn** (70-84), **fail** (<70)
- Returns actionable suggestions

**API Endpoint:**
```
POST /api/qa
Body: { text: "requirement text" }
Response: {
  score: 85,
  verdict: "Compliant with 29148, EARS:ubiquitous",
  suggestions: ["Add measurable criteria with units"],
  pattern: "ubiquitous",
  verification: "Test"
}
```

---

## Prompt Engineering Patterns

AIRGen uses several sophisticated prompt engineering techniques:

### 1. Structured JSON Output

All LLM interactions enforce JSON output with explicit schemas embedded in system prompts.

**Technique:**
```typescript
const sys = [
  "You are a systems requirements engineer.",
  "Return ONLY JSON: { \"candidates\": [\"<req1>\", \"<req2>\"] }",
  "No markdown fencing, no preface, no comments—just valid JSON."
].join("\n");
```

**Benefits:**
- Eliminates parsing errors
- Ensures type safety
- Enables automated validation

### 2. Temperature Control

Different tasks use different temperature settings for optimal results:

| Task | Temperature | Rationale |
|------|-------------|-----------|
| Requirements | 0.2 | High consistency, low creativity needed |
| Diagrams | 0.3 | Slightly higher for design exploration |
| Smart Fix | 0.2 | Deterministic improvements |

### 3. Context Injection

**Document Context Extraction:**
- **Native Documents** – Extracts all requirements with `[REF] text` format
- **Surrogate Documents (PDF)** – Full-text extraction with `pdf-parse`
- **Section Filtering** – Can attach specific sections only
- Format: `=== DOCUMENT: <name> ===\n<content>\n\n`

**Diagram Context Extraction:**
- Serializes existing blocks, connectors, ports
- Includes names, positions, relationships
- Enables "update" and "extend" modes

### 4. Few-Shot Learning via System Prompts

System prompts include:
- **Role definition** ("You are a systems requirements engineer")
- **Standard compliance** ("following ISO/IEC/IEEE 29148 and EARS")
- **Output format examples** (JSON schemas)
- **Critical rules** (numbered lists of constraints)
- **Layout guidelines** (positioning rules for diagrams)

### 5. Error Recovery

**JSON Parsing Fallback:**
```typescript
try {
  parsed = JSON.parse(text);
} catch {
  // Try to salvage JSON if the model adds extra prose
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    parsed = JSON.parse(text.slice(start, end + 1));
  }
}
```

---

## Quality Assurance System

### @airgen/req-qa Package

**Location:** `packages/req-qa/`

A standalone TypeScript package for deterministic requirement quality analysis (no LLM dependency).

### Validation Rules (7 total)

| Rule | Check | Message |
|------|-------|---------|
| **ShallVoice** | Contains "shall" | "Use 'shall' for binding requirements." |
| **NoForbiddenModals** | No will/should/may/can/could/might | "Avoid will/should/may for binding reqs." |
| **NoAndOr** | No "and/or" | "Avoid 'and/or'." |
| **SingleVerb** | One main action after 'shall' | "Prefer one main action." |
| **Length<=35Words** | 8-35 words | "Aim for 12–25 words, hard cap 35." |
| **AmbiguityBlacklist** | No ambiguous terms | "Ambiguous terms: fast, user-friendly, easy, optimal..." |
| **UnitsPresent** | Contains units (ms, kg, m/s², etc.) | "Include measurable units/tolerances." |

### Ambiguous Terms Blacklist (20 terms)

```typescript
export const AMBIGUOUS = [
  "fast", "user-friendly", "easy", "optimal", "adequate", "minimal",
  "appropriate", "acceptable", "maximize", "minimize", "robust",
  "state-of-the-art", "sufficient", "as soon as possible", "graceful",
  "intuitive", "seamless", "significant", "efficient", "quickly"
];
```

### Scoring Algorithm

```typescript
const okCount = hits.filter(h => h.ok).length;
const scoreBase = Math.round((okCount / hits.length) * 100);
const verdict: Verdict = scoreBase >= 85 ? "pass" : scoreBase >= 70 ? "warn" : "fail";
```

**Verdict Format:**
- **pass** (≥85): `"Compliant with 29148, EARS:ubiquitous"`
- **warn** (70-84): `"Usable with edits"`
- **fail** (<70): `"Not compliant"`

### EARS Pattern Detection

```typescript
function patternDetect(s: string): QaResult["pattern"] {
  if (/^when\b/i.test(s)) return "event";
  if (/^while\b/i.test(s)) return "state";
  if (/^if\b/i.test(s)) return "unwanted";
  if (/^where\b/i.test(s)) return "optional";
  return "ubiquitous";
}
```

---

## Gaps and Opportunities

### 1. Automated Trace Link Generation

**Current State:** Manual linking only via drag-and-drop UI

**Opportunity:**
- LLM-powered semantic similarity analysis
- Auto-suggest trace links between requirements and test cases
- Auto-link requirements to architecture blocks based on semantic relevance
- Auto-detect parent-child relationships for requirement decomposition

**Implementation Approach:**
- Embeddings-based similarity (OpenAI `text-embedding-3-small`)
- Cosine similarity threshold (e.g., >0.80 for high confidence)
- Present as suggestions, user confirms/rejects

**Use Cases:**
- "Find all requirements that relate to this architecture block"
- "Suggest test cases for this requirement"
- "Identify parent requirements for decomposition"

---

### 2. Test Case Generation

**Current State:** No test case generation capabilities

**Opportunity:**
- Generate test cases from requirements
- Support multiple test types: unit, integration, system, acceptance
- Auto-generate test procedures with steps, inputs, expected outputs
- Align with verification methods (Test, Analysis, Inspection, Demonstration)

**Implementation Approach:**
```typescript
export async function generateTestCases(request: {
  requirement: RequirementRecord;
  testType: "unit" | "integration" | "system" | "acceptance";
  documentContext?: string;
}): Promise<TestCase[]>
```

**Output Format:**
```json
{
  "testCases": [
    {
      "id": "TC-001",
      "name": "Verify brake response time under normal conditions",
      "type": "system",
      "preconditions": ["Vehicle stationary", "Engine running"],
      "steps": [
        "Apply brake pedal with 50N force",
        "Measure time to ABS activation"
      ],
      "expectedResult": "ABS activates within 50ms ±5ms",
      "traceLinks": ["REQ-BRK-001"]
    }
  ]
}
```

---

### 3. Interface Specification Generation

**Current State:** Architecture diagrams show interfaces but no detailed specs

**Opportunity:**
- Generate detailed interface specifications from architecture diagrams
- Define data structures, protocols, timing constraints
- Auto-generate interface control documents (ICDs)

**Implementation Approach:**
- Input: Architecture diagram with interface blocks/connectors
- Output: Structured interface specifications with:
  - Data elements (type, range, units)
  - Protocols (CAN, Ethernet, SPI, etc.)
  - Timing requirements (latency, throughput)
  - Error handling

---

### 4. Safety Hazard Analysis

**Current State:** No safety analysis capabilities

**Opportunity:**
- Auto-generate hazard analysis from requirements
- Identify safety-critical requirements
- Suggest safety requirements based on hazards
- Support ASIL (Automotive Safety Integrity Level) assignment

**Implementation Approach:**
```typescript
export async function analyzeHazards(request: {
  requirements: RequirementRecord[];
  systemDescription: string;
  domain: "automotive" | "aerospace" | "medical" | "industrial";
}): Promise<HazardAnalysis>
```

**Output Format:**
```json
{
  "hazards": [
    {
      "id": "HAZ-001",
      "description": "Unintended brake activation",
      "severity": "catastrophic",
      "likelihood": "remote",
      "risk": "medium",
      "asil": "ASIL-C",
      "mitigations": [
        "Add redundant brake sensors",
        "Implement fail-safe brake release"
      ],
      "relatedRequirements": ["REQ-BRK-001", "REQ-BRK-003"]
    }
  ]
}
```

---

### 5. Requirements Decomposition Assistant

**Current State:** Manual decomposition of high-level requirements

**Opportunity:**
- Suggest child requirements for high-level parent requirements
- Maintain traceability during decomposition
- Ensure complete coverage of parent requirement

**Implementation Approach:**
```typescript
export async function suggestDecomposition(request: {
  parentRequirement: RequirementRecord;
  targetLevel: "system" | "subsystem" | "component";
  documentContext?: string;
}): Promise<DecompositionSuggestion[]>
```

**Example:**
- **Parent:** "The vehicle shall provide safe braking under all conditions."
- **Children:**
  - "The braking system shall activate within 50ms of pedal press."
  - "The ABS shall prevent wheel lock under emergency braking."
  - "The brake system shall maintain 80% effectiveness after single component failure."

---

### 6. Consistency Checking Across Documents

**Current State:** No cross-document consistency analysis

**Opportunity:**
- Detect conflicting requirements across documents
- Identify duplicate requirements
- Check for terminology inconsistencies
- Validate trace link completeness

**Implementation Approach:**
```typescript
export async function checkConsistency(request: {
  tenant: string;
  projectKey: string;
  documentIds?: string[];
}): Promise<ConsistencyReport>
```

**Output Format:**
```json
{
  "conflicts": [
    {
      "type": "numerical_conflict",
      "severity": "high",
      "requirements": ["REQ-001", "REQ-045"],
      "description": "REQ-001 specifies 100ms response time, REQ-045 specifies 200ms",
      "suggestion": "Resolve conflicting timing requirements"
    }
  ],
  "duplicates": [
    {
      "requirements": ["REQ-002", "REQ-078"],
      "similarity": 0.95,
      "suggestion": "Consider merging or linking as duplicates"
    }
  ]
}
```

---

### 7. Natural Language Query Interface

**Current State:** UI-based filtering and search only

**Opportunity:**
- Natural language queries over requirements database
- Semantic search across all documents
- Complex queries like "Show all requirements with response time <100ms that are not verified"

**Implementation Approach:**
- Use OpenAI function calling for query parsing
- Generate Cypher queries from natural language
- Return formatted results with explanations

**Examples:**
- "Show me all safety-critical requirements without test cases"
- "Find requirements related to braking in the SRD document"
- "Which requirements are affected by this architecture change?"

---

### 8. Requirement Templates and Pattern Learning

**Current State:** Generic EARS pattern detection

**Opportunity:**
- Learn project-specific requirement patterns
- Suggest templates based on requirement type
- Auto-complete requirements based on learned patterns

**Implementation Approach:**
- Analyze existing requirements corpus
- Extract common sentence structures
- Generate templates with placeholders
- Fine-tune generation model on project corpus

**Example Templates:**
```
Timing: "The [system] shall [action] within [value] [unit] of [trigger]."
Safety: "The [system] shall maintain [capability] after [failure condition]."
Performance: "The [system] shall process [data] at a rate of [value] [unit]."
```

---

### 9. Verification Method Intelligence

**Current State:** Basic verification assignment (Test, Analysis, Inspection, Demonstration)

**Opportunity:**
- Suggest optimal verification method based on requirement text
- Auto-generate verification procedures
- Estimate verification effort and cost
- Link to verification plans and reports

**Implementation Approach:**
- Train classifier on requirement text → verification method
- Consider factors: testability, measurability, safety criticality
- Generate detailed verification procedures

---

### 10. Change Impact Analysis

**Current State:** Version history tracking, but no impact analysis

**Opportunity:**
- Predict impact of requirement changes
- Identify all affected requirements, tests, architecture
- Estimate rework effort
- Generate change notifications

**Implementation Approach:**
```typescript
export async function analyzeChangeImpact(request: {
  requirementId: string;
  proposedChange: string;
  tenant: string;
  projectKey: string;
}): Promise<ChangeImpact>
```

**Output Format:**
```json
{
  "affectedRequirements": [
    {"id": "REQ-002", "relationship": "child", "severity": "high"}
  ],
  "affectedTests": [
    {"id": "TC-010", "type": "system", "impact": "needs_update"}
  ],
  "affectedArchitecture": [
    {"blockId": "BLK-005", "impact": "interface_change"}
  ],
  "estimatedEffort": {
    "requirements": "2 hours",
    "tests": "8 hours",
    "architecture": "4 hours",
    "total": "14 hours"
  },
  "recommendations": [
    "Update child requirement REQ-002 to maintain consistency",
    "Review and update test case TC-010"
  ]
}
```

---

## Proposed Extensions

### Priority 1: High-Impact, Low-Effort

#### Extension 1.1: Automated Trace Link Suggestions

**Justification:** Trace linking is tedious and error-prone; semantic similarity can dramatically reduce manual effort.

**Implementation Plan:**

1. **Add embeddings generation endpoint**
   ```typescript
   // backend/src/services/embeddings.ts
   export async function generateEmbedding(text: string): Promise<number[]> {
     const response = await openai.embeddings.create({
       model: "text-embedding-3-small",
       input: text
     });
     return response.data[0].embedding;
   }
   ```

2. **Store embeddings in Neo4j**
   ```cypher
   CREATE (req:Requirement {
     id: "REQ-001",
     text: "...",
     embedding: [0.123, -0.456, ...] // 1536 dimensions
   })
   ```

3. **Add trace link suggestion API**
   ```typescript
   // POST /api/trace/suggest
   {
     "sourceId": "REQ-001",
     "targetType": "requirement" | "test" | "architecture",
     "minSimilarity": 0.80
   }
   // Response: Array<{ id, text, similarity, justification }>
   ```

4. **Frontend UI for accepting/rejecting suggestions**
   - Show top 5 suggestions with similarity scores
   - One-click accept or reject
   - Bulk accept for high-confidence matches (>0.90)

**Estimated Effort:** 3-4 days

**Benefits:**
- 70-80% reduction in manual trace linking effort
- Improved traceability coverage
- Discovery of non-obvious relationships

---

#### Extension 1.2: Test Case Generation

**Justification:** Test case generation is time-consuming; automating it accelerates V&V.

**Implementation Plan:**

1. **Create test case generation service**
   ```typescript
   // backend/src/services/test-generation.ts
   export async function generateTestCases(request: {
     requirement: RequirementRecord;
     testType: "unit" | "integration" | "system" | "acceptance";
     count?: number;
   }): Promise<TestCase[]>
   ```

2. **Prompt engineering for test cases**
   ```typescript
   const sys = [
     "You are a verification engineer specializing in test case design.",
     "Generate comprehensive test cases following IEEE 829 standard.",
     "Include preconditions, test steps, expected results, and pass/fail criteria.",
     "Align with the requirement's verification method.",
     "Return ONLY JSON: { \"testCases\": [...] }"
   ].join("\n");
   ```

3. **Add test case CRUD endpoints**
   ```
   POST   /api/test-cases/:tenant/:project/generate
   GET    /api/test-cases/:tenant/:project
   POST   /api/test-cases/:tenant/:project
   PATCH  /api/test-cases/:tenant/:project/:id
   DELETE /api/test-cases/:tenant/:project/:id
   ```

4. **Frontend test case management UI**
   - Test case table view
   - Test execution tracking
   - Pass/fail status
   - Trace links to requirements

**Estimated Effort:** 5-7 days

**Benefits:**
- 60-70% reduction in test case authoring time
- Consistent test case quality
- Complete coverage of verification methods

---

#### Extension 1.3: Consistency Checking

**Justification:** Manual consistency review is error-prone; automated checks catch issues early.

**Implementation Plan:**

1. **Create consistency analysis service**
   ```typescript
   // backend/src/services/consistency-checker.ts
   export async function checkConsistency(
     tenant: string,
     projectKey: string
   ): Promise<ConsistencyReport>
   ```

2. **Implement rule-based checks (deterministic)**
   - Numerical conflicts (e.g., 100ms vs 200ms)
   - Terminology inconsistencies
   - Orphaned trace links
   - Duplicate requirements (cosine similarity >0.95)

3. **Implement LLM-based checks (semantic)**
   ```typescript
   const sys = [
     "You are a requirements engineer performing consistency analysis.",
     "Review the following requirements for conflicts, ambiguities, and gaps.",
     "Return JSON with: { \"conflicts\": [...], \"ambiguities\": [...], \"gaps\": [...] }"
   ].join("\n");
   ```

4. **Frontend consistency report UI**
   - Dashboard with consistency score
   - List of issues by severity (critical, high, medium, low)
   - Quick navigation to conflicting requirements
   - One-click fixes for simple issues

**Estimated Effort:** 4-5 days

**Benefits:**
- Early detection of specification defects
- Reduced integration issues
- Improved specification quality

---

### Priority 2: High-Impact, Medium-Effort

#### Extension 2.1: Safety Hazard Analysis

**Justification:** Safety analysis is critical for regulated domains (automotive, aerospace, medical); automation reduces risk.

**Implementation Plan:**

1. **Create hazard analysis service**
   ```typescript
   // backend/src/services/hazard-analysis.ts
   export async function analyzeHazards(request: {
     requirements: RequirementRecord[];
     systemDescription: string;
     domain: "automotive" | "aerospace" | "medical" | "industrial";
   }): Promise<HazardAnalysis>
   ```

2. **Prompt engineering for safety analysis**
   ```typescript
   const sys = [
     "You are a functional safety expert specializing in ISO 26262 (automotive).",
     "Analyze the following requirements for potential hazards.",
     "For each hazard, provide:",
     "- Description of hazard",
     "- Severity (catastrophic, critical, marginal, negligible)",
     "- Likelihood (frequent, probable, remote, extremely remote)",
     "- ASIL level (A, B, C, D) if automotive domain",
     "- Suggested mitigations",
     "Return ONLY JSON: { \"hazards\": [...] }"
   ].join("\n");
   ```

3. **Neo4j hazard tracking**
   ```cypher
   CREATE (haz:Hazard {
     id: "HAZ-001",
     description: "...",
     severity: "catastrophic",
     asil: "ASIL-C"
   })
   CREATE (req:Requirement)-[:MITIGATES]->(haz)
   ```

4. **Frontend hazard analysis UI**
   - Hazard register table
   - Risk matrix visualization
   - Trace links to mitigating requirements
   - Export to PDF for regulatory submission

**Estimated Effort:** 7-10 days

**Benefits:**
- Compliance with functional safety standards
- Early hazard identification
- Reduced safety-related rework
- Regulatory audit support

---

#### Extension 2.2: Natural Language Query Interface

**Justification:** Power users want to ask complex questions without navigating multiple UI screens.

**Implementation Plan:**

1. **Create query service with function calling**
   ```typescript
   // backend/src/services/nl-query.ts
   export async function executeNaturalLanguageQuery(
     tenant: string,
     projectKey: string,
     query: string
   ): Promise<QueryResult>
   ```

2. **Define function schemas for OpenAI**
   ```typescript
   const functions = [
     {
       name: "findRequirements",
       description: "Find requirements matching criteria",
       parameters: {
         type: "object",
         properties: {
           text_contains: { type: "string" },
           pattern: { type: "string", enum: ["ubiquitous", "event", "state", "unwanted", "optional"] },
           qa_score_min: { type: "number" },
           verified: { type: "boolean" },
           document_slug: { type: "string" }
         }
       }
     }
   ];
   ```

3. **Map function calls to Cypher queries**
   ```typescript
   function generateCypherQuery(functionCall: FunctionCall): string {
     // Convert function parameters to Cypher WHERE clauses
   }
   ```

4. **Frontend chat interface**
   - Chat input at top of Requirements page
   - Results displayed as requirement cards
   - Query history for quick re-runs
   - Export query results

**Estimated Effort:** 6-8 days

**Benefits:**
- Power user efficiency gains
- Complex queries without SQL/Cypher knowledge
- Faster requirements discovery

---

#### Extension 2.3: Change Impact Analysis

**Justification:** Understanding change impact prevents costly downstream defects.

**Implementation Plan:**

1. **Create impact analysis service**
   ```typescript
   // backend/src/services/impact-analysis.ts
   export async function analyzeChangeImpact(request: {
     requirementId: string;
     proposedChange: string;
     tenant: string;
     projectKey: string;
   }): Promise<ChangeImpact>
   ```

2. **Graph traversal for direct impact**
   ```cypher
   MATCH (req:Requirement {id: $reqId})
   MATCH (req)-[:REFINES|VERIFIES|DEPENDS_ON*1..3]-(affected)
   RETURN affected
   ```

3. **LLM-based semantic impact analysis**
   ```typescript
   const sys = [
     "You are a systems engineer analyzing change impact.",
     "The requirement is being changed from: \"<original>\"",
     "To: \"<proposed>\"",
     "Analyze the impact on related requirements, tests, and architecture.",
     "Return JSON with: { \"affectedRequirements\": [...], \"affectedTests\": [...] }"
   ].join("\n");
   ```

4. **Frontend impact report UI**
   - Visual graph of affected items
   - Severity indicators (high, medium, low)
   - Estimated rework effort
   - Change approval workflow

**Estimated Effort:** 8-10 days

**Benefits:**
- Informed change decisions
- Reduced unintended consequences
- Better project planning

---

### Priority 3: Medium-Impact, Low-Effort

#### Extension 3.1: Requirement Templates

**Justification:** Templates accelerate requirement authoring and ensure consistency.

**Implementation Plan:**

1. **Create templates service**
   ```typescript
   // backend/src/services/templates.ts
   export async function learnTemplates(
     tenant: string,
     projectKey: string
   ): Promise<RequirementTemplate[]>
   ```

2. **Template extraction with LLM**
   ```typescript
   const sys = [
     "You are a requirements engineer analyzing a corpus of requirements.",
     "Extract common sentence structures and create templates with placeholders.",
     "Example: \"The [system] shall [action] within [value] [unit].\"",
     "Return JSON: { \"templates\": [...] }"
   ].join("\n");
   ```

3. **Frontend template picker**
   - Dropdown of templates when creating requirements
   - Inline placeholder replacement
   - Template suggestion based on current document

**Estimated Effort:** 3-4 days

**Benefits:**
- Faster requirement authoring
- Consistent phrasing across project
- Onboarding aid for new engineers

---

## Implementation Priorities

### Recommended Roadmap

**Phase 1 (Weeks 1-2): Quick Wins**
1. Extension 1.1: Automated Trace Link Suggestions (3-4 days)
2. Extension 3.1: Requirement Templates (3-4 days)
3. Extension 1.3: Consistency Checking (4-5 days)

**Phase 2 (Weeks 3-4): High-Impact Features**
1. Extension 1.2: Test Case Generation (5-7 days)
2. Extension 2.2: Natural Language Query Interface (6-8 days)

**Phase 3 (Weeks 5-7): Safety & Advanced**
1. Extension 2.1: Safety Hazard Analysis (7-10 days)
2. Extension 2.3: Change Impact Analysis (8-10 days)

---

## Technical Architecture

### Embeddings Storage

**Option A: Neo4j Native Embeddings** (Recommended)
```cypher
CREATE (req:Requirement {
  id: "REQ-001",
  text: "...",
  embedding: [0.123, -0.456, ...] // Float array
})

// Similarity search (Neo4j 5.x supports vector similarity)
CALL db.index.vector.queryNodes('requirement_embeddings', 5, $embedding)
YIELD node, score
RETURN node.id, node.text, score
```

**Option B: Pinecone/Weaviate** (If Neo4j vector support insufficient)
- External vector database
- Store embeddings with metadata
- Query via API

### LLM Service Architecture

Current architecture supports extensions well:

```
frontend/src/routes/AirGenRoute.tsx
  ↓ (API calls)
backend/src/routes/airgen.ts
  ↓ (service calls)
backend/src/services/llm.ts
backend/src/services/drafting.ts
backend/src/services/diagram-generation.ts
backend/src/services/embeddings.ts         [NEW]
backend/src/services/test-generation.ts    [NEW]
backend/src/services/hazard-analysis.ts    [NEW]
backend/src/services/consistency-checker.ts [NEW]
backend/src/services/nl-query.ts           [NEW]
  ↓ (OpenAI API)
OpenAI GPT-4 / GPT-4 Turbo / o1
```

### Cost Considerations

**Current Usage Pattern:**
- Requirements generation: ~2000 tokens/request (input + output)
- Diagram generation: ~1500 tokens/request
- Model: GPT-4 Turbo (~$0.01/1K input tokens, ~$0.03/1K output tokens)

**Estimated Costs for Extensions:**

| Extension | Tokens/Request | Cost/Request | Annual Cost (1000 users, 10 req/user/month) |
|-----------|----------------|--------------|---------------------------------------------|
| Trace Link Suggestions | 500 (embeddings) | $0.0001 | $120/year |
| Test Case Generation | 2500 | $0.08 | $9,600/year |
| Hazard Analysis | 3000 | $0.10 | $12,000/year |
| Consistency Checking | 5000 (batch) | $0.15 | $1,800/year (monthly runs) |
| NL Query | 1000 | $0.03 | $3,600/year |

**Total Estimated Additional Cost:** ~$27,000/year for 1000 active users

**Cost Optimization Strategies:**
1. **Cache embeddings** – Generate once, reuse for trace link suggestions
2. **Batch processing** – Consistency checks run nightly, not real-time
3. **Model selection** – Use GPT-3.5 Turbo for simpler tasks (10x cheaper)
4. **Rate limiting** – Prevent abuse, cap requests per user

---

## Conclusion

AIRGen has a solid foundation with requirements and diagram generation. The proposed extensions build on this foundation to address critical gaps in:

1. **Traceability** – Automated trace link suggestions
2. **Verification** – Test case generation
3. **Safety** – Hazard analysis
4. **Quality** – Consistency checking
5. **Usability** – Natural language queries

**Recommended First Steps:**
1. Implement automated trace link suggestions (Phase 1, Week 1)
2. Add requirement templates for faster authoring (Phase 1, Week 2)
3. Build consistency checker for early defect detection (Phase 1, Week 2)

These extensions will position AIRGen as a comprehensive AI-powered requirements management platform, significantly ahead of competitors in the aerospace and automotive domains.

---

**Document Control:**
- Version: 1.0
- Date: 2025-10-09
- Author: Claude Code (AIRGen Analysis)
- Classification: Internal Use Only (Proprietary)
