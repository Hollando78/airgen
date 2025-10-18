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
      const firstKey = this.memoryCache.keys().next().value as string | undefined;
      if (typeof firstKey === "string") {
        this.memoryCache.delete(firstKey);
      }
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
