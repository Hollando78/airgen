import { getSession } from "../services/graph/driver.js";
import { embeddingService } from "../services/embedding.js";
import type { ManagedTransaction } from "neo4j-driver";

export type EmbeddingWorkerStatus = {
  isRunning: boolean;
  operation: 'backfill' | 'reembed-all' | null;
  processedCount: number;
  totalCount: number;
  currentRequirement: string | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

class EmbeddingWorker {
  private isRunning = false;
  private operation: 'backfill' | 'reembed-all' | null = null;
  private processedCount = 0;
  private totalCount = 0;
  private currentRequirement: string | null = null;
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private completedAt: string | null = null;
  private shouldStop = false;

  getStatus(): EmbeddingWorkerStatus {
    return {
      isRunning: this.isRunning,
      operation: this.operation,
      processedCount: this.processedCount,
      totalCount: this.totalCount,
      currentRequirement: this.currentRequirement,
      lastError: this.lastError,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  stop() {
    this.shouldStop = true;
  }

  /**
   * Backfill embeddings for requirements that don't have them
   */
  async backfillEmbeddings(tenant: string, projectKey: string): Promise<void> {
    await this.processEmbeddings(tenant, projectKey, 'backfill');
  }

  /**
   * Regenerate embeddings for all requirements
   */
  async reembedAll(tenant: string, projectKey: string): Promise<void> {
    await this.processEmbeddings(tenant, projectKey, 'reembed-all');
  }

  private async processEmbeddings(
    tenant: string,
    projectKey: string,
    operation: 'backfill' | 'reembed-all'
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error("Embedding worker is already running");
    }

    this.isRunning = true;
    this.operation = operation;
    this.shouldStop = false;
    this.processedCount = 0;
    this.totalCount = 0;
    this.currentRequirement = null;
    this.lastError = null;
    this.startedAt = new Date().toISOString();
    this.completedAt = null;

    const session = getSession();

    try {
      // Get requirements based on operation type
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        let query = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
          WHERE doc.deletedAt IS NULL
          MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
          WHERE (req.deleted IS NULL OR req.deleted = false)
            AND (req.archived IS NULL OR req.archived = false)
        `;

        // For backfill, only get requirements without embeddings
        if (operation === 'backfill') {
          query += `AND (req.embedding IS NULL OR size(req.embedding) = 0)\n`;
        }

        query += `
          RETURN req.id AS id, req.ref AS ref, req.text AS text
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
        text: String(r.get('text'))
      }));

      this.totalCount = requirements.length;

      console.log(`[EmbeddingWorker] Starting ${operation} for ${this.totalCount} requirements`);

      // Process each requirement
      for (const req of requirements) {
        if (this.shouldStop) {
          console.log(`[EmbeddingWorker] Stopping at ${this.processedCount}/${this.totalCount}`);
          break;
        }

        this.currentRequirement = req.ref;

        try {
          // Generate embedding
          const embedding = await embeddingService.generateEmbedding(req.text);
          const now = new Date().toISOString();

          // Update the requirement in Neo4j
          await session.executeWrite(async (tx: ManagedTransaction) => {
            const updateQuery = `
              MATCH (req:Requirement {id: $id})
              SET req.embedding = $embedding,
                  req.embeddingModel = $embeddingModel,
                  req.embeddingGeneratedAt = $embeddingGeneratedAt
              RETURN req.id AS id
            `;

            return tx.run(updateQuery, {
              id: req.id,
              embedding,
              embeddingModel: 'text-embedding-3-small',
              embeddingGeneratedAt: now
            });
          });

          this.processedCount++;

          // Log progress every 10 requirements
          if (this.processedCount % 10 === 0) {
            console.log(`[EmbeddingWorker] Progress: ${this.processedCount}/${this.totalCount}`);
          }
        } catch (error) {
          console.error(`[EmbeddingWorker] Error processing requirement ${req.ref}:`, error);
          this.lastError = `Failed to process ${req.ref}: ${(error as Error).message}`;
          // Continue with next requirement
        }

        // Small delay to avoid rate limiting (10ms between requests)
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      this.completedAt = new Date().toISOString();
      console.log(`[EmbeddingWorker] Completed: ${this.processedCount}/${this.totalCount} requirements`);
    } catch (error) {
      this.lastError = `Worker error: ${(error as Error).message}`;
      console.error('[EmbeddingWorker] Fatal error:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.operation = null;
      this.currentRequirement = null;
      await session.close();
    }
  }
}

// Singleton instance
export const embeddingWorker = new EmbeddingWorker();
