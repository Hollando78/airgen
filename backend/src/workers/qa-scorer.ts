import { analyzeRequirement } from "@airgen/req-qa";
import { getSession } from "../services/graph/driver.js";
import { updateRequirement } from "../services/graph/requirements/requirements-crud.js";
import { logger } from "../lib/logger.js";
import type { ManagedTransaction } from "neo4j-driver";

export type QAScorerStatus = {
  isRunning: boolean;
  processedCount: number;
  totalCount: number;
  currentRequirement: string | null;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

class QAScorer {
  private isRunning = false;
  private processedCount = 0;
  private totalCount = 0;
  private currentRequirement: string | null = null;
  private lastError: string | null = null;
  private startedAt: string | null = null;
  private completedAt: string | null = null;
  private shouldStop = false;

  getStatus(): QAScorerStatus {
    return {
      isRunning: this.isRunning,
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

  async scoreAllRequirements(tenant: string, projectKey: string): Promise<void> {
    if (this.isRunning) {
      throw new Error("QA scorer is already running");
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.processedCount = 0;
    this.totalCount = 0;
    this.currentRequirement = null;
    this.lastError = null;
    this.startedAt = new Date().toISOString();
    this.completedAt = null;

    const session = getSession();

    try {
      // Get all requirements that need scoring (no qaScore or old scores)
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        const query = `
          MATCH (tenant:Tenant {slug: $tenantSlug})-[:OWNS]->(project:Project {slug: $projectSlug})
          MATCH (project)-[:HAS_DOCUMENT]->(doc:Document)
          WHERE doc.deletedAt IS NULL
          MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
          WHERE (req.deleted IS NULL OR req.deleted = false)
            AND (req.archived IS NULL OR req.archived = false)
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

      // Process each requirement
      for (const req of requirements) {
        if (this.shouldStop) {
          break;
        }

        this.currentRequirement = req.ref;

        try {
          // Analyze the requirement using the QA package
          const analysis = await analyzeRequirement(req.text);

          // Update the requirement with QA results
          await updateRequirement(
            tenant,
            projectKey,
            req.id,
            {
              qaScore: analysis.score,
              qaVerdict: analysis.verdict,
              suggestions: analysis.suggestions || []
            }
          );

          this.processedCount++;
        } catch (error) {
          logger.error({ err: error, ref: req.ref }, `Error scoring requirement ${req.ref}`);
          this.lastError = `Failed to score ${req.ref}: ${(error as Error).message}`;
          // Continue with next requirement
        }
      }

      this.completedAt = new Date().toISOString();
    } catch (error) {
      this.lastError = `Worker error: ${(error as Error).message}`;
      throw error;
    } finally {
      this.isRunning = false;
      this.currentRequirement = null;
      await session.close();
    }
  }
}

// Singleton instance
export const qaScorer = new QAScorer();
