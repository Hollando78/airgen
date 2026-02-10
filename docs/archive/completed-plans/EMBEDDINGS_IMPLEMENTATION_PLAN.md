# Embeddings Implementation Plan for AIRGen

**Status:** Ready to implement
**Estimated Time:** 2-3 weeks (3-4 developer-days per week)
**Dependencies:** Existing OpenAI API key (already configured)

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Foundation (Week 1)](#phase-1-foundation-week-1)
4. [Phase 2: Core Features (Week 2)](#phase-2-core-features-week-2)
5. [Phase 3: UI & Migration (Week 3)](#phase-3-ui--migration-week-3)
6. [Testing Strategy](#testing-strategy)
7. [Rollout Plan](#rollout-plan)
8. [Cost Analysis](#cost-analysis)

---

## Overview

This plan adds **semantic embeddings** to AIRGen requirements, enabling:
- ✅ Intelligent duplicate detection (semantic, not keyword-based)
- ✅ "Find Similar" feature for any requirement
- ✅ Enhanced trace link suggestions based on meaning
- ✅ Natural language search across requirements
- ✅ Quality pattern learning (find requirements like high-scoring ones)

**Architecture Approach:** Hybrid (on-demand + background worker)
- On-demand: Generate embeddings when creating/updating requirements
- Background worker: Bulk operations, migrations, analysis

---

## Prerequisites

### Already Available ✅
- [x] OpenAI API key configured (`LLM_API_KEY` in env)
- [x] Neo4j database (v5.11+ with vector support)
- [x] Redis cache (available in docker-compose)
- [x] QA worker pattern (can copy for embedding worker)
- [x] OpenAI client setup (in `llm.ts`)

### Need to Verify
```bash
# Check Neo4j version (need 5.11+)
docker exec airgen-neo4j-1 cypher-shell "CALL dbms.components() YIELD versions RETURN versions"

# Should show: ["5.x.x"] where x >= 11

# Check Redis availability
docker exec airgen-redis-1 redis-cli ping
# Should return: PONG
```

---

## Phase 1: Foundation (Week 1)

**Goal:** Set up embedding infrastructure and basic generation

### Step 1.1: Create Embedding Service (Day 1)

**File:** `backend/src/services/embedding.ts`

```typescript
import OpenAI from "openai";
import { config } from "../config.js";
import { getOpenAiClient } from "./llm.js";
import crypto from "crypto";

// Type definitions
export type Embedding = number[];

export interface EmbeddingMetadata {
  text: string;
  modelVersion: string;
  generatedAt: string;
  dimensions: number;
}

// Configuration
const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensions, $0.02/1M tokens
const EMBEDDING_DIMENSIONS = 1536;
const CACHE_TTL_SECONDS = 3600; // 1 hour

/**
 * Hash text for cache key generation
 */
function hashText(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Embedding Service with three-level caching:
 * 1. In-memory LRU cache (fast, ephemeral)
 * 2. Redis cache (fast, persistent across restarts)
 * 3. Neo4j (permanent storage with requirement)
 */
class EmbeddingService {
  private memoryCache = new Map<string, Embedding>();
  private maxMemoryCacheSize = 1000;
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = getOpenAiClient();
    }
    return this.client;
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<Embedding> {
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot generate embedding for empty text");
    }

    const hash = hashText(text);

    // Level 1: Check memory cache
    const cached = this.memoryCache.get(hash);
    if (cached) {
      console.log(`[Embedding] Memory cache hit for ${hash.substring(0, 8)}`);
      return cached;
    }

    // Level 2: Redis cache (TODO: implement when Redis client is available)
    // For now, skip Redis caching

    // Generate fresh embedding
    console.log(`[Embedding] Generating fresh embedding for text (${text.length} chars)`);

    try {
      const client = this.getClient();
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text.trim(),
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;

      // Validate dimensions
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding dimensions: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`
        );
      }

      // Cache in memory
      this.cacheInMemory(hash, embedding);

      return embedding;
    } catch (error) {
      console.error(`[Embedding] Generation failed:`, error);
      throw new Error(`Failed to generate embedding: ${(error as Error).message}`);
    }
  }

  /**
   * Generate embedding only if text changed
   * Optimizes for updates where text didn't change
   */
  async generateIfChanged(
    currentText: string,
    previousText?: string,
    existingEmbedding?: Embedding
  ): Promise<Embedding> {
    // If text unchanged and we have an embedding, reuse it
    if (previousText === currentText && existingEmbedding && existingEmbedding.length > 0) {
      console.log(`[Embedding] Text unchanged, reusing existing embedding`);
      return existingEmbedding;
    }

    return this.generateEmbedding(currentText);
  }

  /**
   * Batch generate embeddings for multiple texts
   * More efficient than individual calls
   */
  async generateBatch(texts: string[]): Promise<Embedding[]> {
    if (texts.length === 0) {
      return [];
    }

    // For small batches or when most are cached, process individually
    if (texts.length <= 5) {
      return Promise.all(texts.map(t => this.generateEmbedding(t)));
    }

    // For larger batches, use OpenAI batch API
    console.log(`[Embedding] Batch generating ${texts.length} embeddings`);

    try {
      const client = this.getClient();
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts.map(t => t.trim()),
        encoding_format: "float"
      });

      const embeddings = response.data.map(d => d.embedding);

      // Cache all results
      texts.forEach((text, i) => {
        const hash = hashText(text);
        this.cacheInMemory(hash, embeddings[i]);
      });

      return embeddings;
    } catch (error) {
      console.error(`[Embedding] Batch generation failed:`, error);
      throw new Error(`Failed to generate batch embeddings: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Returns: 0.0 (completely different) to 1.0 (identical)
   */
  cosineSimilarity(a: Embedding, b: Embedding): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Cache embedding in memory with LRU eviction
   */
  private cacheInMemory(hash: string, embedding: Embedding): void {
    // Simple LRU: if cache full, remove oldest entry
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(hash, embedding);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      maxMemoryCacheSize: this.maxMemoryCacheSize,
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS
    };
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.memoryCache.clear();
    console.log(`[Embedding] Cache cleared`);
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();

// Export for testing
export const __testOnly = {
  hashText,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};
```

### Step 1.2: Update LLM Service (Day 1)

**File:** `backend/src/services/llm.ts`

Add export for OpenAI client (needed by embedding service):

```typescript
// Add this export after getOpenAiClient function
export { getOpenAiClient };  // Export for use by embedding service
```

### Step 1.3: Create Neo4j Vector Index (Day 1)

**File:** `backend/src/services/graph/schema/create-vector-indexes.ts` (new file)

```typescript
import { getSession } from "../driver.js";

/**
 * Create vector indexes for semantic search
 * Requires Neo4j 5.11+
 */
export async function createVectorIndexes(): Promise<void> {
  const session = getSession();

  try {
    console.log('[Schema] Creating vector indexes...');

    // Create vector index for requirements
    await session.run(`
      CREATE VECTOR INDEX requirement_embeddings IF NOT EXISTS
      FOR (r:Requirement)
      ON r.embedding
      OPTIONS {
        indexConfig: {
          \`vector.dimensions\`: 1536,
          \`vector.similarity_function\`: 'cosine'
        }
      }
    `);

    console.log('[Schema] ✓ Created requirement_embeddings vector index');

    // Wait for index to become available
    let indexReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!indexReady && attempts < maxAttempts) {
      const result = await session.run(`
        SHOW INDEXES
        YIELD name, state
        WHERE name = 'requirement_embeddings'
        RETURN state
      `);

      if (result.records.length > 0) {
        const state = result.records[0].get('state');
        if (state === 'ONLINE') {
          indexReady = true;
          console.log('[Schema] ✓ Vector index is online and ready');
        } else {
          console.log(`[Schema] Waiting for index... (state: ${state})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      } else {
        console.log('[Schema] Waiting for index to appear...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }

    if (!indexReady) {
      console.warn('[Schema] ⚠ Vector index may not be ready yet, but continuing...');
    }

  } catch (error) {
    console.error('[Schema] Error creating vector indexes:', error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Check if vector indexes exist and are online
 */
export async function checkVectorIndexes(): Promise<boolean> {
  const session = getSession();

  try {
    const result = await session.run(`
      SHOW INDEXES
      YIELD name, state, type
      WHERE name = 'requirement_embeddings'
      RETURN name, state, type
    `);

    if (result.records.length === 0) {
      console.log('[Schema] ⚠ Vector index does not exist');
      return false;
    }

    const state = result.records[0].get('state');
    const type = result.records[0].get('type');

    console.log(`[Schema] Vector index status: ${state} (${type})`);

    return state === 'ONLINE';
  } catch (error) {
    console.error('[Schema] Error checking vector indexes:', error);
    return false;
  } finally {
    await session.close();
  }
}
```

### Step 1.4: Run Index Creation Script (Day 1)

**File:** `backend/src/scripts/create-vector-indexes.ts` (new file)

```typescript
import { createVectorIndexes, checkVectorIndexes } from "../services/graph/schema/create-vector-indexes.js";

async function main() {
  console.log('Starting vector index creation...\n');

  try {
    // Check current status
    const exists = await checkVectorIndexes();

    if (exists) {
      console.log('✓ Vector indexes already exist and are online');
    } else {
      // Create indexes
      await createVectorIndexes();
      console.log('\n✓ Vector indexes created successfully');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Failed to create vector indexes:', error);
    process.exit(1);
  }
}

main();
```

**Run it:**
```bash
# From backend directory
pnpm tsx src/scripts/create-vector-indexes.ts
```

### Step 1.5: Update Package Dependencies (Day 1)

**File:** `backend/package.json`

Add if not already present:
```json
{
  "dependencies": {
    "openai": "^4.20.0"  // Already present
  }
}
```

### Step 1.6: Test Embedding Service (Day 2)

**File:** `backend/src/services/embedding.test.ts` (new file)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { embeddingService, __testOnly } from './embedding.js';

describe('EmbeddingService', () => {
  beforeEach(() => {
    embeddingService.clearCache();
  });

  it('should generate embedding for text', async () => {
    const text = "When brake pedal exceeds 50N, the system shall decelerate";
    const embedding = await embeddingService.generateEmbedding(text);

    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(__testOnly.EMBEDDING_DIMENSIONS);
    expect(typeof embedding[0]).toBe('number');
  });

  it('should cache embeddings in memory', async () => {
    const text = "Test requirement";

    const embedding1 = await embeddingService.generateEmbedding(text);
    const embedding2 = await embeddingService.generateEmbedding(text);

    expect(embedding1).toEqual(embedding2);
  });

  it('should calculate cosine similarity correctly', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];

    const similaritySame = embeddingService.cosineSimilarity(a, b);
    const similarityDifferent = embeddingService.cosineSimilarity(a, c);

    expect(similaritySame).toBeCloseTo(1.0);
    expect(similarityDifferent).toBeCloseTo(0.0);
  });

  it('should reuse existing embedding when text unchanged', async () => {
    const text = "Original text";
    const existingEmbedding = await embeddingService.generateEmbedding(text);

    const result = await embeddingService.generateIfChanged(
      text,
      text,
      existingEmbedding
    );

    expect(result).toEqual(existingEmbedding);
  });

  it('should generate new embedding when text changed', async () => {
    const oldText = "Old text";
    const newText = "New text";
    const oldEmbedding = await embeddingService.generateEmbedding(oldText);

    const result = await embeddingService.generateIfChanged(
      newText,
      oldText,
      oldEmbedding
    );

    expect(result).not.toEqual(oldEmbedding);
  });
});
```

**Run tests:**
```bash
pnpm test src/services/embedding.test.ts
```

---

## Phase 2: Core Features (Week 2)

**Goal:** Integrate embeddings into requirement CRUD and add search capabilities

### Step 2.1: Update Requirement CRUD to Generate Embeddings (Day 3)

**File:** `backend/src/services/graph/requirements/requirements-crud.ts`

Find the `createRequirement` function and add embedding generation:

```typescript
import { embeddingService } from "../../embedding.js";

// In createRequirement function, after validation:
export async function createRequirement(
  tenant: string,
  projectKey: string,
  data: CreateRequirementInput
): Promise<Requirement> {
  // ... existing validation ...

  // Generate embedding for the requirement text
  const embedding = await embeddingService.generateEmbedding(data.text);

  const session = getSession();
  try {
    const result = await session.executeWrite(async (tx: ManagedTransaction) => {
      // ... existing queries ...

      // In the CREATE query, add embedding:
      const createReqQuery = `
        CREATE (req:Requirement {
          id: $id,
          ref: $ref,
          text: $text,
          pattern: $pattern,
          verification: $verification,
          qaScore: $qaScore,
          qaVerdict: $qaVerdict,
          embedding: $embedding,           // ← Add this
          embeddingModel: $embeddingModel, // ← Add this
          createdAt: datetime(),
          updatedAt: datetime()
        })
        // ... rest of query
      `;

      return tx.run(createReqQuery, {
        // ... existing params ...
        embedding: embedding,
        embeddingModel: 'text-embedding-3-small'
      });
    });

    return result;
  } finally {
    await session.close();
  }
}
```

**Update `updateRequirement` function similarly:**

```typescript
// In updateRequirement function:
export async function updateRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  updates: UpdateRequirementInput
): Promise<Requirement> {
  // Fetch current requirement to compare text
  const current = await getRequirementById(tenant, projectKey, requirementId);

  // Generate embedding only if text changed
  let embedding = current.embedding;
  if (updates.text && updates.text !== current.text) {
    embedding = await embeddingService.generateIfChanged(
      updates.text,
      current.text,
      current.embedding
    );
  }

  // In the SET clause:
  const updateQuery = `
    MATCH (req:Requirement {id: $id})
    SET req.text = $text,
        req.embedding = $embedding,           // ← Add this
        req.embeddingModel = $embeddingModel, // ← Add this if text changed
        req.updatedAt = datetime()
    // ... rest
  `;

  // ... rest of function
}
```

### Step 2.2: Create Semantic Search Endpoints (Day 4)

**File:** `backend/src/services/graph/requirements/semantic-search.ts` (new file)

```typescript
import { getSession } from "../driver.js";
import type { ManagedTransaction } from "neo4j-driver";
import { embeddingService, type Embedding } from "../../embedding.js";

export interface SimilarRequirement {
  id: string;
  ref: string;
  text: string;
  pattern?: string;
  verification?: string;
  qaScore?: number;
  similarity: number;
}

export interface SemanticSearchOptions {
  minSimilarity?: number;  // Default: 0.7 (70% similar)
  limit?: number;          // Default: 10
  excludeArchived?: boolean; // Default: true
  excludeIds?: string[];   // Exclude specific requirement IDs
}

/**
 * Find requirements similar to a given requirement
 */
export async function findSimilarRequirements(
  tenant: string,
  projectKey: string,
  requirementId: string,
  options: SemanticSearchOptions = {}
): Promise<SimilarRequirement[]> {
  const {
    minSimilarity = 0.7,
    limit = 10,
    excludeArchived = true,
    excludeIds = []
  } = options;

  const session = getSession();

  try {
    // Get the target requirement's embedding
    const targetResult = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(
        `
        MATCH (req:Requirement {id: $id})
        RETURN req.embedding AS embedding, req.text AS text
        `,
        { id: requirementId }
      );
    });

    if (targetResult.records.length === 0) {
      throw new Error(`Requirement ${requirementId} not found`);
    }

    const targetEmbedding = targetResult.records[0].get('embedding') as Embedding;

    if (!targetEmbedding || targetEmbedding.length === 0) {
      throw new Error(`Requirement ${requirementId} has no embedding`);
    }

    // Vector similarity search using Neo4j vector index
    const searchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      let query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
        WHERE (req.deleted IS NULL OR req.deleted = false)
          AND req.id <> $excludeId
      `;

      if (excludeArchived) {
        query += `AND (req.archived IS NULL OR req.archived = false)\n`;
      }

      if (excludeIds.length > 0) {
        query += `AND NOT req.id IN $excludeIds\n`;
      }

      // Use vector similarity function
      query += `
        WITH req,
          vector.similarity.cosine(req.embedding, $targetEmbedding) AS similarity
        WHERE similarity >= $minSimilarity
          AND req.embedding IS NOT NULL
        RETURN
          req.id AS id,
          req.ref AS ref,
          req.text AS text,
          req.pattern AS pattern,
          req.verification AS verification,
          req.qaScore AS qaScore,
          similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      return tx.run(query, {
        tenantSlug: tenant,
        projectSlug: projectKey,
        excludeId: requirementId,
        excludeIds,
        targetEmbedding,
        minSimilarity,
        limit
      });
    });

    return searchResult.records.map(record => ({
      id: record.get('id'),
      ref: record.get('ref'),
      text: record.get('text'),
      pattern: record.get('pattern') || undefined,
      verification: record.get('verification') || undefined,
      qaScore: record.get('qaScore') || undefined,
      similarity: Number(record.get('similarity'))
    }));

  } finally {
    await session.close();
  }
}

/**
 * Search requirements by natural language query
 */
export async function searchRequirementsByQuery(
  tenant: string,
  projectKey: string,
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SimilarRequirement[]> {
  const {
    minSimilarity = 0.6,  // Lower threshold for free-text queries
    limit = 20,
    excludeArchived = true
  } = options;

  // Generate embedding for the search query
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  const session = getSession();

  try {
    const searchResult = await session.executeRead(async (tx: ManagedTransaction) => {
      let query = `
        MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
        MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
        WHERE doc.deletedAt IS NULL
        MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
        WHERE (req.deleted IS NULL OR req.deleted = false)
      `;

      if (excludeArchived) {
        query += `AND (req.archived IS NULL OR req.archived = false)\n`;
      }

      query += `
        WITH req,
          vector.similarity.cosine(req.embedding, $queryEmbedding) AS similarity
        WHERE similarity >= $minSimilarity
          AND req.embedding IS NOT NULL
        RETURN
          req.id AS id,
          req.ref AS ref,
          req.text AS text,
          req.pattern AS pattern,
          req.verification AS verification,
          req.qaScore AS qaScore,
          similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      return tx.run(query, {
        tenantSlug: tenant,
        projectSlug: projectKey,
        queryEmbedding,
        minSimilarity,
        limit
      });
    });

    return searchResult.records.map(record => ({
      id: record.get('id'),
      ref: record.get('ref'),
      text: record.get('text'),
      pattern: record.get('pattern') || undefined,
      verification: record.get('verification') || undefined,
      qaScore: record.get('qaScore') || undefined,
      similarity: Number(record.get('similarity'))
    }));

  } finally {
    await session.close();
  }
}

/**
 * Find potential duplicate requirements
 * Uses high similarity threshold (0.85+)
 */
export async function findPotentialDuplicates(
  tenant: string,
  projectKey: string,
  requirementId: string
): Promise<SimilarRequirement[]> {
  return findSimilarRequirements(tenant, projectKey, requirementId, {
    minSimilarity: 0.85,  // High threshold for duplicates
    limit: 5,
    excludeArchived: false  // Include archived (might be duplicates)
  });
}
```

### Step 2.3: Add API Routes (Day 4)

**File:** `backend/src/routes/semantic-search.ts` (new file)

```typescript
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  findSimilarRequirements,
  searchRequirementsByQuery,
  findPotentialDuplicates
} from "../services/graph/requirements/semantic-search.js";

const semanticSearchRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/requirements/:tenant/:project/:id/similar
  fastify.get<{
    Params: { tenant: string; project: string; id: string };
    Querystring: { minSimilarity?: string; limit?: string };
  }>(
    '/requirements/:tenant/:project/:id/similar',
    {
      schema: {
        params: z.object({
          tenant: z.string(),
          project: z.string(),
          id: z.string()
        }),
        querystring: z.object({
          minSimilarity: z.string().optional(),
          limit: z.string().optional()
        }).optional()
      }
    },
    async (request, reply) => {
      const { tenant, project, id } = request.params;
      const minSimilarity = request.query.minSimilarity
        ? parseFloat(request.query.minSimilarity)
        : undefined;
      const limit = request.query.limit
        ? parseInt(request.query.limit, 10)
        : undefined;

      const similar = await findSimilarRequirements(tenant, project, id, {
        minSimilarity,
        limit
      });

      return reply.send({ similar });
    }
  );

  // POST /api/requirements/search/semantic
  fastify.post<{
    Body: {
      tenant: string;
      project: string;
      query: string;
      minSimilarity?: number;
      limit?: number;
    };
  }>(
    '/requirements/search/semantic',
    {
      schema: {
        body: z.object({
          tenant: z.string(),
          project: z.string(),
          query: z.string().min(1),
          minSimilarity: z.number().min(0).max(1).optional(),
          limit: z.number().int().min(1).max(100).optional()
        })
      }
    },
    async (request, reply) => {
      const { tenant, project, query, minSimilarity, limit } = request.body;

      const results = await searchRequirementsByQuery(tenant, project, query, {
        minSimilarity,
        limit
      });

      return reply.send({ results });
    }
  );

  // GET /api/requirements/:tenant/:project/:id/duplicates
  fastify.get<{
    Params: { tenant: string; project: string; id: string };
  }>(
    '/requirements/:tenant/:project/:id/duplicates',
    {
      schema: {
        params: z.object({
          tenant: z.string(),
          project: z.string(),
          id: z.string()
        })
      }
    },
    async (request, reply) => {
      const { tenant, project, id } = request.params;

      const duplicates = await findPotentialDuplicates(tenant, project, id);

      return reply.send({ duplicates });
    }
  );
};

export default semanticSearchRoutes;
```

**Register routes in:** `backend/src/server.ts`

```typescript
import semanticSearchRoutes from './routes/semantic-search.js';

// In the server setup:
await fastify.register(semanticSearchRoutes);
```

### Step 2.4: Test Semantic Search (Day 5)

**Manual testing:**

```bash
# 1. Create a requirement (embedding generated automatically)
curl -X POST http://localhost:8787/requirements \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant": "default",
    "projectKey": "test",
    "title": "Braking test",
    "text": "When brake pedal exceeds 50N, the system shall decelerate within 250ms",
    "pattern": "event",
    "verification": "Test"
  }'

# Response: { "ref": "REQ-001", "id": "abc123..." }

# 2. Find similar requirements
curl http://localhost:8787/requirements/default/test/abc123/similar

# 3. Search by natural language query
curl -X POST http://localhost:8787/requirements/search/semantic \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant": "default",
    "project": "test",
    "query": "timing requirements for braking"
  }'

# 4. Check for duplicates
curl http://localhost:8787/requirements/default/test/abc123/duplicates
```

---

## Phase 3: UI & Migration (Week 3)

**Goal:** Add UI components and migrate existing requirements

### Step 3.1: Create Embedding Background Worker (Day 6)

**File:** `backend/src/workers/embedding-worker.ts` (new file)

```typescript
import { analyzeRequirement } from "@airgen/req-qa";
import { getSession } from "../services/graph/driver.js";
import { embeddingService } from "../services/embedding.js";
import type { ManagedTransaction } from "neo4j-driver";

export type EmbeddingWorkerStatus = {
  isRunning: boolean;
  processedCount: number;
  totalCount: number;
  currentRequirement: string | null;
  operation: string | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type EmbeddingWorkerOperation =
  | 'reembed-all'           // Re-generate all embeddings
  | 'backfill'              // Only embed requirements without embeddings
  | 'cluster-analysis';     // Future: compute clusters

class EmbeddingWorker {
  private isRunning = false;
  private processedCount = 0;
  private totalCount = 0;
  private currentRequirement: string | null = null;
  private operation: string | null = null;
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private completedAt: string | null = null;
  private shouldStop = false;

  getStatus(): EmbeddingWorkerStatus {
    return {
      isRunning: this.isRunning,
      processedCount: this.processedCount,
      totalCount: this.totalCount,
      currentRequirement: this.currentRequirement,
      operation: this.operation,
      lastError: this.lastError,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  stop() {
    this.shouldStop = true;
  }

  async start(
    tenant: string,
    projectKey: string,
    operation: EmbeddingWorkerOperation = 'backfill'
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error("Embedding worker is already running");
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.processedCount = 0;
    this.totalCount = 0;
    this.currentRequirement = null;
    this.operation = operation;
    this.lastError = null;
    this.startedAt = new Date().toISOString();
    this.completedAt = null;

    // Run in background (don't await)
    this.processRequirements(tenant, projectKey, operation)
      .catch(err => {
        this.lastError = err.message;
        console.error('[EmbeddingWorker] Error:', err);
      })
      .finally(() => {
        this.isRunning = false;
        this.currentRequirement = null;
        this.completedAt = new Date().toISOString();
      });
  }

  private async processRequirements(
    tenant: string,
    projectKey: string,
    operation: EmbeddingWorkerOperation
  ): Promise<void> {
    const session = getSession();

    try {
      // Get requirements that need embedding
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        let whereClause = `
          WHERE (req.deleted IS NULL OR req.deleted = false)
            AND (req.archived IS NULL OR req.archived = false)
        `;

        // For backfill, only get requirements without embeddings
        if (operation === 'backfill') {
          whereClause += `AND (req.embedding IS NULL OR size(req.embedding) = 0)\n`;
        }

        const query = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
          WHERE doc.deletedAt IS NULL
          MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
          ${whereClause}
          RETURN req.id AS id, req.ref AS ref, req.text AS text, req.embedding AS embedding
          ORDER BY req.createdAt DESC
        `;

        return tx.run(query, {
          tenantSlug: tenant,
          projectSlug: projectKey
        });
      });

      const requirements = result.records.map(r => ({
        id: String(r.get('id')),
        ref: String(r.get('ref')),
        text: String(r.get('text')),
        embedding: r.get('embedding') || null
      }));

      this.totalCount = requirements.length;

      console.log(
        `[EmbeddingWorker] Processing ${this.totalCount} requirements (operation: ${operation})`
      );

      // Process each requirement
      for (const req of requirements) {
        if (this.shouldStop) {
          console.log('[EmbeddingWorker] Stopped by user');
          break;
        }

        this.currentRequirement = req.ref;

        try {
          // Generate embedding
          const embedding = await embeddingService.generateEmbedding(req.text);

          // Update requirement with embedding
          await session.executeWrite(async (tx: ManagedTransaction) => {
            return tx.run(
              `
              MATCH (req:Requirement {id: $id})
              SET req.embedding = $embedding,
                  req.embeddingModel = $model,
                  req.embeddingGeneratedAt = datetime(),
                  req.updatedAt = datetime()
              RETURN req
              `,
              {
                id: req.id,
                embedding: embedding,
                model: 'text-embedding-3-small'
              }
            );
          });

          this.processedCount++;

          // Rate limiting: respect OpenAI limits (3000 RPM)
          // ~20ms delay = 50 req/sec = 3000 req/min
          await new Promise(resolve => setTimeout(resolve, 20));

          // Log progress every 10 requirements
          if (this.processedCount % 10 === 0) {
            console.log(
              `[EmbeddingWorker] Progress: ${this.processedCount}/${this.totalCount}`
            );
          }

        } catch (error) {
          console.error(`[EmbeddingWorker] Failed to embed ${req.ref}:`, error);
          this.lastError = `Failed to embed ${req.ref}: ${(error as Error).message}`;
          // Continue with next requirement (resilient)
        }
      }

      console.log(
        `[EmbeddingWorker] Completed: ${this.processedCount}/${this.totalCount} requirements embedded`
      );

    } catch (error) {
      this.lastError = `Worker error: ${(error as Error).message}`;
      throw error;
    } finally {
      await session.close();
    }
  }
}

// Singleton instance
export const embeddingWorker = new EmbeddingWorker();
```

### Step 3.2: Add Worker API Routes (Day 6)

**File:** `backend/src/routes/workers.ts`

Add to existing workers routes:

```typescript
import { embeddingWorker } from '../workers/embedding-worker.js';

// Add these routes alongside existing QA worker routes:

// POST /api/workers/embedding/start
fastify.post<{
  Body: {
    tenant: string;
    project: string;
    operation?: 'reembed-all' | 'backfill';
  };
}>(
  '/workers/embedding/start',
  {
    schema: {
      body: z.object({
        tenant: z.string(),
        project: z.string(),
        operation: z.enum(['reembed-all', 'backfill']).optional()
      })
    }
  },
  async (request, reply) => {
    const { tenant, project, operation = 'backfill' } = request.body;

    await embeddingWorker.start(tenant, project, operation);

    return reply.send({ success: true });
  }
);

// GET /api/workers/embedding/status
fastify.get('/workers/embedding/status', async (request, reply) => {
  const status = embeddingWorker.getStatus();
  return reply.send(status);
});

// POST /api/workers/embedding/stop
fastify.post('/workers/embedding/stop', async (request, reply) => {
  embeddingWorker.stop();
  return reply.send({ success: true });
});
```

### Step 3.3: Add UI for "Find Similar" Button (Day 7)

**File:** `frontend/src/components/requirements/SimilarRequirementsModal.tsx` (new file)

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../../lib/client';
import { Modal, Button as ModalButton } from '../Modal';
import { Spinner } from '../Spinner';
import { AlertCircle, Check } from 'lucide-react';

interface SimilarRequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: string;
  project: string;
  requirementId: string;
  requirementRef: string;
}

export function SimilarRequirementsModal({
  isOpen,
  onClose,
  tenant,
  project,
  requirementId,
  requirementRef
}: SimilarRequirementsModalProps) {
  const api = useApiClient();

  const similarQuery = useQuery({
    queryKey: ['similar-requirements', tenant, project, requirementId],
    queryFn: () => api.getSimilarRequirements(tenant, project, requirementId),
    enabled: isOpen
  });

  const duplicatesQuery = useQuery({
    queryKey: ['duplicate-requirements', tenant, project, requirementId],
    queryFn: () => api.getPotentialDuplicates(tenant, project, requirementId),
    enabled: isOpen
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Similar to ${requirementRef}`}
      size="large"
      footer={
        <ModalButton variant="secondary" onClick={onClose}>
          Close
        </ModalButton>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Potential Duplicates */}
        {duplicatesQuery.data && duplicatesQuery.data.duplicates.length > 0 && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              color: '#f59e0b'
            }}>
              <AlertCircle size={20} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Potential Duplicates (≥85% similar)
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {duplicatesQuery.data.duplicates.map(req => (
                <div
                  key={req.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid #fcd34d',
                    borderRadius: '0.5rem',
                    backgroundColor: '#fffbeb'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ fontWeight: 600 }}>{req.ref}</span>
                    <span style={{
                      fontSize: '0.875rem',
                      color: '#f59e0b',
                      fontWeight: 600
                    }}>
                      {Math.round(req.similarity * 100)}% similar
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>{req.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar Requirements */}
        <div>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: 600,
            marginBottom: '0.75rem'
          }}>
            Similar Requirements (≥70% similar)
          </h3>

          {similarQuery.isLoading ? (
            <Spinner />
          ) : similarQuery.isError ? (
            <p style={{ color: '#dc2626' }}>
              Error: {(similarQuery.error as Error).message}
            </p>
          ) : similarQuery.data && similarQuery.data.similar.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {similarQuery.data.similar.map(req => (
                <div
                  key={req.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    backgroundColor: '#f9fafb'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ fontWeight: 600 }}>{req.ref}</span>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {Math.round(req.similarity * 100)}% similar
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>{req.text}</p>
                  {req.qaScore && (
                    <div style={{
                      marginTop: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#6b7280'
                    }}>
                      QA Score: {req.qaScore}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
              No similar requirements found
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
```

### Step 3.4: Add API Client Methods (Day 7)

**File:** `frontend/src/lib/client.ts`

Add these methods to the API client:

```typescript
// In useApiClient hook:

getSimilarRequirements: async (tenant: string, project: string, id: string) => {
  const response = await fetch(
    `${baseUrl}/requirements/${tenant}/${project}/${id}/similar`,
    { headers: await getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch similar requirements');
  return response.json();
},

getPotentialDuplicates: async (tenant: string, project: string, id: string) => {
  const response = await fetch(
    `${baseUrl}/requirements/${tenant}/${project}/${id}/duplicates`,
    { headers: await getHeaders() }
  );
  if (!response.ok) throw new Error('Failed to fetch duplicates');
  return response.json();
},

searchRequirementsSemantic: async (
  tenant: string,
  project: string,
  query: string
) => {
  const response = await fetch(
    `${baseUrl}/requirements/search/semantic`,
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ tenant, project, query })
    }
  );
  if (!response.ok) throw new Error('Failed to search requirements');
  return response.json();
},
```

### Step 3.5: Add "Find Similar" Button to Requirements Table (Day 7)

**File:** `frontend/src/routes/RequirementsRoute.tsx`

Add button to each requirement row:

```typescript
import { SimilarRequirementsModal } from '../components/requirements/SimilarRequirementsModal';

// Add state for modal
const [similarModalOpen, setSimilarModalOpen] = useState(false);
const [selectedRequirement, setSelectedRequirement] = useState<{
  id: string;
  ref: string;
} | null>(null);

// In the table row actions:
<button
  type="button"
  className="ghost-button"
  onClick={() => {
    setSelectedRequirement({ id: req.id, ref: req.ref });
    setSimilarModalOpen(true);
  }}
  title="Find similar requirements"
>
  Find Similar
</button>

// Add modal at end of component:
{selectedRequirement && (
  <SimilarRequirementsModal
    isOpen={similarModalOpen}
    onClose={() => {
      setSimilarModalOpen(false);
      setSelectedRequirement(null);
    }}
    tenant={state.tenant!}
    project={state.project!}
    requirementId={selectedRequirement.id}
    requirementRef={selectedRequirement.ref}
  />
)}
```

### Step 3.6: Add Embedding Worker to Dashboard (Day 8)

**File:** `frontend/src/routes/DashboardRoute.tsx`

Add alongside QA worker section:

```typescript
// Add query for embedding worker status
const embeddingWorkerStatusQuery = useQuery({
  queryKey: ["embedding-worker-status"],
  queryFn: api.getEmbeddingWorkerStatus,
  refetchInterval: (query) => {
    return query.state.data?.isRunning ? 2000 : false;
  }
});

// Add mutations
const startEmbeddingWorkerMutation = useMutation({
  mutationFn: ({ tenant, project, operation }: {
    tenant: string;
    project: string;
    operation?: 'reembed-all' | 'backfill';
  }) => api.startEmbeddingWorker(tenant, project, operation),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["embedding-worker-status"] });
  }
});

const stopEmbeddingWorkerMutation = useMutation({
  mutationFn: api.stopEmbeddingWorker,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["embedding-worker-status"] });
  }
});

// Add UI section after QA worker:
<PageHeader
  title="Embedding Worker"
  description="Generate semantic embeddings for similarity search and duplicate detection"
  actions={state.tenant && state.project && (
    embeddingWorkerStatusQuery.data?.isRunning ? (
      <Button
        variant="destructive"
        onClick={() => stopEmbeddingWorkerMutation.mutate()}
        disabled={stopEmbeddingWorkerMutation.isPending}
      >
        Stop Worker
      </Button>
    ) : (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          onClick={() => startEmbeddingWorkerMutation.mutate({
            tenant: state.tenant!,
            project: state.project!,
            operation: 'backfill'
          })}
          disabled={startEmbeddingWorkerMutation.isPending}
        >
          Backfill Missing
        </Button>
        <Button
          variant="outline"
          onClick={() => startEmbeddingWorkerMutation.mutate({
            tenant: state.tenant!,
            project: state.project!,
            operation: 'reembed-all'
          })}
          disabled={startEmbeddingWorkerMutation.isPending}
        >
          Re-embed All
        </Button>
      </div>
    )
  )}
/>

{/* Worker status display - copy from QA worker and adapt */}
```

---

## Testing Strategy

### Unit Tests (Day 9)

**File:** `backend/src/services/graph/requirements/semantic-search.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import {
  findSimilarRequirements,
  searchRequirementsByQuery,
  findPotentialDuplicates
} from './semantic-search.js';

describe('Semantic Search', () => {
  const tenant = 'test-tenant';
  const project = 'test-project';
  let testRequirementId: string;

  beforeAll(async () => {
    // Create test requirements with known similarities
    // ... setup code
  });

  it('should find similar requirements', async () => {
    const similar = await findSimilarRequirements(tenant, project, testRequirementId);

    expect(similar).toBeDefined();
    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].similarity).toBeGreaterThan(0.7);
  });

  it('should search by natural language query', async () => {
    const results = await searchRequirementsByQuery(
      tenant,
      project,
      'braking and timing requirements'
    );

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should detect potential duplicates', async () => {
    const duplicates = await findPotentialDuplicates(tenant, project, testRequirementId);

    expect(duplicates).toBeDefined();
    // All should be highly similar
    duplicates.forEach(dup => {
      expect(dup.similarity).toBeGreaterThanOrEqual(0.85);
    });
  });
});
```

### Integration Tests (Day 9)

**Test checklist:**
- [ ] Create requirement → embedding generated automatically
- [ ] Update requirement text → embedding regenerated
- [ ] Update requirement (text unchanged) → embedding reused
- [ ] Search similar → returns semantically related requirements
- [ ] Detect duplicates → high similarity threshold works
- [ ] Background worker → processes all requirements
- [ ] Background worker → can be stopped mid-process
- [ ] Background worker → resilient to individual failures

### E2E Tests (Day 10)

**File:** `e2e/embeddings.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Embeddings Features', () => {
  test('should find similar requirements', async ({ page }) => {
    // Login and navigate to requirements
    await page.goto('/requirements');

    // Click "Find Similar" on a requirement
    await page.click('[data-testid="find-similar-btn"]');

    // Modal should open
    await expect(page.locator('[data-testid="similar-modal"]')).toBeVisible();

    // Should show similar requirements
    await expect(page.locator('[data-testid="similar-item"]')).toHaveCount.greaterThan(0);
  });

  test('should warn about potential duplicates', async ({ page }) => {
    // Create a requirement
    await page.goto('/requirements');
    await page.click('[data-testid="create-requirement-btn"]');
    await page.fill('[name="text"]', 'Test requirement text');
    await page.click('[data-testid="submit-btn"]');

    // Create very similar requirement
    await page.click('[data-testid="create-requirement-btn"]');
    await page.fill('[name="text"]', 'Test requirement text with minor change');
    await page.click('[data-testid="submit-btn"]');

    // Should show duplicate warning
    await expect(page.locator('[data-testid="duplicate-warning"]')).toBeVisible();
  });
});
```

---

## Rollout Plan

### Step 1: Deploy Backend (Day 11)

```bash
# 1. Update production environment
cd /root/airgen

# 2. Pull latest code
git pull origin master

# 3. Install dependencies
pnpm install

# 4. Build backend
pnpm -C backend build

# 5. Create vector indexes
pnpm -C backend tsx src/scripts/create-vector-indexes.ts

# 6. Restart backend service
docker-compose -f docker-compose.prod.yml restart backend

# 7. Verify deployment
curl https://airgen.studio/api/health
curl https://airgen.studio/api/workers/embedding/status
```

### Step 2: Run Migration Worker (Day 11)

```bash
# Backfill embeddings for all existing requirements
curl -X POST https://airgen.studio/api/workers/embedding/start \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "tenant": "default",
    "project": "your-project",
    "operation": "backfill"
  }'

# Monitor progress
watch -n 2 'curl -s https://airgen.studio/api/workers/embedding/status | jq'

# Wait for completion (will process ~50 requirements per minute)
# For 1000 requirements: ~20 minutes
```

### Step 3: Deploy Frontend (Day 11)

```bash
# 1. Build frontend
pnpm -C frontend build

# 2. Deploy static files
# (Your existing deployment process)

# 3. Verify UI
# - Visit https://airgen.studio/requirements
# - Click "Find Similar" on a requirement
# - Should see modal with similar requirements
```

### Step 4: Validate & Monitor (Day 12)

**Validation checklist:**
- [ ] New requirements get embeddings automatically
- [ ] "Find Similar" works for all requirements
- [ ] Duplicate detection catches high-similarity requirements
- [ ] Search performance is acceptable (<500ms)
- [ ] Embedding worker completes without errors
- [ ] No increase in API costs (embeddings are cheap)

**Monitoring:**
```bash
# Check embedding coverage
curl -s https://airgen.studio/api/requirements/default/your-project \
  | jq '[.requirements[] | select(.embedding == null)] | length'
# Should return: 0 (all have embeddings)

# Check embedding service stats
# Add to dashboard or logs
```

---

## Cost Analysis

### OpenAI Embedding Costs

**Model:** `text-embedding-3-small`
**Pricing:** $0.02 per 1M tokens

**Typical requirement:**
- Text: 50 words = ~65 tokens
- Cost per requirement: **$0.0000013** (less than a thousandth of a cent)

**For 10,000 requirements:**
- One-time embedding: 10,000 × 65 tokens = 650,000 tokens
- Cost: **$0.013** (yes, one cent)
- Monthly updates (500 changed): **$0.001/month**

**Annual cost for 10,000 requirements:** **~$0.025/year**

### Storage Costs

**Per requirement:**
- Embedding: 1536 floats × 4 bytes = 6,144 bytes (~6 KB)
- 10,000 requirements = 60 MB for embeddings
- Neo4j index overhead: ~2x = 120 MB total

**Negligible compared to text and metadata**

### Performance Impact

**Generation latency:**
- OpenAI API call: 100-300ms
- Acceptable for user-facing writes
- Background worker handles bulk

**Search latency:**
- Vector search (10k requirements): 20-50ms
- Excellent user experience

---

## Success Metrics

Track these metrics after deployment:

### Usage Metrics
- [ ] Number of "Find Similar" clicks per day
- [ ] Number of duplicate warnings shown
- [ ] Number of semantic searches performed
- [ ] Percentage of requirements with embeddings

### Quality Metrics
- [ ] User feedback on similarity relevance
- [ ] Number of duplicates caught before creation
- [ ] Reduction in manual traceability work

### Performance Metrics
- [ ] Average similarity search latency
- [ ] Embedding generation failure rate
- [ ] Worker completion time for 1000 requirements

### Cost Metrics
- [ ] Monthly OpenAI embedding API costs
- [ ] Storage growth rate

---

## Troubleshooting

### Problem: Neo4j vector index not found

**Solution:**
```bash
# Check Neo4j version
docker exec airgen-neo4j-1 cypher-shell "CALL dbms.components()"

# If version < 5.11, upgrade Neo4j
# Then re-run index creation script
```

### Problem: Embedding generation slow

**Solution:**
```typescript
// Check if using batch generation for multiple requirements
// Use embeddingService.generateBatch() instead of individual calls
```

### Problem: High similarity threshold not finding matches

**Solution:**
```typescript
// Lower minSimilarity threshold
await findSimilarRequirements(tenant, project, id, {
  minSimilarity: 0.6  // Lower from 0.7
});
```

### Problem: Worker runs out of memory

**Solution:**
```typescript
// Process in smaller batches
// Add memory-friendly pagination to worker
```

---

## Next Steps (Future Enhancements)

After successful rollout, consider:

### Phase 4: Advanced Features (Month 2)
- [ ] Cluster analysis (group related requirements automatically)
- [ ] Cross-project similarity search
- [ ] Quality pattern learning (find requirements like high-scoring ones)
- [ ] Automatic trace link suggestions based on embeddings

### Phase 5: Optimization (Month 3)
- [ ] Redis caching layer
- [ ] Batch embedding generation for imports
- [ ] Incremental index updates
- [ ] Performance monitoring dashboard

### Phase 6: Intelligence (Month 4+)
- [ ] Requirement auto-tagging based on clusters
- [ ] Gap analysis (missing requirement areas)
- [ ] Quality prediction (predict QA score before generation)
- [ ] Semantic changelog (what actually changed in meaning)

---

## Questions & Support

**Contact:** development team
**Documentation:** This file
**Issues:** GitHub issues tracker

Good luck with the implementation! The foundation is solid and the existing codebase makes this a straightforward addition.
