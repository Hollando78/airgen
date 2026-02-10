# Functions Implementation Plan

**Version:** 1.0
**Date:** 2025-10-09
**Status:** Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Feature Requirements](#feature-requirements)
3. [Data Model Design](#data-model-design)
4. [Backend Architecture](#backend-architecture)
5. [Frontend UI Design](#frontend-ui-design)
6. [AI Generation](#ai-generation)
7. [Integration Points](#integration-points)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Testing Strategy](#testing-strategy)
10. [Future Enhancements](#future-enhancements)

---

## Overview

### Purpose

The Functions feature brings SysML-lite functional modeling capabilities to AIRGen, bridging the gap between architecture blocks and functional requirements. Functions represent behavioral decomposition of system capabilities, with well-defined inputs, processing logic, and outputs.

### Key Concepts

**Function**: A behavioral element that describes *what* the system does (as opposed to architecture blocks which describe *how* it's structured).

**Functional Requirement**: A requirement stereotyped as `<<functional>>` that specifies the behavior of a function.

**Dynamic Section**: An auto-generated document section that contains all functional requirements for a specific function.

**Port Binding**: Functions must use ports defined on their parent architecture block for inputs and outputs, ensuring consistency between structural and behavioral views.

### Business Value

1. **Behavioral Decomposition**: Break down high-level system capabilities into detailed functions
2. **Requirements Traceability**: Automatically link functions to requirements, architecture, and tests
3. **MBSE Compliance**: Align with SysML functional modeling practices
4. **AI-Assisted Generation**: LLM generates functions from stakeholder needs
5. **Validation**: Ensure ports are used correctly (inputs vs outputs)

---

## Feature Requirements

### FR-1: Function Identification in Documents

**Requirement**: Users shall be able to identify requirements as function definitions using the `<<function>>` stereotype.

**Rationale**: Functions start as requirements that describe a capability. Stereotyping them as `<<function>>` elevates them to first-class functional model elements.

**Acceptance Criteria**:
- Requirement can have `stereotype: "<<function>>"` in metadata
- Stereotyped requirements appear in Functions view
- Requirement text describes the function's purpose

**Example:**
```yaml
---
id: "req-123"
ref: "FUN-BRK-001"
stereotype: "<<function>>"
pattern: "ubiquitous"
---

The system shall provide emergency braking capability to prevent collisions.
```

### FR-2: Function Definition with Ports

**Requirement**: Functions shall have well-defined inputs, processing logic, and outputs that reference architecture block ports.

**Rationale**: Functions consume inputs, perform processing, and produce outputs. Linking to architecture ports ensures consistency.

**Acceptance Criteria**:
- Function has inputs array (each referencing a port by ID)
- Function has outputs array (each referencing a port by ID)
- Function has processing description (natural language)
- System validates ports exist on parent block
- System validates input ports have direction `in` or `inout`
- System validates output ports have direction `out` or `inout`

**Example Structure:**
```typescript
{
  id: "func-123",
  name: "Emergency Braking",
  description: "Calculates optimal braking force based on sensor data",
  parentBlockId: "block-456",
  inputs: [
    { portId: "port-1", name: "BrakePedalForce", dataType: "Float" },
    { portId: "port-2", name: "VehicleSpeed", dataType: "Float" }
  ],
  processing: "IF BrakePedalForce > 50N AND VehicleSpeed > 0, calculate optimal brake force using ABS algorithm.",
  outputs: [
    { portId: "port-3", name: "BrakeForce", dataType: "Float" }
  ]
}
```

### FR-3: Dynamic Sections for Functional Requirements

**Requirement**: The system shall automatically create and manage dynamic sections that contain functional requirements derived from functions.

**Rationale**: Each function needs detailed requirements. Dynamic sections group these automatically, updating when the function changes.

**Acceptance Criteria**:
- When a function is created, a dynamic section is created
- Dynamic section name format: `"Function: <FunctionName>"`
- Dynamic section has property `dynamic: true` and `functionId: "<func-id>"`
- Functional requirements created in this section have `stereotype: "<<functional>>"`
- If function is deleted, dynamic section is archived (not deleted)
- Dynamic section order is set to appear after the function definition requirement

**Example:**
```
Document: System Requirements Document
├── 1. Introduction
├── 2. Functional Definitions
│   ├── FUN-BRK-001: Emergency Braking (stereotype: <<function>>)
│   └── Function: Emergency Braking (dynamic section)
│       ├── FUN-BRK-001-01: Brake force calculation (stereotype: <<functional>>)
│       ├── FUN-BRK-001-02: ABS activation timing (stereotype: <<functional>>)
│       └── FUN-BRK-001-03: Error handling (stereotype: <<functional>>)
├── 3. Interface Definitions
...
```

### FR-4: Function Exists Within Architecture Block

**Requirement**: Every function shall be associated with exactly one architecture block (system, subsystem, or component).

**Rationale**: Functions are behaviors *of* architectural elements. This relationship is mandatory for traceability.

**Acceptance Criteria**:
- Function must have `parentBlockId` property
- System validates block exists before creating function
- If block is deleted, all functions are archived (cascade)
- Functions appear in block's details panel
- Functions can be viewed per-block or globally

**Graph Relationship:**
```cypher
(block:ArchitectureBlock)-[:HAS_FUNCTION]->(func:Function)
```

### FR-5: Functions Route and Workspace

**Requirement**: The system shall provide a dedicated `/functions` route for viewing and managing functions.

**Rationale**: Functions are complex enough to warrant their own workspace, separate from requirements and architecture.

**Acceptance Criteria**:
- Route: `/functions` (tenant/project scoped)
- View modes:
  - **List View**: Table of all functions with filters (by block, document, status)
  - **Function Detail View**: Full function definition with inputs, processing, outputs
  - **Diagram View**: Functional flow diagrams showing function calls
- Create function from scratch or from requirement
- Edit function properties
- Delete function (archives dynamic section and requirements)

### FR-6: Port Validation

**Requirement**: The system shall validate that function inputs reference valid input ports and outputs reference valid output ports.

**Rationale**: Prevent inconsistencies between functional and structural views.

**Acceptance Criteria**:
- On function create/update, validate all input `portId` values exist on parent block
- Validate input ports have `direction: "in"` or `direction: "inout"`
- Validate output ports have `direction: "out"` or `direction: "inout"`
- Return clear error messages if validation fails
- UI shows only valid ports in dropdown menus

### FR-7: AI-Generated Functions

**Requirement**: The system shall support AI-assisted generation of functions from stakeholder descriptions.

**Rationale**: Accelerate functional modeling using LLM to generate initial functions.

**Acceptance Criteria**:
- New endpoint: `POST /api/functions/generate`
- LLM generates functions with inputs, processing, outputs
- LLM suggests which ports to use based on architecture block
- Generated functions appear as candidates (like requirement candidates)
- User can accept, reject, or edit before finalizing

### FR-8: Functional Requirements Derivation

**Requirement**: Users shall be able to create functional requirements that elaborate on a function's behavior.

**Rationale**: Functions are high-level; functional requirements provide detailed specifications.

**Acceptance Criteria**:
- Functional requirements have `stereotype: "<<functional>>"`
- They are linked to their parent function via `DERIVES_FROM` relationship
- They appear in the function's dynamic section
- QA scoring applies (like normal requirements)
- They inherit function's parent block context

---

## Data Model Design

### Neo4j Schema

#### Function Node

```cypher
(:Function {
  id: String!,                  // "func-<timestamp>"
  name: String!,                // "Emergency Braking"
  description: String!,         // Function purpose/summary
  parentBlockId: String!,       // ID of architecture block
  tenant: String!,
  projectKey: String!,
  documentSlug: String?,        // Optional: document where defined
  requirementId: String?,       // Optional: source requirement ID (if created from requirement)
  inputs: String!,              // JSON array of {portId, name, dataType, description?}
  processing: String!,          // Natural language or pseudocode
  outputs: String!,             // JSON array of {portId, name, dataType, description?}
  createdBy: String?,
  updatedBy: String?,
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes:**
```cypher
CREATE INDEX function_id FOR (f:Function) ON (f.id);
CREATE INDEX function_tenant_project FOR (f:Function) ON (f.tenant, f.projectKey);
CREATE INDEX function_parent_block FOR (f:Function) ON (f.parentBlockId);
```

**Constraints:**
```cypher
CREATE CONSTRAINT function_id_unique FOR (f:Function) REQUIRE f.id IS UNIQUE;
```

#### Relationships

**Block-Function:**
```cypher
(:ArchitectureBlock)-[:HAS_FUNCTION]->(:Function)
```

**Function-Section:**
```cypher
(:Function)-[:HAS_DYNAMIC_SECTION]->(:DocumentSection {dynamic: true})
```

**Requirement-Function:**
```cypher
// When requirement is stereotyped as <<function>>
(:Requirement {stereotype: "<<function>>"})-[:DEFINES]->(:Function)

// When requirement is derived from function
(:Requirement {stereotype: "<<functional>>"})-[:DERIVES_FROM]->(:Function)
```

**Function-Version History:**
```cypher
(:Function)-[:HAS_VERSION]->(:FunctionVersion)
(:FunctionVersion)-[:PREVIOUS_VERSION]->(:FunctionVersion)
```

### DocumentSection Extension

Add new property to `DocumentSection`:

```typescript
type DocumentSectionRecord = {
  // ... existing properties
  dynamic?: boolean;          // If true, managed by system
  functionId?: string;        // Link to function if dynamic
  managedBy?: string;         // "function" | "test" | null
}
```

### Requirement Extension

Add `stereotype` property (already exists, just document function-specific values):

```typescript
type RequirementRecord = {
  // ... existing properties
  stereotype?: string;  // "<<function>>" | "<<functional>>" | "<<interface>>" | null
}
```

### Function Validation Rules

```typescript
type FunctionInput = {
  portId: string;
  name: string;            // Port name (for display)
  dataType?: string;       // Optional: Float, Boolean, String, etc.
  description?: string;
};

type FunctionOutput = {
  portId: string;
  name: string;
  dataType?: string;
  description?: string;
};

// Validation function
async function validateFunction(func: FunctionInput): Promise<ValidationResult> {
  // 1. Validate parent block exists
  const block = await getArchitectureBlock(func.parentBlockId);
  if (!block) {
    return { valid: false, errors: ["Parent block not found"] };
  }

  // 2. Parse block ports
  const ports: BlockPortRecord[] = JSON.parse(block.ports);

  // 3. Validate inputs
  for (const input of func.inputs) {
    const port = ports.find(p => p.id === input.portId);
    if (!port) {
      return { valid: false, errors: [`Input port ${input.portId} not found on block`] };
    }
    if (port.direction !== "in" && port.direction !== "inout") {
      return { valid: false, errors: [`Port ${port.name} has direction ${port.direction}, expected 'in' or 'inout'`] };
    }
  }

  // 4. Validate outputs
  for (const output of func.outputs) {
    const port = ports.find(p => p.id === output.portId);
    if (!port) {
      return { valid: false, errors: [`Output port ${output.portId} not found on block`] };
    }
    if (port.direction !== "out" && port.direction !== "inout") {
      return { valid: false, errors: [`Port ${port.name} has direction ${port.direction}, expected 'out' or 'inout'`] };
    }
  }

  return { valid: true, errors: [] };
}
```

---

## Backend Architecture

### Service Layer

#### `backend/src/services/graph/functions/functions-crud.ts`

```typescript
import type { ManagedTransaction } from "neo4j-driver";
import { getSession } from "../driver.js";
import { slugify } from "../../workspace.js";

export type FunctionPortBinding = {
  portId: string;
  name: string;
  dataType?: string | null;
  description?: string | null;
};

export type FunctionRecord = {
  id: string;
  name: string;
  description: string;
  parentBlockId: string;
  tenant: string;
  projectKey: string;
  documentSlug?: string | null;
  requirementId?: string | null;
  inputs: FunctionPortBinding[];
  processing: string;
  outputs: FunctionPortBinding[];
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Create a new function
 */
export async function createFunction(params: {
  tenant: string;
  projectKey: string;
  name: string;
  description: string;
  parentBlockId: string;
  inputs: FunctionPortBinding[];
  processing: string;
  outputs: FunctionPortBinding[];
  documentSlug?: string;
  requirementId?: string;
  createdBy?: string;
}): Promise<FunctionRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const functionId = `func-${Date.now()}`;
  const now = new Date().toISOString();

  // Validate function before creating
  const validation = await validateFunction({
    parentBlockId: params.parentBlockId,
    inputs: params.inputs,
    outputs: params.outputs
  });

  if (!validation.valid) {
    throw new Error(`Function validation failed: ${validation.errors.join(", ")}`);
  }

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      // 1. Create Function node
      const createFunctionQuery = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock {id: $parentBlockId})
        CREATE (func:Function {
          id: $functionId,
          name: $name,
          description: $description,
          parentBlockId: $parentBlockId,
          tenant: $tenant,
          projectKey: $projectKey,
          documentSlug: $documentSlug,
          requirementId: $requirementId,
          inputs: $inputs,
          processing: $processing,
          outputs: $outputs,
          createdBy: $createdBy,
          updatedBy: $createdBy,
          createdAt: $now,
          updatedAt: $now
        })
        MERGE (block)-[:HAS_FUNCTION]->(func)
        RETURN func
      `;

      const result = await tx.run(createFunctionQuery, {
        tenantSlug,
        projectSlug,
        parentBlockId: params.parentBlockId,
        functionId,
        name: params.name,
        description: params.description,
        tenant: params.tenant,
        projectKey: params.projectKey,
        documentSlug: params.documentSlug ?? null,
        requirementId: params.requirementId ?? null,
        inputs: JSON.stringify(params.inputs),
        processing: params.processing,
        outputs: JSON.stringify(params.outputs),
        createdBy: params.createdBy ?? null,
        now
      });

      if (result.records.length === 0) {
        throw new Error("Failed to create function - parent block not found");
      }

      const funcNode = result.records[0].get("func");

      // 2. Create dynamic section (if document specified)
      if (params.documentSlug) {
        const dynamicSectionId = `section-${Date.now()}`;
        const createSectionQuery = `
          MATCH (document:Document {slug: $documentSlug, tenant: $tenant, projectKey: $projectKey})
          CREATE (section:DocumentSection {
            id: $sectionId,
            name: $sectionName,
            description: $sectionDescription,
            documentSlug: $documentSlug,
            tenant: $tenant,
            projectKey: $projectKey,
            dynamic: true,
            functionId: $functionId,
            managedBy: 'function',
            order: 999,
            createdAt: $now,
            updatedAt: $now
          })
          MERGE (document)-[:HAS_SECTION]->(section)
          WITH section
          MATCH (func:Function {id: $functionId})
          MERGE (func)-[:HAS_DYNAMIC_SECTION]->(section)
          RETURN section
        `;

        await tx.run(createSectionQuery, {
          tenant: params.tenant,
          projectKey: params.projectKey,
          documentSlug: params.documentSlug,
          sectionId: dynamicSectionId,
          sectionName: `Function: ${params.name}`,
          sectionDescription: `Auto-generated section for functional requirements of ${params.name}`,
          functionId,
          now
        });
      }

      // 3. Link to source requirement if provided
      if (params.requirementId) {
        const linkRequirementQuery = `
          MATCH (req:Requirement {id: $requirementId})
          MATCH (func:Function {id: $functionId})
          MERGE (req)-[:DEFINES]->(func)
        `;
        await tx.run(linkRequirementQuery, {
          requirementId: params.requirementId,
          functionId
        });
      }

      return mapFunction(funcNode);
    });
  } finally {
    await session.close();
  }
}

/**
 * List functions (optionally filtered by block or document)
 */
export async function listFunctions(params: {
  tenant: string;
  projectKey: string;
  parentBlockId?: string;
  documentSlug?: string;
}): Promise<FunctionRecord[]> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);

  const session = getSession();
  try {
    let query = `
      MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
      MATCH (project)-[:HAS_ARCHITECTURE_BLOCK]->(block:ArchitectureBlock)-[:HAS_FUNCTION]->(func:Function)
      WHERE func.tenant = $tenant AND func.projectKey = $projectKey
    `;

    const params: Record<string, unknown> = {
      tenantSlug,
      projectSlug,
      tenant: params.tenant,
      projectKey: params.projectKey
    };

    if (params.parentBlockId) {
      query += ` AND func.parentBlockId = $parentBlockId`;
      params.parentBlockId = params.parentBlockId;
    }

    if (params.documentSlug) {
      query += ` AND func.documentSlug = $documentSlug`;
      params.documentSlug = params.documentSlug;
    }

    query += `
      RETURN func
      ORDER BY func.createdAt DESC
    `;

    const result = await session.run(query, params);
    return result.records.map(record => mapFunction(record.get("func")));
  } finally {
    await session.close();
  }
}

/**
 * Get function by ID
 */
export async function getFunction(functionId: string): Promise<FunctionRecord | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (func:Function {id: $functionId})
        RETURN func
      `,
      { functionId }
    );

    if (result.records.length === 0) {
      return null;
    }

    return mapFunction(result.records[0].get("func"));
  } finally {
    await session.close();
  }
}

/**
 * Update function
 */
export async function updateFunction(
  functionId: string,
  updates: {
    name?: string;
    description?: string;
    inputs?: FunctionPortBinding[];
    processing?: string;
    outputs?: FunctionPortBinding[];
    updatedBy?: string;
  }
): Promise<FunctionRecord> {
  const now = new Date().toISOString();

  // Validate if inputs/outputs provided
  if (updates.inputs || updates.outputs) {
    const currentFunc = await getFunction(functionId);
    if (!currentFunc) {
      throw new Error("Function not found");
    }

    const validation = await validateFunction({
      parentBlockId: currentFunc.parentBlockId,
      inputs: updates.inputs ?? currentFunc.inputs,
      outputs: updates.outputs ?? currentFunc.outputs
    });

    if (!validation.valid) {
      throw new Error(`Function validation failed: ${validation.errors.join(", ")}`);
    }
  }

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const setClauses: string[] = [];
      const queryParams: Record<string, unknown> = { functionId, now };

      if (updates.name !== undefined) {
        setClauses.push("func.name = $name");
        queryParams.name = updates.name;
      }
      if (updates.description !== undefined) {
        setClauses.push("func.description = $description");
        queryParams.description = updates.description;
      }
      if (updates.inputs !== undefined) {
        setClauses.push("func.inputs = $inputs");
        queryParams.inputs = JSON.stringify(updates.inputs);
      }
      if (updates.processing !== undefined) {
        setClauses.push("func.processing = $processing");
        queryParams.processing = updates.processing;
      }
      if (updates.outputs !== undefined) {
        setClauses.push("func.outputs = $outputs");
        queryParams.outputs = JSON.stringify(updates.outputs);
      }
      if (updates.updatedBy !== undefined) {
        setClauses.push("func.updatedBy = $updatedBy");
        queryParams.updatedBy = updates.updatedBy;
      }

      if (setClauses.length === 0) {
        throw new Error("No fields to update");
      }

      const query = `
        MATCH (func:Function {id: $functionId})
        SET ${setClauses.join(", ")}, func.updatedAt = $now
        RETURN func
      `;

      const result = await tx.run(query, queryParams);

      if (result.records.length === 0) {
        throw new Error("Function not found");
      }

      // Update dynamic section name if function name changed
      if (updates.name) {
        const updateSectionQuery = `
          MATCH (func:Function {id: $functionId})-[:HAS_DYNAMIC_SECTION]->(section:DocumentSection)
          SET section.name = $sectionName, section.updatedAt = $now
        `;
        await tx.run(updateSectionQuery, {
          functionId,
          sectionName: `Function: ${updates.name}`,
          now
        });
      }

      return mapFunction(result.records[0].get("func"));
    });
  } finally {
    await session.close();
  }
}

/**
 * Delete function (archives dynamic section and functional requirements)
 */
export async function deleteFunction(functionId: string): Promise<void> {
  const session = getSession();
  try {
    await session.executeWrite(async (tx: ManagedTransaction) => {
      // 1. Archive dynamic section
      const archiveSectionQuery = `
        MATCH (func:Function {id: $functionId})-[:HAS_DYNAMIC_SECTION]->(section:DocumentSection)
        SET section.archived = true, section.updatedAt = $now
      `;
      await tx.run(archiveSectionQuery, { functionId, now: new Date().toISOString() });

      // 2. Archive all functional requirements in dynamic section
      const archiveRequirementsQuery = `
        MATCH (func:Function {id: $functionId})-[:HAS_DYNAMIC_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
        SET req.archived = true, req.updatedAt = $now
      `;
      await tx.run(archiveRequirementsQuery, { functionId, now: new Date().toISOString() });

      // 3. Delete function node
      const deleteFunctionQuery = `
        MATCH (func:Function {id: $functionId})
        DETACH DELETE func
      `;
      await tx.run(deleteFunctionQuery, { functionId });
    });
  } finally {
    await session.close();
  }
}

/**
 * Validate function inputs/outputs against block ports
 */
async function validateFunction(params: {
  parentBlockId: string;
  inputs: FunctionPortBinding[];
  outputs: FunctionPortBinding[];
}): Promise<{ valid: boolean; errors: string[] }> {
  // Get parent block
  const block = await getArchitectureBlock(params.parentBlockId);
  if (!block) {
    return { valid: false, errors: ["Parent block not found"] };
  }

  const ports: BlockPortRecord[] = JSON.parse(block.ports);
  const errors: string[] = [];

  // Validate inputs
  for (const input of params.inputs) {
    const port = ports.find(p => p.id === input.portId);
    if (!port) {
      errors.push(`Input port ${input.portId} not found on block ${block.name}`);
      continue;
    }
    if (port.direction !== "in" && port.direction !== "inout") {
      errors.push(`Port "${port.name}" has direction "${port.direction}", expected "in" or "inout" for function input`);
    }
  }

  // Validate outputs
  for (const output of params.outputs) {
    const port = ports.find(p => p.id === output.portId);
    if (!port) {
      errors.push(`Output port ${output.portId} not found on block ${block.name}`);
      continue;
    }
    if (port.direction !== "out" && port.direction !== "inout") {
      errors.push(`Port "${port.name}" has direction "${port.direction}", expected "out" or "inout" for function output`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Map Neo4j node to FunctionRecord
 */
function mapFunction(node: Neo4jNode): FunctionRecord {
  const props = node.properties;
  return {
    id: String(props.id),
    name: String(props.name),
    description: String(props.description),
    parentBlockId: String(props.parentBlockId),
    tenant: String(props.tenant),
    projectKey: String(props.projectKey),
    documentSlug: props.documentSlug ? String(props.documentSlug) : null,
    requirementId: props.requirementId ? String(props.requirementId) : null,
    inputs: JSON.parse(String(props.inputs)),
    processing: String(props.processing),
    outputs: JSON.parse(String(props.outputs)),
    createdBy: props.createdBy ? String(props.createdBy) : null,
    updatedBy: props.updatedBy ? String(props.updatedBy) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt)
  };
}
```

### API Routes

#### `backend/src/routes/functions.ts`

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createFunction,
  listFunctions,
  getFunction,
  updateFunction,
  deleteFunction,
  type FunctionPortBinding
} from "../services/graph/functions/functions-crud.js";

const portBindingSchema = z.object({
  portId: z.string(),
  name: z.string(),
  dataType: z.string().optional(),
  description: z.string().optional()
});

const createFunctionSchema = z.object({
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  parentBlockId: z.string().min(1),
  inputs: z.array(portBindingSchema),
  processing: z.string().min(1).max(10000),
  outputs: z.array(portBindingSchema),
  documentSlug: z.string().optional(),
  requirementId: z.string().optional()
});

const updateFunctionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  inputs: z.array(portBindingSchema).optional(),
  processing: z.string().min(1).max(10000).optional(),
  outputs: z.array(portBindingSchema).optional()
});

export async function functionsRoutes(app: FastifyInstance) {
  // Create function
  app.post("/api/functions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createFunctionSchema.parse(request.body);

    try {
      const func = await createFunction({
        ...body,
        createdBy: (request.user as any)?.email
      });
      return reply.code(201).send(func);
    } catch (error) {
      if (error instanceof Error && error.message.includes("validation failed")) {
        return reply.code(400).send({ error: "ValidationError", message: error.message });
      }
      throw error;
    }
  });

  // List functions
  app.get("/api/functions/:tenant/:project", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { tenant, project } = request.params as { tenant: string; project: string };
    const { blockId, documentSlug } = request.query as { blockId?: string; documentSlug?: string };

    const functions = await listFunctions({
      tenant,
      projectKey: project,
      parentBlockId: blockId,
      documentSlug
    });

    return reply.send({ functions });
  });

  // Get function by ID
  app.get("/api/functions/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const func = await getFunction(id);
    if (!func) {
      return reply.code(404).send({ error: "NotFound", message: "Function not found" });
    }

    return reply.send(func);
  });

  // Update function
  app.patch("/api/functions/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateFunctionSchema.parse(request.body);

    try {
      const func = await updateFunction(id, {
        ...body,
        updatedBy: (request.user as any)?.email
      });
      return reply.send(func);
    } catch (error) {
      if (error instanceof Error && error.message.includes("validation failed")) {
        return reply.code(400).send({ error: "ValidationError", message: error.message });
      }
      if (error instanceof Error && error.message === "Function not found") {
        return reply.code(404).send({ error: "NotFound", message: error.message });
      }
      throw error;
    }
  });

  // Delete function
  app.delete("/api/functions/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await deleteFunction(id);
    return reply.code(204).send();
  });
}
```

---

## Frontend UI Design

### Routes

#### `frontend/src/routes/FunctionsRoute.tsx`

Main functions workspace with list view and detail panel.

```typescript
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { FunctionsList } from "../components/Functions/FunctionsList";
import { FunctionDetailsPanel } from "../components/Functions/FunctionDetailsPanel";
import { CreateFunctionModal } from "../components/Functions/CreateFunctionModal";
import type { FunctionRecord } from "../types";

export function FunctionsRoute(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [selectedFunction, setSelectedFunction] = useState<FunctionRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterBlockId, setFilterBlockId] = useState<string | null>(null);

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  // Queries
  const functionsQuery = useQuery({
    queryKey: ["functions", tenant, project, filterBlockId],
    queryFn: () => api.listFunctions(tenant, project, { blockId: filterBlockId }),
    enabled: Boolean(tenant && project)
  });

  const blocksQuery = useQuery({
    queryKey: ["architecture-blocks", tenant, project],
    queryFn: () => api.listArchitectureBlocks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (functionId: string) => api.deleteFunction(functionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["functions", tenant, project] });
      setSelectedFunction(null);
    }
  });

  return (
    <div className="functions-workspace">
      <header className="functions-header">
        <h1>Functions</h1>
        <div className="functions-actions">
          <select
            value={filterBlockId ?? ""}
            onChange={e => setFilterBlockId(e.target.value || null)}
          >
            <option value="">All Blocks</option>
            {blocksQuery.data?.blocks.map(block => (
              <option key={block.id} value={block.id}>
                {block.name} ({block.kind})
              </option>
            ))}
          </select>
          <button onClick={() => setShowCreateModal(true)}>
            + New Function
          </button>
        </div>
      </header>

      <div className="functions-layout">
        <aside className="functions-list-panel">
          <FunctionsList
            functions={functionsQuery.data?.functions ?? []}
            selectedId={selectedFunction?.id}
            onSelect={setSelectedFunction}
            isLoading={functionsQuery.isLoading}
          />
        </aside>

        <main className="functions-detail-panel">
          {selectedFunction ? (
            <FunctionDetailsPanel
              function={selectedFunction}
              blocks={blocksQuery.data?.blocks ?? []}
              onUpdate={func => setSelectedFunction(func)}
              onDelete={() => deleteMutation.mutate(selectedFunction.id)}
            />
          ) : (
            <div className="functions-empty-state">
              <p>Select a function to view details</p>
            </div>
          )}
        </main>
      </div>

      {showCreateModal && (
        <CreateFunctionModal
          tenant={tenant}
          project={project}
          blocks={blocksQuery.data?.blocks ?? []}
          onClose={() => setShowCreateModal(false)}
          onCreated={func => {
            setSelectedFunction(func);
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ["functions", tenant, project] });
          }}
        />
      )}
    </div>
  );
}
```

### Components

#### `frontend/src/components/Functions/FunctionDetailsPanel.tsx`

Displays full function details with editable inputs, processing, and outputs.

```typescript
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { PortBindingEditor } from "./PortBindingEditor";
import type { FunctionRecord, ArchitectureBlockRecord, FunctionPortBinding } from "../../types";

interface FunctionDetailsPanelProps {
  function: FunctionRecord;
  blocks: ArchitectureBlockRecord[];
  onUpdate: (func: FunctionRecord) => void;
  onDelete: () => void;
}

export function FunctionDetailsPanel({
  function: func,
  blocks,
  onUpdate,
  onDelete
}: FunctionDetailsPanelProps): JSX.Element {
  const api = useApiClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(func.name);
  const [editedDescription, setEditedDescription] = useState(func.description);
  const [editedInputs, setEditedInputs] = useState<FunctionPortBinding[]>(func.inputs);
  const [editedProcessing, setEditedProcessing] = useState(func.processing);
  const [editedOutputs, setEditedOutputs] = useState<FunctionPortBinding[]>(func.outputs);

  const parentBlock = blocks.find(b => b.id === func.parentBlockId);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateFunction(func.id, {
        name: editedName,
        description: editedDescription,
        inputs: editedInputs,
        processing: editedProcessing,
        outputs: editedOutputs
      }),
    onSuccess: data => {
      onUpdate(data);
      setIsEditing(false);
    }
  });

  const handleSave = () => {
    updateMutation.mutate();
  };

  const handleCancel = () => {
    setEditedName(func.name);
    setEditedDescription(func.description);
    setEditedInputs(func.inputs);
    setEditedProcessing(func.processing);
    setEditedOutputs(func.outputs);
    setIsEditing(false);
  };

  return (
    <div className="function-details">
      <header className="function-details-header">
        {isEditing ? (
          <input
            value={editedName}
            onChange={e => setEditedName(e.target.value)}
            className="function-name-input"
          />
        ) : (
          <h2>{func.name}</h2>
        )}
        <div className="function-actions">
          {isEditing ? (
            <>
              <button onClick={handleSave} disabled={updateMutation.isPending}>
                Save
              </button>
              <button onClick={handleCancel}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)}>Edit</button>
              <button onClick={onDelete} className="btn-danger">Delete</button>
            </>
          )}
        </div>
      </header>

      <section className="function-metadata">
        <div>
          <strong>Parent Block:</strong> {parentBlock?.name} ({parentBlock?.kind})
        </div>
        <div>
          <strong>Created:</strong> {new Date(func.createdAt).toLocaleString()}
        </div>
        <div>
          <strong>Updated:</strong> {new Date(func.updatedAt).toLocaleString()}
        </div>
      </section>

      <section className="function-description">
        <h3>Description</h3>
        {isEditing ? (
          <textarea
            value={editedDescription}
            onChange={e => setEditedDescription(e.target.value)}
            rows={3}
          />
        ) : (
          <p>{func.description}</p>
        )}
      </section>

      <section className="function-inputs">
        <h3>Inputs</h3>
        {isEditing ? (
          <PortBindingEditor
            ports={editedInputs}
            availablePorts={parentBlock?.ports.filter(p => p.direction === "in" || p.direction === "inout") ?? []}
            onChange={setEditedInputs}
          />
        ) : (
          <ul className="port-list">
            {func.inputs.map((input, idx) => (
              <li key={idx}>
                <strong>{input.name}</strong>
                {input.dataType && `: ${input.dataType}`}
                {input.description && <span className="port-description"> - {input.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="function-processing">
        <h3>Processing Logic</h3>
        {isEditing ? (
          <textarea
            value={editedProcessing}
            onChange={e => setEditedProcessing(e.target.value)}
            rows={6}
            placeholder="Describe the processing logic..."
          />
        ) : (
          <pre className="processing-text">{func.processing}</pre>
        )}
      </section>

      <section className="function-outputs">
        <h3>Outputs</h3>
        {isEditing ? (
          <PortBindingEditor
            ports={editedOutputs}
            availablePorts={parentBlock?.ports.filter(p => p.direction === "out" || p.direction === "inout") ?? []}
            onChange={setEditedOutputs}
          />
        ) : (
          <ul className="port-list">
            {func.outputs.map((output, idx) => (
              <li key={idx}>
                <strong>{output.name}</strong>
                {output.dataType && `: ${output.dataType}`}
                {output.description && <span className="port-description"> - {output.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {func.requirementId && (
        <section className="function-source">
          <h3>Source Requirement</h3>
          <a href={`/requirements/${func.requirementId}`}>View Source Requirement</a>
        </section>
      )}
    </div>
  );
}
```

#### `frontend/src/components/Functions/PortBindingEditor.tsx`

Reusable component for editing port bindings (inputs or outputs).

```typescript
import { useState } from "react";
import type { FunctionPortBinding, BlockPortRecord } from "../../types";

interface PortBindingEditorProps {
  ports: FunctionPortBinding[];
  availablePorts: BlockPortRecord[];
  onChange: (ports: FunctionPortBinding[]) => void;
}

export function PortBindingEditor({
  ports,
  availablePorts,
  onChange
}: PortBindingEditorProps): JSX.Element {
  const handleAddPort = () => {
    const unusedPort = availablePorts.find(
      p => !ports.some(binding => binding.portId === p.id)
    );

    if (unusedPort) {
      onChange([
        ...ports,
        {
          portId: unusedPort.id,
          name: unusedPort.name,
          dataType: null,
          description: null
        }
      ]);
    }
  };

  const handleRemovePort = (index: number) => {
    onChange(ports.filter((_, idx) => idx !== index));
  };

  const handleUpdatePort = (index: number, updates: Partial<FunctionPortBinding>) => {
    onChange(
      ports.map((port, idx) =>
        idx === index ? { ...port, ...updates } : port
      )
    );
  };

  return (
    <div className="port-binding-editor">
      {ports.map((port, idx) => {
        const availablePort = availablePorts.find(p => p.id === port.portId);
        return (
          <div key={idx} className="port-binding-row">
            <select
              value={port.portId}
              onChange={e => {
                const selectedPort = availablePorts.find(p => p.id === e.target.value);
                if (selectedPort) {
                  handleUpdatePort(idx, {
                    portId: selectedPort.id,
                    name: selectedPort.name
                  });
                }
              }}
            >
              {availablePorts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.direction})
                </option>
              ))}
            </select>

            <input
              type="text"
              value={port.dataType ?? ""}
              onChange={e => handleUpdatePort(idx, { dataType: e.target.value })}
              placeholder="Data type (optional)"
            />

            <input
              type="text"
              value={port.description ?? ""}
              onChange={e => handleUpdatePort(idx, { description: e.target.value })}
              placeholder="Description (optional)"
            />

            <button onClick={() => handleRemovePort(idx)} className="btn-icon">
              ✕
            </button>
          </div>
        );
      })}

      <button onClick={handleAddPort} disabled={ports.length >= availablePorts.length}>
        + Add Port
      </button>
    </div>
  );
}
```

### Integration with Architecture

#### BlockDetailsPanel Extension

Add "Functions" tab to `frontend/src/components/architecture/BlockDetailsPanel.tsx`:

```typescript
// Inside BlockDetailsPanel component
const [activeTab, setActiveTab] = useState<"properties" | "ports" | "functions">("properties");

// ... existing code

{activeTab === "functions" && (
  <div className="block-functions-tab">
    <h4>Functions ({functions.length})</h4>
    {functions.length === 0 ? (
      <p className="hint">No functions defined for this block yet.</p>
    ) : (
      <ul className="block-functions-list">
        {functions.map(func => (
          <li key={func.id}>
            <a href={`/functions?selected=${func.id}`}>
              {func.name}
            </a>
            <span className="function-io-summary">
              {func.inputs.length} inputs, {func.outputs.length} outputs
            </span>
          </li>
        ))}
      </ul>
    )}
    <button onClick={() => navigate(`/functions?blockId=${block.id}&create=true`)}>
      + Add Function
    </button>
  </div>
)}
```

---

## AI Generation

### LLM Function Generation Service

#### `backend/src/services/function-generation.ts`

```typescript
import { openai, model } from "../lib/openai.js";
import { getArchitectureBlock } from "./graph/architecture/blocks.js";
import type { FunctionPortBinding } from "./graph/functions/functions-crud.js";

export type GenerateFunctionsRequest = {
  user_input: string;              // Stakeholder description
  parentBlockId: string;           // Target architecture block
  tenant: string;
  projectKey: string;
  documentContext?: string;        // Optional: document text for context
  count?: number;                  // Number of function candidates (default 3)
};

export type GenerateFunctionsResponse = {
  functions: FunctionCandidate[];
  reasoning: string;
};

export type FunctionCandidate = {
  name: string;
  description: string;
  inputs: FunctionPortBinding[];
  processing: string;
  outputs: FunctionPortBinding[];
};

export async function generateFunctions(
  request: GenerateFunctionsRequest
): Promise<GenerateFunctionsResponse> {
  if (!openai) {
    throw new Error("OpenAI client not configured. Please set LLM_API_KEY environment variable.");
  }

  // Get parent block to understand available ports
  const block = await getArchitectureBlock(request.parentBlockId);
  if (!block) {
    throw new Error(`Architecture block ${request.parentBlockId} not found`);
  }

  const ports = JSON.parse(block.ports);

  const sys = [
    "You are a systems engineer specializing in functional decomposition and SysML modeling.",
    "Generate functions for a system architecture block based on stakeholder needs.",
    "CRITICAL RULES:",
    "1. Functions describe WHAT the system does (behavior), not HOW it's built (structure)",
    "2. Each function MUST use only the ports defined on the parent architecture block",
    "3. Input ports must have direction 'in' or 'inout'",
    "4. Output ports must have direction 'out' or 'inout'",
    "5. Processing logic should be clear, testable, and implementable",
    "6. Functions should decompose high-level capabilities into atomic operations",
    "",
    `PARENT BLOCK: ${block.name} (${block.kind})`,
    `DESCRIPTION: ${block.description ?? "No description"}`,
    "",
    "AVAILABLE PORTS:",
    ...ports.map((p: any) => `  - ${p.name} (${p.direction}): ${p.description ?? "No description"}`),
    "",
    "Return ONLY a JSON object with this exact structure:",
    JSON.stringify({
      functions: [
        {
          name: "string (function name)",
          description: "string (purpose and context)",
          inputs: [
            {
              portId: "string (must match an available port ID)",
              name: "string (port name for reference)",
              dataType: "string (optional: Float, Boolean, String, etc.)",
              description: "string (optional: usage in this function)"
            }
          ],
          processing: "string (detailed processing logic, can use pseudocode)",
          outputs: [
            {
              portId: "string (must match an available port ID)",
              name: "string (port name)",
              dataType: "string (optional)",
              description: "string (optional)"
            }
          ]
        }
      ],
      reasoning: "string explaining design decisions"
    }, null, 2),
    "No markdown fencing, no preface, no comments—just valid JSON."
  ].join("\n");

  const content = [
    `USER_INPUT: ${request.user_input}`,
    request.documentContext ? `DOCUMENT_CONTEXT:\n${request.documentContext}` : "",
    `NUMBER_OF_FUNCTIONS: ${request.count ?? 3}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content }
    ],
    temperature: 0.3 // Slightly higher for design creativity
  });

  const text = completion.choices[0]?.message?.content ?? "{}";

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to salvage JSON if the model adds extra prose
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new Error("Failed to parse function generation response from model.");
      }
    } else {
      throw new Error("Failed to parse function generation response from model.");
    }
  }

  // Validate the response structure
  const response = parsed as GenerateFunctionsResponse;
  if (!Array.isArray(response.functions) || !response.reasoning) {
    throw new Error("Invalid function generation response structure.");
  }

  // Validate port IDs
  const validPortIds = new Set(ports.map((p: any) => p.id));
  for (const func of response.functions) {
    for (const input of func.inputs) {
      if (!validPortIds.has(input.portId)) {
        throw new Error(`Invalid input port ID "${input.portId}" in function "${func.name}"`);
      }
    }
    for (const output of func.outputs) {
      if (!validPortIds.has(output.portId)) {
        throw new Error(`Invalid output port ID "${output.portId}" in function "${func.name}"`);
      }
    }
  }

  return response;
}
```

### API Endpoint

#### `backend/src/routes/functions.ts` (addition)

```typescript
// Add to existing functionsRoutes function

const generateFunctionsSchema = z.object({
  user_input: z.string().min(1),
  parentBlockId: z.string().min(1),
  tenant: z.string().min(1),
  projectKey: z.string().min(1),
  documentContext: z.string().optional(),
  count: z.number().min(1).max(10).default(3)
});

app.post("/api/functions/generate", { preHandler: [app.authenticate] }, async (request, reply) => {
  const body = generateFunctionsSchema.parse(request.body);

  try {
    const response = await generateFunctions(body);
    return reply.send(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return reply.code(503).send({
        error: "ServiceUnavailable",
        message: "AI function generation is not configured"
      });
    }
    throw error;
  }
});
```

### Frontend Integration

#### `frontend/src/components/Functions/AIFunctionGenerator.tsx`

Modal for AI-assisted function generation.

```typescript
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import type { FunctionCandidate, ArchitectureBlockRecord } from "../../types";

interface AIFunctionGeneratorProps {
  tenant: string;
  project: string;
  block: ArchitectureBlockRecord;
  onClose: () => void;
  onAccept: (candidate: FunctionCandidate) => void;
}

export function AIFunctionGenerator({
  tenant,
  project,
  block,
  onClose,
  onAccept
}: AIFunctionGeneratorProps): JSX.Element {
  const api = useApiClient();

  const [userInput, setUserInput] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<FunctionCandidate | null>(null);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateFunctions({
        user_input: userInput,
        parentBlockId: block.id,
        tenant,
        projectKey: project,
        count: 3
      })
  });

  const handleGenerate = () => {
    if (userInput.trim()) {
      generateMutation.mutate();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h2>AI Function Generator</h2>
          <button onClick={onClose}>✕</button>
        </header>

        <div className="modal-body">
          <section className="generator-input">
            <label>
              <strong>Describe the function(s) you need:</strong>
            </label>
            <textarea
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              placeholder="e.g., 'Create a function that calculates optimal braking force based on vehicle speed and brake pedal input, accounting for ABS intervention.'"
              rows={4}
            />
            <button
              onClick={handleGenerate}
              disabled={!userInput.trim() || generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating..." : "Generate Functions"}
            </button>
          </section>

          {generateMutation.isSuccess && (
            <section className="generator-results">
              <h3>Generated Functions</h3>
              <p className="reasoning">{generateMutation.data.reasoning}</p>

              <div className="function-candidates">
                {generateMutation.data.functions.map((func, idx) => (
                  <div
                    key={idx}
                    className={`function-candidate ${selectedCandidate === func ? "selected" : ""}`}
                    onClick={() => setSelectedCandidate(func)}
                  >
                    <h4>{func.name}</h4>
                    <p>{func.description}</p>
                    <div className="function-summary">
                      <span>{func.inputs.length} inputs</span>
                      <span>{func.outputs.length} outputs</span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedCandidate && (
                <div className="candidate-details">
                  <h4>Function Details</h4>
                  <section>
                    <strong>Inputs:</strong>
                    <ul>
                      {selectedCandidate.inputs.map((input, idx) => (
                        <li key={idx}>{input.name} ({input.dataType ?? "Any"})</li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <strong>Processing:</strong>
                    <pre>{selectedCandidate.processing}</pre>
                  </section>
                  <section>
                    <strong>Outputs:</strong>
                    <ul>
                      {selectedCandidate.outputs.map((output, idx) => (
                        <li key={idx}>{output.name} ({output.dataType ?? "Any"})</li>
                      ))}
                    </ul>
                  </section>

                  <button onClick={() => onAccept(selectedCandidate)}>
                    Accept & Create Function
                  </button>
                </div>
              )}
            </section>
          )}

          {generateMutation.isError && (
            <div className="error-state">
              Error: {(generateMutation.error as Error).message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Integration Points

### 1. Architecture Route

Add "Functions" button to architecture blocks:
- In block context menu: "View Functions"
- In block details panel: "Functions" tab showing count and list
- Quick create: "Add Function" button

### 2. Requirements Route

Add function stereotypes to requirement metadata:
- Dropdown for stereotype: `<<function>>`, `<<functional>>`, `<<interface>>`, etc.
- Visual indicator for function requirements (icon or badge)
- Filter by stereotype

### 3. Documents Route

Dynamic sections appear automatically:
- Read-only name (cannot be edited manually)
- Indicator that it's system-managed
- Link to parent function
- Archive when function deleted (not hard delete)

### 4. Trace Links

Automatic trace links:
- `(:Requirement {stereotype: "<<function>>"})-[:DEFINES]->(:Function)`
- `(:Requirement {stereotype: "<<functional>>"})-[:DERIVES_FROM]->(:Function)`
- `(:Function)-[:ALLOCATED_TO]->(:ArchitectureBlock)` (via parentBlockId)

### 5. Baselines

Functions included in baseline snapshots:
- FunctionVersion nodes created on changes
- Baselines capture function state at snapshot time
- Restore includes functions

---

## Implementation Roadmap

### Phase 1: Core Data Model (Week 1)

**Tasks:**
1. Create Neo4j schema migration for Function nodes
2. Implement `functions-crud.ts` service (create, list, get, update, delete)
3. Add validation logic for port bindings
4. Create API routes (`/api/functions/*`)
5. Write unit tests for CRUD operations

**Deliverables:**
- Function nodes can be created, read, updated, deleted
- Port validation works correctly
- API endpoints tested with Postman/Insomnia

### Phase 2: Dynamic Sections (Week 2)

**Tasks:**
1. Extend `DocumentSection` with `dynamic`, `functionId`, `managedBy` properties
2. Auto-create dynamic section on function creation
3. Update section name when function name changes
4. Archive section (don't delete) when function deleted
5. Add section version history for dynamic sections

**Deliverables:**
- Dynamic sections created automatically
- Sections update with function changes
- Sections archived properly

### Phase 3: Frontend UI (Week 3)

**Tasks:**
1. Create `/functions` route with list view
2. Implement `FunctionDetailsPanel` component
3. Create `PortBindingEditor` for inputs/outputs
4. Add "Functions" tab to `BlockDetailsPanel`
5. Integrate function indicators in requirements table

**Deliverables:**
- Functions route is functional
- Users can view/edit functions
- Architecture integration works

### Phase 4: AI Generation (Week 4)

**Tasks:**
1. Implement `function-generation.ts` service
2. Create `POST /api/functions/generate` endpoint
3. Build `AIFunctionGenerator` modal component
4. Add "Generate with AI" button to Functions route
5. Test with various architecture blocks and prompts

**Deliverables:**
- AI generates valid functions
- Port bindings are correct
- Candidates can be accepted/rejected

### Phase 5: Integration & Polish (Week 5)

**Tasks:**
1. Add functional requirement derivation workflow
2. Implement trace link creation (DEFINES, DERIVES_FROM)
3. Add function context to requirement creation
4. Create function version history
5. Write E2E tests
6. Documentation and user guide

**Deliverables:**
- Full integration with existing features
- Version history tracking
- Comprehensive tests
- User documentation

---

## Testing Strategy

### Unit Tests

**Function CRUD:**
```typescript
describe("createFunction", () => {
  it("should create function with valid port bindings", async () => {
    const func = await createFunction({
      tenant: "test",
      projectKey: "test",
      name: "Emergency Braking",
      description: "Braking function",
      parentBlockId: "block-123",
      inputs: [{ portId: "port-1", name: "BrakePedalForce" }],
      processing: "IF force > 50N THEN activate",
      outputs: [{ portId: "port-2", name: "BrakeForce" }]
    });

    expect(func.id).toMatch(/^func-\d+$/);
    expect(func.name).toBe("Emergency Braking");
  });

  it("should reject function with invalid input port", async () => {
    await expect(createFunction({
      ...baseParams,
      inputs: [{ portId: "invalid-port", name: "Bad" }]
    })).rejects.toThrow("validation failed");
  });

  it("should reject function with output port used as input", async () => {
    await expect(createFunction({
      ...baseParams,
      inputs: [{ portId: "port-out-1", name: "OutputUsedAsInput" }]
    })).rejects.toThrow("expected 'in' or 'inout'");
  });
});
```

**Port Validation:**
```typescript
describe("validateFunction", () => {
  it("should validate correct port directions", async () => {
    const result = await validateFunction({
      parentBlockId: "block-123",
      inputs: [{ portId: "port-in-1", name: "Input1" }],
      outputs: [{ portId: "port-out-1", name: "Output1" }]
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject port not found on block", async () => {
    const result = await validateFunction({
      parentBlockId: "block-123",
      inputs: [{ portId: "nonexistent", name: "Bad" }],
      outputs: []
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expect.stringMatching(/not found/));
  });
});
```

### Integration Tests

**Dynamic Section Creation:**
```typescript
describe("Function with dynamic section", () => {
  it("should create dynamic section on function creation", async () => {
    const func = await createFunction({
      ...baseParams,
      documentSlug: "srd"
    });

    const sections = await listDocumentSections("test", "test", "srd");
    const dynamicSection = sections.find(s => s.functionId === func.id);

    expect(dynamicSection).toBeDefined();
    expect(dynamicSection?.name).toBe(`Function: ${func.name}`);
    expect(dynamicSection?.dynamic).toBe(true);
  });

  it("should update section name when function name changes", async () => {
    const func = await createFunction({ ...baseParams, name: "Original" });
    await updateFunction(func.id, { name: "Updated" });

    const sections = await listDocumentSections("test", "test", func.documentSlug!);
    const dynamicSection = sections.find(s => s.functionId === func.id);

    expect(dynamicSection?.name).toBe("Function: Updated");
  });
});
```

### E2E Tests

**Functions Workflow:**
```typescript
test("complete function lifecycle", async ({ page }) => {
  // 1. Navigate to functions route
  await page.goto("/functions");

  // 2. Create new function
  await page.click('button:has-text("New Function")');
  await page.fill('[placeholder="Function name"]', "Calculate Brake Force");
  await page.fill('[placeholder="Description"]', "Calculates optimal braking force");
  await page.selectOption('select[name="parentBlockId"]', "block-123");
  await page.click('button:has-text("Save")');

  // 3. Verify function appears in list
  await expect(page.locator('text=Calculate Brake Force')).toBeVisible();

  // 4. Edit function
  await page.click('text=Calculate Brake Force');
  await page.click('button:has-text("Edit")');
  await page.fill('input[name="name"]', "Compute Brake Force");
  await page.click('button:has-text("Save")');

  // 5. Verify edit persisted
  await expect(page.locator('text=Compute Brake Force')).toBeVisible();

  // 6. Delete function
  await page.click('button:has-text("Delete")');
  await page.click('button:has-text("Confirm")');

  // 7. Verify function removed
  await expect(page.locator('text=Compute Brake Force')).not.toBeVisible();
});
```

---

## Future Enhancements

### 1. Functional Flow Diagrams

**Goal**: Visual diagrams showing function call sequences.

**Implementation**:
- New diagram type: `view: "functional"`
- Function blocks connected by flow arrows
- Show data flow between function inputs/outputs
- Swimlanes for different architectural blocks

### 2. Function Allocation Analysis

**Goal**: Validate that all functions are properly allocated to blocks.

**Features**:
- Orphan function detection (no parent block)
- Coverage analysis (blocks without functions)
- Complexity metrics (function count per block)
- Allocation matrix view

### 3. Performance Constraints

**Goal**: Specify timing/throughput requirements for functions.

**Schema Extension**:
```typescript
type FunctionRecord = {
  // ... existing
  constraints?: {
    maxExecutionTime?: { value: number; unit: "ms" | "s" };
    minThroughput?: { value: number; unit: "Hz" | "calls/s" };
    priority?: "critical" | "high" | "medium" | "low";
  };
};
```

### 4. Test Case Generation from Functions

**Goal**: AI generates test cases from function definitions.

**Workflow**:
1. User selects function
2. Clicks "Generate Test Cases"
3. LLM creates test cases covering:
   - Normal input ranges
   - Boundary conditions
   - Error conditions
4. Test cases linked to function via VERIFIES relationship

### 5. Code Stub Generation

**Goal**: Generate implementation stubs in target language.

**Example**:
```python
# Generated from Function: Calculate Brake Force
def calculate_brake_force(
    brake_pedal_force: float,  # Input from port "BrakePedalForce"
    vehicle_speed: float        # Input from port "VehicleSpeed"
) -> float:                     # Output to port "BrakeForce"
    """
    Calculates optimal braking force based on sensor data.

    Processing: IF BrakePedalForce > 50N AND VehicleSpeed > 0,
    calculate optimal brake force using ABS algorithm.
    """
    # TODO: Implement function logic
    pass
```

### 6. Function Libraries

**Goal**: Reusable function templates across projects.

**Features**:
- Export function as template
- Import function from library
- Version control for function templates
- Marketplace for shared functions

---

## Conclusion

The Functions feature brings SysML-lite functional modeling to AIRGen, bridging requirements and architecture with behavioral decomposition. With port binding validation, AI-assisted generation, and dynamic section management, this feature provides a comprehensive solution for functional modeling in safety-critical and regulated systems.

**Key Benefits:**
1. **Traceability**: Clear links from functions to requirements to architecture
2. **Validation**: Port bindings ensure consistency between structure and behavior
3. **Automation**: AI generates functions, dynamic sections created automatically
4. **Standards Compliance**: Aligns with SysML behavioral modeling practices
5. **Scalability**: Functions can be managed per-block or globally

**Timeline**: 5 weeks for full implementation

**Priority**: High (fills critical gap in behavioral modeling)

---

**Document Control:**
- Version: 1.0
- Date: 2025-10-09
- Author: Claude Code (AIRGen Planning)
- Classification: Internal Use Only (Proprietary)
