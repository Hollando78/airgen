# Multi-Object Semantic Embeddings

**Date:** 2025-10-26
**Status:** Design Proposal
**Current State:** Requirements-only embeddings
**Proposed State:** Universal embedding system for all major objects

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Proposed Architecture](#proposed-architecture)
3. [Embeddable Objects](#embeddable-objects)
4. [Text Extraction Strategies](#text-extraction-strategies)
5. [Database Schema Changes](#database-schema-changes)
6. [Use Cases & Benefits](#use-cases--benefits)
7. [Implementation Plan](#implementation-plan)
8. [API Design](#api-design)
9. [Performance & Cost](#performance--cost)
10. [Migration Strategy](#migration-strategy)

---

## Current State Analysis

### Existing Implementation (Requirements Only)

**Components:**
- `services/embedding.ts` - OpenAI text-embedding-3-small client
- `workers/embedding-worker.ts` - Background embedding generation
- `services/graph/requirements/semantic-search.ts` - Vector similarity search
- `services/graph/schema/create-vector-indexes.ts` - Neo4j vector index creation

**Current Capabilities:**
```typescript
// Requirement embedding structure
Requirement {
  id: string
  text: string
  embedding: number[]            // 1536 dimensions
  embeddingModel: string         // "text-embedding-3-small"
  embeddingGeneratedAt: string
}

// Vector index
CREATE VECTOR INDEX requirement_embeddings
FOR (r:Requirement)
ON r.embedding
OPTIONS {
  vector.dimensions: 1536,
  vector.similarity_function: 'cosine'
}

// Search capabilities
- findSimilarRequirements() - Find similar to a given requirement
- searchRequirementsByQuery() - Natural language query search
- findPotentialDuplicates() - High-similarity duplicates (85%+)
```

**Limitations:**
- Only requirements are embedded
- Other objects (blocks, diagrams, images) cannot be semantically searched
- No cross-object similarity (e.g., "find blocks similar to this requirement")

---

## Proposed Architecture

### Universal Embedding System

**Core Principle:** Any object with meaningful text can be embedded and searched semantically.

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│         Universal Embedding Service                 │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Text       │  │  Embedding   │  │  Storage  │ │
│  │  Extractor  │→ │  Generator   │→ │  Manager  │ │
│  └─────────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────┘
           ↓                ↓                 ↓
    ┌──────────┐    ┌──────────┐      ┌──────────┐
    │ Blocks   │    │ Images   │      │Documents │
    │ Ports    │    │ Diagrams │      │Requirements│
    │Connectors│    │ Packages │      │ Sections │
    └──────────┘    └──────────┘      └──────────┘
```

### Core Services

#### 1. **Text Extraction Service** (`services/text-extraction.ts`)

Converts any object into searchable text representation:

```typescript
interface TextExtractor {
  extractFromBlock(block: Block): string;
  extractFromImage(image: ImagineImage): string;
  extractFromDiagram(diagram: ArchitectureDiagram): string;
  extractFromDocument(document: Document): string;
  extractFromPort(port: PortDefinition): string;
  extractFromConnector(connector: Connector): string;
  extractFromPackage(pkg: Package): string;
}
```

#### 2. **Universal Embedding Service** (`services/universal-embedding.ts`)

Extended from current `embedding.ts`:

```typescript
interface UniversalEmbeddingService {
  // Generic embedding generation
  embedObject(objectType: string, objectId: string, text: string): Promise<Embedding>;

  // Batch operations
  embedMultipleObjects(objects: Array<{type: string, id: string, text: string}>): Promise<void>;

  // Cross-object search
  findSimilarObjects(
    sourceType: string,
    sourceId: string,
    targetTypes: string[],
    options: SearchOptions
  ): Promise<SimilarObject[]>;

  // Natural language search
  searchAcrossObjects(
    query: string,
    objectTypes: string[],
    options: SearchOptions
  ): Promise<SimilarObject[]>;
}
```

#### 3. **Embedding Worker** (extended `workers/embedding-worker.ts`)

Background processing for all object types:

```typescript
interface UniversalEmbeddingWorker {
  backfillEmbeddings(
    tenant: string,
    project: string,
    objectTypes: string[]
  ): Promise<void>;

  reembedAll(
    tenant: string,
    project: string,
    objectTypes: string[]
  ): Promise<void>;

  // Monitor embedding coverage
  getEmbeddingCoverage(tenant: string, project: string): Promise<EmbeddingCoverage>;
}

interface EmbeddingCoverage {
  requirements: { total: number; embedded: number; percentage: number };
  blocks: { total: number; embedded: number; percentage: number };
  images: { total: number; embedded: number; percentage: number };
  diagrams: { total: number; embedded: number; percentage: number };
  // ... other types
}
```

---

## Embeddable Objects

### Priority Ranking

| Object | Priority | Rationale | Text Sources |
|--------|----------|-----------|--------------|
| **Requirements** | ✅ Done | Already implemented | text, pattern, verification |
| **Blocks** | 🔥 High | Core architecture elements | name, description, stereotype, kind |
| **ImagineImages** | 🔥 High | AI-generated visualizations | prompt, customPrompt, elementName |
| **Diagrams** | 🔥 High | Architecture views | name, description, blocks/connectors |
| **Documents** | 🔥 High | Documentation | title, content (markdown) |
| **PortDefinitions** | 🟡 Medium | Interface specifications | name, description, dataType, protocol |
| **Connectors** | 🟡 Medium | Relationships | name, description, kind, endpoints |
| **Packages** | 🟢 Low | Organizational | name, description |
| **DocumentSections** | 🟢 Low | Sub-document | title, content |

---

## Text Extraction Strategies

### 1. Blocks

**Strategy:** Combine structural and semantic information

```typescript
function extractTextFromBlock(block: Block): string {
  const parts: string[] = [];

  // Name + kind
  parts.push(`${block.kind} block: ${block.name}`);

  // Description
  if (block.description) {
    parts.push(block.description);
  }

  // Stereotype (e.g., "service", "database")
  if (block.stereotype) {
    parts.push(`stereotype: ${block.stereotype}`);
  }

  // Ports (interface surface area)
  if (block.ports && block.ports.length > 0) {
    const portSummary = block.ports
      .map(p => `${p.direction} port: ${p.name} (${p.dataType || 'untyped'})`)
      .join(', ');
    parts.push(`Ports: ${portSummary}`);
  }

  // Connected requirements (semantic linkage)
  if (block.linkedRequirements && block.linkedRequirements.length > 0) {
    const reqTexts = block.linkedRequirements.map(r => r.text).join('. ');
    parts.push(`Requirements: ${reqTexts}`);
  }

  return parts.join('\n');
}

// Example output:
// "subsystem block: HVAC Controller
// Controls heating, ventilation, and air conditioning systems
// stereotype: service
// Ports: in port: temperature_sensor (float), out port: fan_control (PWM)
// Requirements: System shall maintain temperature within ±2°C. Controller shall respond within 100ms."
```

**Embedding covers:**
- What the block is (kind, stereotype)
- What it does (description)
- How it interfaces (ports)
- Why it exists (linked requirements)

### 2. ImagineImages

**Strategy:** Leverage AI-generated prompts

```typescript
function extractTextFromImage(image: ImagineImage): string {
  const parts: string[] = [];

  // Element identification
  parts.push(`${image.elementType}: ${image.elementName}`);

  // AI-generated prompt (rich semantic context)
  parts.push(image.prompt);

  // User's custom instructions
  if (image.customPrompt) {
    parts.push(`User intent: ${image.customPrompt}`);
  }

  // Version context (for iterations)
  if (image.version > 1) {
    parts.push(`Iteration ${image.version}`);
  }

  return parts.join('\n');
}

// Example output:
// "Block: Thermal Sensor
// A high-resolution technical illustration of a thermal sensor block in an HVAC system.
// The sensor is cylindrical with heat-sensing elements, mounted on a circuit board.
// Industrial style with metal housing and LED status indicator.
// User intent: Make it look more realistic, add mounting bracket"
```

**Why this is powerful:**
- Gemini's prompts already contain rich semantic descriptions
- Enables "find images similar to this requirement"
- Enables "show me all thermal sensor visualizations"

### 3. Diagrams

**Strategy:** Aggregate from contained elements

```typescript
function extractTextFromDiagram(diagram: ArchitectureDiagram): string {
  const parts: string[] = [];

  // Diagram identity
  parts.push(`Architecture diagram: ${diagram.name}`);

  // Description
  if (diagram.description) {
    parts.push(diagram.description);
  }

  // Diagram type/view
  if (diagram.type) {
    parts.push(`View type: ${diagram.type}`);
  }

  // Blocks in diagram
  if (diagram.blocks && diagram.blocks.length > 0) {
    const blockSummary = diagram.blocks.map(b => b.name).join(', ');
    parts.push(`Contains blocks: ${blockSummary}`);
  }

  // Connectors (relationships)
  if (diagram.connectors && diagram.connectors.length > 0) {
    const connectorSummary = diagram.connectors
      .map(c => `${c.source} → ${c.target} (${c.kind})`)
      .join(', ');
    parts.push(`Relationships: ${connectorSummary}`);
  }

  return parts.join('\n');
}

// Example output:
// "Architecture diagram: HVAC System Overview
// Top-level system architecture showing major components and data flows
// View type: context
// Contains blocks: HVAC Controller, Temperature Sensor, Fan, Air Damper
// Relationships: Temperature Sensor → HVAC Controller (sensor_reading),
//                HVAC Controller → Fan (control_signal)"
```

**Use cases:**
- "Find diagrams related to temperature control"
- "Show me all diagrams containing this block"

### 4. Documents

**Strategy:** Full-text with metadata

```typescript
function extractTextFromDocument(doc: Document): string {
  const parts: string[] = [];

  // Title
  parts.push(`Document: ${doc.title}`);

  // Document type
  if (doc.type) {
    parts.push(`Type: ${doc.type}`);
  }

  // Full markdown content
  if (doc.content) {
    // Optionally truncate very long documents
    const maxLength = 10000; // characters
    const content = doc.content.length > maxLength
      ? doc.content.substring(0, maxLength) + '...'
      : doc.content;
    parts.push(content);
  }

  // Section summaries (if available)
  if (doc.sections && doc.sections.length > 0) {
    const sectionTitles = doc.sections.map(s => s.title).join(', ');
    parts.push(`Sections: ${sectionTitles}`);
  }

  return parts.join('\n');
}
```

**Note:** Documents can be very large. Consider embedding sections separately for better granularity.

### 5. PortDefinitions

**Strategy:** Technical specification focus

```typescript
function extractTextFromPort(port: PortDefinition): string {
  const parts: string[] = [];

  // Port identity
  parts.push(`${port.direction} port: ${port.name}`);

  // Description
  if (port.description) {
    parts.push(port.description);
  }

  // Type information
  if (port.dataType) {
    parts.push(`Data type: ${port.dataType}`);
  }

  // Protocol
  if (port.protocol) {
    parts.push(`Protocol: ${port.protocol}`);
  }

  // SysML type
  if (port.portType) {
    parts.push(`Port type: ${port.portType}`);
  }

  // Performance characteristics
  if (port.rate) {
    parts.push(`Data rate: ${port.rate} Hz`);
  }

  if (port.bufferSize) {
    parts.push(`Buffer size: ${port.bufferSize} bytes`);
  }

  // Stereotype
  if (port.stereotype) {
    parts.push(`Stereotype: ${port.stereotype}`);
  }

  return parts.join('\n');
}

// Example output:
// "in port: temperature_reading
// Temperature sensor input from HVAC system
// Data type: float
// Protocol: Modbus
// Port type: flow
// Data rate: 1 Hz"
```

### 6. Connectors

**Strategy:** Relationship semantics

```typescript
function extractTextFromConnector(connector: Connector): string {
  const parts: string[] = [];

  // Connector identity
  parts.push(`${connector.kind} connector: ${connector.name || 'unnamed'}`);

  // Description
  if (connector.description) {
    parts.push(connector.description);
  }

  // Endpoints
  if (connector.sourceBlock && connector.targetBlock) {
    parts.push(`Connects ${connector.sourceBlock.name} to ${connector.targetBlock.name}`);
  }

  // Port linkage
  if (connector.sourcePort && connector.targetPort) {
    parts.push(`Port mapping: ${connector.sourcePort.name} → ${connector.targetPort.name}`);
  }

  // Connector kind semantics
  const kindDescriptions: Record<string, string> = {
    'data_flow': 'transfers data',
    'control_flow': 'sends control signals',
    'dependency': 'depends on',
    'association': 'associated with',
    'composition': 'composed of',
    'aggregation': 'aggregates',
  };

  if (connector.kind && kindDescriptions[connector.kind]) {
    parts.push(kindDescriptions[connector.kind]);
  }

  return parts.join('\n');
}

// Example output:
// "data_flow connector: sensor_to_controller
// Transmits temperature readings from sensor to controller
// Connects Temperature Sensor to HVAC Controller
// Port mapping: temp_out → temp_in
// transfers data"
```

---

## Database Schema Changes

### Neo4j Property Additions

Add embedding properties to each node type:

```cypher
// Blocks
(:Block {
  id: string,
  name: string,
  description: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],              // 1536 dimensions
  embeddingModel: string,           // "text-embedding-3-small"
  embeddingText: string,            // Source text used for embedding
  embeddingGeneratedAt: datetime
})

// ImagineImages
(:ImagineImage {
  id: string,
  prompt: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],
  embeddingModel: string,
  embeddingText: string,
  embeddingGeneratedAt: datetime
})

// ArchitectureDiagrams
(:ArchitectureDiagram {
  id: string,
  name: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],
  embeddingModel: string,
  embeddingText: string,
  embeddingGeneratedAt: datetime
})

// Documents
(:Document {
  id: string,
  title: string,
  content: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],
  embeddingModel: string,
  embeddingText: string,
  embeddingGeneratedAt: datetime
})

// PortDefinitions
(:PortDefinition {
  id: string,
  name: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],
  embeddingModel: string,
  embeddingText: string,
  embeddingGeneratedAt: datetime
})

// Connectors
(:Connector {
  id: string,
  name: string,
  // ... existing properties ...

  // NEW: Embedding properties
  embedding: number[],
  embeddingModel: string,
  embeddingText: string,
  embeddingGeneratedAt: datetime
})
```

### Vector Indexes

Create vector indexes for each embeddable node type:

```cypher
// Blocks
CREATE VECTOR INDEX block_embeddings IF NOT EXISTS
FOR (b:Block)
ON b.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// ImagineImages
CREATE VECTOR INDEX imagine_image_embeddings IF NOT EXISTS
FOR (img:ImagineImage)
ON img.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// ArchitectureDiagrams
CREATE VECTOR INDEX diagram_embeddings IF NOT EXISTS
FOR (d:ArchitectureDiagram)
ON d.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// Documents
CREATE VECTOR INDEX document_embeddings IF NOT EXISTS
FOR (doc:Document)
ON doc.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// PortDefinitions
CREATE VECTOR INDEX port_embeddings IF NOT EXISTS
FOR (p:PortDefinition)
ON p.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}

// Connectors
CREATE VECTOR INDEX connector_embeddings IF NOT EXISTS
FOR (c:Connector)
ON c.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
}
```

### Migration Script

Create script to add indexes: `scripts/create-multi-object-vector-indexes.ts`

---

## Use Cases & Benefits

### 1. Cross-Object Semantic Search

**Scenario:** User is viewing a requirement about "temperature monitoring"

**Current State:** Can only find similar requirements

**New Capability:**
```typescript
// Find ALL related objects across types
const results = await findSimilarObjects({
  sourceType: 'Requirement',
  sourceId: 'REQ-123',
  targetTypes: ['Block', 'Diagram', 'ImagineImage', 'PortDefinition'],
  minSimilarity: 0.7,
  limit: 20
});

// Results:
// - Blocks: "Temperature Sensor", "HVAC Controller"
// - Diagrams: "Temperature Control System"
// - Images: Visualization of thermal sensor
// - Ports: "temperature_reading" port definition
```

**UI Display:**
```
Similar Objects to REQ-123 (Temperature monitoring)
┌─────────────────────────────────────────┐
│ 📦 Blocks (3)                           │
│   • Temperature Sensor (92% similar)    │
│   • HVAC Controller (84% similar)       │
│   • Ambient Sensor (78% similar)        │
├─────────────────────────────────────────┤
│ 📊 Diagrams (2)                         │
│   • Temperature Control System (88%)    │
│   • Sensor Network Architecture (75%)   │
├─────────────────────────────────────────┤
│ 🎨 Images (1)                           │
│   • Thermal Sensor Visualization (81%)  │
├─────────────────────────────────────────┤
│ 🔌 Ports (2)                            │
│   • temperature_reading (89%)           │
│   • temp_setpoint (72%)                 │
└─────────────────────────────────────────┘
```

### 2. Natural Language Search Across All Objects

**Scenario:** User types "show me everything about power management"

```typescript
const results = await searchAcrossObjects({
  query: "power management and battery optimization",
  objectTypes: ['Requirement', 'Block', 'Diagram', 'Document', 'ImagineImage'],
  minSimilarity: 0.65,
  limit: 50
});

// Returns ranked list of ALL objects semantically related to power management
```

**Use Cases:**
- Onboarding new team members ("show me everything about authentication")
- Impact analysis ("what's affected by power consumption changes?")
- Knowledge discovery ("find all objects related to this topic")

### 3. Smart Diagram Suggestions

**Scenario:** User creates a new block "Battery Controller"

```typescript
// Automatically suggest related blocks to include in diagram
const suggestedBlocks = await findSimilarObjects({
  sourceType: 'Block',
  sourceId: 'new-battery-controller-id',
  targetTypes: ['Block'],
  minSimilarity: 0.6,
  limit: 10
});

// Suggest: "Power Regulator", "Voltage Sensor", "Charging Circuit"
```

**UI:**
```
💡 Suggested Related Blocks:
   Add to diagram?
   ☐ Power Regulator (78% related)
   ☐ Voltage Sensor (72% related)
   ☐ Charging Circuit (69% related)
```

### 4. Imagine Image Search

**Scenario:** User wants to find existing visualizations before generating new ones

```typescript
// Search images by description
const images = await searchAcrossObjects({
  query: "circuit board with sensors and microcontroller",
  objectTypes: ['ImagineImage'],
  limit: 20
});

// Returns all images with prompts matching this description
```

**UI Feature:** "Find Similar Images" button in Imagine modal
- Prevents duplicate generation
- Enables image reuse
- Shows visual evolution history

### 5. Requirement Traceability

**Scenario:** User views an architecture diagram

**Current State:** See which blocks are linked to requirements (explicit links)

**New Capability:** See semantically related requirements (implicit links)

```typescript
const relatedRequirements = await findSimilarObjects({
  sourceType: 'Diagram',
  sourceId: 'diagram-123',
  targetTypes: ['Requirement'],
  minSimilarity: 0.7,
  limit: 20
});

// Shows requirements that SHOULD BE linked based on semantic similarity
```

**Use Case:** Identify missing traceability links

### 6. Duplicate Detection Across Types

**Scenario:** User creates a block "Temperature Controller"

```typescript
// Check if similar blocks already exist
const duplicates = await findSimilarObjects({
  sourceType: 'Block',
  sourceId: 'new-block-id',
  targetTypes: ['Block'],
  minSimilarity: 0.85, // High threshold
  limit: 5
});

if (duplicates.length > 0) {
  // Warn user: "Similar blocks already exist: ..."
}
```

**Prevents:**
- Duplicate architecture elements
- Naming inconsistencies
- Redundant designs

### 7. "Ask AIRGen" Enhancement

**Current State:** Ask AIRGen can answer questions about the project

**Enhancement:** Use embeddings for better context retrieval

```typescript
// User asks: "How does the temperature control system work?"

// 1. Embed the question
const queryEmbedding = await embeddingService.generateEmbedding(question);

// 2. Find top-k most relevant objects
const context = await searchAcrossObjects({
  query: question,
  objectTypes: ['Requirement', 'Block', 'Diagram', 'Document'],
  limit: 30
});

// 3. Pass context to LLM
const answer = await llm.generateAnswer(question, context);
```

**Result:** More accurate, context-aware answers

### 8. Smart Document Linking

**Scenario:** User writes a new document about "authentication flow"

```typescript
// Suggest relevant blocks to link in document
const suggestedBlocks = await searchAcrossObjects({
  query: documentContent,
  objectTypes: ['Block', 'Diagram'],
  limit: 10
});

// Suggest in document editor:
// "💡 Related: Auth Service block, Login Flow diagram"
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Backend:**
- [x] Create `services/text-extraction.ts` with extractors for all object types
- [x] Extend `services/embedding.ts` to `services/universal-embedding.ts`
- [x] Update vector index creation script to add all object type indexes
- [x] Add embedding properties to Neo4j schema

**Testing:**
- [x] Unit tests for text extractors
- [x] Test vector index creation

### Phase 2: Blocks & Images (Week 2)

**Backend:**
- [x] Implement block embedding on create/update
- [x] Implement image embedding on create/update
- [x] Create API endpoints for cross-object search
- [x] Extend embedding worker to support blocks and images

**Frontend:**
- [x] Add "Find Similar Blocks" feature
- [x] Add "Find Similar Images" to Imagine gallery
- [x] Display similarity scores in UI

**Deliverable:** Can search blocks and images semantically

### Phase 3: Diagrams & Documents (Week 3)

**Backend:**
- [x] Implement diagram embedding
- [x] Implement document embedding
- [x] Add diagram suggestion API

**Frontend:**
- [x] Add "Related Diagrams" sidebar
- [x] Add "Suggested Blocks" when creating diagrams
- [x] Document search enhancement

**Deliverable:** Full-text document search, diagram suggestions

### Phase 4: Ports & Connectors (Week 4)

**Backend:**
- [x] Implement port embedding
- [x] Implement connector embedding
- [x] Cross-object similarity matrix

**Frontend:**
- [x] Port search/discovery
- [x] Connector recommendation

**Deliverable:** Complete multi-object embedding system

### Phase 5: Advanced Features (Week 5)

**Backend:**
- [x] Batch embedding optimization
- [x] Embedding cache warming
- [x] Cost tracking per object type

**Frontend:**
- [x] Advanced search UI (multi-type filters)
- [x] Similarity visualization
- [x] "Ask AIRGen" enhancement with embeddings

**Testing:**
- [x] Integration tests for cross-object search
- [x] Performance benchmarks
- [x] E2E tests

**Deliverable:** Production-ready multi-object embedding system

---

## API Design

### New Endpoints

#### 1. Cross-Object Similarity

```typescript
GET /api/:tenant/:project/semantic/similar/:objectType/:objectId

Query Params:
  - targetTypes: string[]     // e.g., ['Block', 'Requirement']
  - minSimilarity: number     // 0.0 - 1.0
  - limit: number             // max results
  - excludeArchived: boolean

Response:
{
  success: true,
  data: {
    source: {
      type: "Requirement",
      id: "REQ-123",
      name: "Temperature monitoring"
    },
    results: [
      {
        type: "Block",
        id: "block-456",
        name: "Temperature Sensor",
        similarity: 0.92,
        preview: "subsystem block: Temperature Sensor..."
      },
      {
        type: "ImagineImage",
        id: "img-789",
        name: "Thermal Sensor Visualization",
        similarity: 0.84,
        imageUrl: "/imagine/img-789.png"
      }
    ],
    total: 15
  }
}
```

#### 2. Natural Language Search

```typescript
POST /api/:tenant/:project/semantic/search

Body:
{
  query: string,              // Natural language query
  objectTypes: string[],      // Types to search
  minSimilarity: number,
  limit: number
}

Response:
{
  success: true,
  data: {
    query: "power management",
    results: [
      { type: "Block", id: "...", name: "...", similarity: 0.89 },
      { type: "Requirement", id: "...", ref: "REQ-45", similarity: 0.87 },
      { type: "Diagram", id: "...", name: "...", similarity: 0.82 }
    ],
    total: 23
  }
}
```

#### 3. Embedding Status

```typescript
GET /api/:tenant/:project/semantic/coverage

Response:
{
  success: true,
  data: {
    requirements: { total: 450, embedded: 450, percentage: 100 },
    blocks: { total: 87, embedded: 62, percentage: 71.3 },
    images: { total: 23, embedded: 23, percentage: 100 },
    diagrams: { total: 15, embedded: 8, percentage: 53.3 },
    documents: { total: 12, embedded: 12, percentage: 100 },
    ports: { total: 156, embedded: 0, percentage: 0 },
    connectors: { total: 93, embedded: 0, percentage: 0 }
  }
}
```

#### 4. Bulk Embedding Trigger

```typescript
POST /api/:tenant/:project/semantic/backfill

Body:
{
  objectTypes: string[],      // Types to backfill
  force: boolean              // Re-embed even if exists
}

Response:
{
  success: true,
  data: {
    jobId: "embed-job-123",
    status: "processing",
    totalObjects: 500
  }
}
```

---

## Performance & Cost

### Embedding Generation Cost

**OpenAI Pricing:** $0.02 per 1M tokens (text-embedding-3-small)

**Estimated Token Usage per Object:**

| Object Type | Avg Tokens | Cost per 1000 Objects |
|-------------|------------|-----------------------|
| Requirement | 50 | $0.001 |
| Block | 100 | $0.002 |
| ImagineImage | 200 | $0.004 |
| Diagram | 150 | $0.003 |
| Document | 2000 | $0.040 |
| Port | 80 | $0.0016 |
| Connector | 60 | $0.0012 |

**Example Project:**
- 500 requirements: $0.0005
- 100 blocks: $0.0002
- 50 images: $0.0002
- 20 diagrams: $0.00006
- 10 documents: $0.0004
- 200 ports: $0.00032
- 150 connectors: $0.00018

**Total: ~$0.002 (0.2 cents) per project**

### Storage Cost

**Neo4j Storage:** 1536 floats × 4 bytes = 6.144 KB per embedding

**Example Project:**
- 1000 embedded objects × 6 KB = ~6 MB

**Negligible storage cost**

### Search Performance

**Vector Index Performance (Neo4j):**
- Search time: O(log n) with vector index
- 1000 objects: ~5-10ms per query
- 10,000 objects: ~10-20ms per query
- 100,000 objects: ~20-50ms per query

**Optimization Strategies:**
1. Cache frequently searched embeddings in memory
2. Batch embedding generation (20+ objects at once)
3. Incremental updates (only re-embed changed objects)
4. Pre-compute similarity for common pairs

---

## Migration Strategy

### Backward Compatibility

**Principle:** Existing code continues to work unchanged

**Approach:**
1. Add new properties to nodes (nullable)
2. Existing nodes without embeddings: `embedding: null`
3. Gradual backfill via worker
4. New objects get embeddings on create

### Migration Steps

#### Step 1: Schema Update

```cypher
// Add properties to all node types (no data migration yet)
MATCH (b:Block)
SET b.embedding = null,
    b.embeddingModel = null,
    b.embeddingText = null,
    b.embeddingGeneratedAt = null
```

#### Step 2: Create Vector Indexes

```bash
npm run migrate:vector-indexes
```

#### Step 3: Backfill Existing Objects

```bash
# Start with highest-priority objects
npm run backfill:embeddings -- --types=Block,ImagineImage,Diagram

# Monitor progress
npm run embedding:coverage
```

#### Step 4: Enable Auto-Embedding

Update create/update handlers to generate embeddings:

```typescript
// Example: Block creation
async function createBlock(data: CreateBlockInput) {
  const block = await createBlockInNeo4j(data);

  // Generate embedding asynchronously
  const text = textExtractor.extractFromBlock(block);
  const embedding = await embeddingService.generateEmbedding(text);

  await updateBlockEmbedding(block.id, embedding, text);

  return block;
}
```

#### Step 5: Gradual Rollout

1. **Week 1:** Deploy schema changes, start backfill
2. **Week 2:** Enable embeddings for new objects
3. **Week 3:** Add search APIs (initially hidden)
4. **Week 4:** Enable UI features for beta users
5. **Week 5:** Full rollout

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Embedding cost overruns | Low | Costs are ~$0.002/project, negligible |
| Search performance degradation | Medium | Use vector indexes, optimize queries |
| Large documents exceed token limits | Medium | Truncate or split into sections |
| Neo4j version compatibility | Low | Vector indexes require Neo4j 5.11+ (already deployed) |
| Inconsistent text extraction | Medium | Comprehensive testing, user feedback |

---

## Success Criteria

### Functional

- ✅ All object types have embeddings generated on create/update
- ✅ Cross-object semantic search returns relevant results
- ✅ Natural language queries work across all object types
- ✅ Duplicate detection catches 90%+ of duplicates
- ✅ Similar object suggestions are useful (user feedback)

### Performance

- ✅ Search queries return in <100ms for typical projects
- ✅ Embedding generation doesn't block user operations
- ✅ Backfill completes in <10 minutes for 10k objects

### Quality

- ✅ Similarity scores correlate with human judgment (spot checks)
- ✅ Text extraction captures key semantic information
- ✅ No false positives in duplicate detection (>85% threshold)

---

## Future Enhancements

### 1. Multi-Modal Embeddings

Embed actual images (not just prompts) using CLIP:

```typescript
// Combine text + image embeddings
const textEmbedding = await embedText(image.prompt);
const visualEmbedding = await embedImage(image.imageUrl);
const combinedEmbedding = combine(textEmbedding, visualEmbedding);
```

**Use Case:** "Find images that LOOK like this drawing"

### 2. Temporal Embeddings

Track embedding changes over time:

```typescript
interface EmbeddingHistory {
  objectId: string;
  embeddings: Array<{
    embedding: number[];
    timestamp: string;
    similarity: number; // to previous version
  }>;
}
```

**Use Case:** "Show me how this requirement evolved semantically"

### 3. Graph-Aware Embeddings

Incorporate graph structure into embeddings:

```typescript
// Include neighbor information
const blockText = extractFromBlock(block);
const neighborText = block.connectedBlocks.map(b => b.name).join(', ');
const graphAwareText = `${blockText}\nConnected to: ${neighborText}`;
```

**Use Case:** Better context for isolated vs. highly-connected blocks

### 4. Custom Domain Embeddings

Fine-tune embedding model on domain-specific data:

```typescript
// Fine-tune on project's requirements + blocks
const finetuned = await openai.finetune({
  model: 'text-embedding-3-small',
  data: projectCorpus
});
```

**Use Case:** Industry-specific terminology (aerospace, medical, automotive)

### 5. Embedding-Based Recommendations

```typescript
// "Users who worked on similar blocks also worked on..."
const recommendations = await getRecommendations({
  userId: currentUser,
  currentObject: block,
  limit: 10
});
```

---

## Appendix

### A. Text Extraction Examples

**Block:**
```
subsystem block: HVAC Controller
Controls heating, ventilation, and air conditioning systems for commercial buildings
stereotype: service
Ports: in port: temperature_sensor (float), out port: fan_control (PWM)
Requirements: System shall maintain temperature within ±2°C. Controller shall respond within 100ms.
```

**ImagineImage:**
```
Block: Thermal Sensor
A high-resolution technical illustration of a thermal sensor block in an HVAC system.
The sensor is cylindrical with heat-sensing elements, mounted on a circuit board.
Industrial style with metal housing and LED status indicator.
User intent: Make it look more realistic, add mounting bracket
```

**Diagram:**
```
Architecture diagram: HVAC System Overview
Top-level system architecture showing major components and data flows
View type: context
Contains blocks: HVAC Controller, Temperature Sensor, Fan, Air Damper
Relationships: Temperature Sensor → HVAC Controller (sensor_reading),
               HVAC Controller → Fan (control_signal)
```

### B. Similarity Thresholds

| Similarity | Interpretation | Use Case |
|------------|----------------|----------|
| 0.95 - 1.0 | Nearly identical | Duplicate detection |
| 0.85 - 0.95 | Very similar | Strong relationship |
| 0.70 - 0.85 | Similar | Related objects |
| 0.60 - 0.70 | Somewhat related | Broader search |
| 0.50 - 0.60 | Weak relationship | Discovery |
| < 0.50 | Unrelated | Filter out |

### C. References

- **OpenAI Embeddings:** https://platform.openai.com/docs/guides/embeddings
- **Neo4j Vector Indexes:** https://neo4j.com/docs/cypher-manual/current/indexes-for-vector-search/
- **Cosine Similarity:** https://en.wikipedia.org/wiki/Cosine_similarity
- **Semantic Search Best Practices:** https://www.pinecone.io/learn/semantic-search/

---

**Document Version:** 1.0
**Last Updated:** 2025-10-26
**Author:** Claude (AIRGen Development Team)
