import { Pool } from 'pg';
import type { ExtractedFact, FactCacheInterface } from './fact-extractor.js';

/**
 * PostgreSQL-backed cache for extracted facts
 * Implements FactCacheInterface for use with FactExtractor
 */
export class PostgresFactCache implements FactCacheInterface {
  constructor(private pool: Pool) {}

  /**
   * Get cached facts for a source
   */
  async get(sourceId: string, contentHash: string): Promise<ExtractedFact[] | null> {
    try {
      const result = await this.pool.query(
        `SELECT facts FROM snapdraft_extracted_facts
         WHERE source_id = $1 AND content_hash = $2`,
        [sourceId, contentHash]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].facts as ExtractedFact[];
    } catch (error) {
      console.error('[FactCache] Get error:', error);
      return null; // Graceful fallback - don't break generation on cache errors
    }
  }

  /**
   * Store extracted facts in cache
   */
  async set(
    sourceId: string,
    contentHash: string,
    sourceType: string,
    facts: ExtractedFact[]
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO snapdraft_extracted_facts (source_type, source_id, content_hash, facts)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_id, content_hash)
         DO UPDATE SET facts = EXCLUDED.facts, extracted_at = NOW()`,
        [sourceType, sourceId, contentHash, JSON.stringify(facts)]
      );
    } catch (error) {
      console.error('[FactCache] Set error:', error);
      // Don't throw - cache failures shouldn't break generation
    }
  }

  /**
   * Clean up old cache entries (for maintenance)
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM snapdraft_extracted_facts
         WHERE extracted_at < NOW() - INTERVAL '${olderThanDays} days'`
      );

      const deletedCount = result.rowCount || 0;
      console.log(`[FactCache] Cleaned up ${deletedCount} old entries`);
      return deletedCount;
    } catch (error) {
      console.error('[FactCache] Cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    requirementEntries: number;
    documentEntries: number;
    avgFactsPerEntry: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN source_type = 'requirement' THEN 1 END) as requirement_entries,
          COUNT(CASE WHEN source_type = 'document' THEN 1 END) as document_entries,
          AVG(JSONB_ARRAY_LENGTH(facts)) as avg_facts_per_entry
        FROM snapdraft_extracted_facts
      `);

      const row = result.rows[0];
      return {
        totalEntries: parseInt(row.total_entries) || 0,
        requirementEntries: parseInt(row.requirement_entries) || 0,
        documentEntries: parseInt(row.document_entries) || 0,
        avgFactsPerEntry: parseFloat(row.avg_facts_per_entry) || 0,
      };
    } catch (error) {
      console.error('[FactCache] Stats error:', error);
      return {
        totalEntries: 0,
        requirementEntries: 0,
        documentEntries: 0,
        avgFactsPerEntry: 0,
      };
    }
  }
}
