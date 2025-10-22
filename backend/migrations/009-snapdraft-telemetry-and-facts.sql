-- Migration: Extend SnapDraft telemetry and add fact extraction cache
-- Description: Add telemetry columns to track mode decisions, context stats, costs
--              Add fact extraction cache table for performance optimization

-- ===== TELEMETRY ENHANCEMENTS =====

-- Extend snapdraft_generation_logs with comprehensive telemetry
ALTER TABLE snapdraft_generation_logs ADD COLUMN IF NOT EXISTS mode_decision JSONB;
ALTER TABLE snapdraft_generation_logs ADD COLUMN IF NOT EXISTS context_stats JSONB;
ALTER TABLE snapdraft_generation_logs ADD COLUMN IF NOT EXISTS total_cost_usd NUMERIC(10, 6);

-- Comments for new telemetry columns
COMMENT ON COLUMN snapdraft_generation_logs.mode_decision IS 'Mode analyzer decision: {mode, score, issues, visualizationType}';
COMMENT ON COLUMN snapdraft_generation_logs.context_stats IS 'Context retrieval statistics: {directReqs, semanticReqs, multiHopConnections, extractedFacts, cacheHits}';
COMMENT ON COLUMN snapdraft_generation_logs.total_cost_usd IS 'Total OpenAI API cost in USD for this generation';

-- ===== FACT EXTRACTION CACHE =====

-- Table for caching extracted facts from documents and requirements
CREATE TABLE IF NOT EXISTS snapdraft_extracted_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('requirement', 'document')),
  source_id VARCHAR(255) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,  -- SHA256 hash of source content
  facts JSONB NOT NULL,  -- Array of ExtractedFact objects
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one cache entry per (source_id, content_hash) pair
  CONSTRAINT unique_source_content UNIQUE(source_id, content_hash)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_extracted_facts_source ON snapdraft_extracted_facts(source_id);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_hash ON snapdraft_extracted_facts(content_hash);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_type ON snapdraft_extracted_facts(source_type);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_extracted_at ON snapdraft_extracted_facts(extracted_at DESC);

-- GIN index on facts JSONB for querying fact types
CREATE INDEX IF NOT EXISTS idx_extracted_facts_jsonb ON snapdraft_extracted_facts USING GIN (facts);

-- Comments for documentation
COMMENT ON TABLE snapdraft_extracted_facts IS 'Cache for LLM-extracted technical facts (dimensions, materials, tolerances) from requirements and documents';
COMMENT ON COLUMN snapdraft_extracted_facts.source_type IS 'Type of source: requirement or document';
COMMENT ON COLUMN snapdraft_extracted_facts.source_id IS 'ID of the requirement or document (title for documents)';
COMMENT ON COLUMN snapdraft_extracted_facts.content_hash IS 'SHA256 hash of source content for cache invalidation';
COMMENT ON COLUMN snapdraft_extracted_facts.facts IS 'Array of extracted facts in JSON format: {type, value, unit, feature, confidence, sourceId, sourceType}';

-- ===== CLEANUP POLICY =====

-- Function to clean up old fact cache entries (> 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_extracted_facts()
RETURNS void AS $$
BEGIN
  DELETE FROM snapdraft_extracted_facts
  WHERE extracted_at < NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Cleaned up old extracted facts cache entries';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (can be called manually or via cron)
COMMENT ON FUNCTION cleanup_old_extracted_facts IS 'Removes fact cache entries older than 30 days to prevent unbounded growth';

-- ===== STATISTICS =====

-- View for telemetry analytics
CREATE OR REPLACE VIEW snapdraft_telemetry_summary AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS total_generations,
  AVG(prompt_tokens) AS avg_prompt_tokens,
  AVG(completion_tokens) AS avg_completion_tokens,
  AVG(total_cost_usd) AS avg_cost_usd,
  SUM(total_cost_usd) AS total_cost_usd,
  AVG(latency_ms) AS avg_latency_ms,
  COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) AS error_count,
  COUNT(CASE WHEN mode_decision->>'mode' = 'technical_drawing' THEN 1 END) AS technical_drawing_count,
  COUNT(CASE WHEN mode_decision->>'mode' = 'visualization' THEN 1 END) AS visualization_count,
  AVG((mode_decision->>'suitabilityScore')::NUMERIC) AS avg_suitability_score
FROM snapdraft_generation_logs
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

COMMENT ON VIEW snapdraft_telemetry_summary IS 'Daily aggregated telemetry for SnapDraft generations: costs, performance, mode decisions';

-- View for fact extraction cache statistics
CREATE OR REPLACE VIEW snapdraft_fact_cache_stats AS
SELECT
  source_type,
  COUNT(*) AS total_entries,
  AVG(JSONB_ARRAY_LENGTH(facts)) AS avg_facts_per_source,
  MIN(extracted_at) AS oldest_entry,
  MAX(extracted_at) AS newest_entry
FROM snapdraft_extracted_facts
GROUP BY source_type;

COMMENT ON VIEW snapdraft_fact_cache_stats IS 'Statistics on fact extraction cache: entry counts, average facts per source, cache age';
