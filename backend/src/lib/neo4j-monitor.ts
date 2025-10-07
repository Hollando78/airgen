/**
 * Neo4j Query Performance Monitoring
 *
 * This module provides utilities for monitoring and profiling Neo4j query performance,
 * helping identify slow queries and optimization opportunities.
 *
 * Features:
 * - Automatic query duration tracking
 * - Slow query detection and logging
 * - Query profiling with EXPLAIN and PROFILE
 * - Metrics collection for monitoring dashboards
 */

import type { Session, ManagedTransaction, QueryResult } from "neo4j-driver";
import { logger } from "./logger.js";
import { recordQueryDuration } from "./metrics.js";

/**
 * Configuration for query monitoring
 */
export const MONITORING_CONFIG = {
  // Queries taking longer than this are logged as warnings
  slowQueryThresholdMs: 1000,

  // Queries taking longer than this are logged as errors
  criticalQueryThresholdMs: 5000,

  // Enable detailed query profiling in development
  enableProfiling: process.env.API_ENV !== "production",

  // Enable query parameter logging (disable in production for security)
  logParameters: process.env.API_ENV !== "production",
} as const;

/**
 * Query execution metadata
 */
export interface QueryMetadata {
  query: string;
  params?: Record<string, unknown>;
  duration: number;
  recordCount?: number;
  source?: string;
}

/**
 * Execute a Neo4j query with automatic performance monitoring
 *
 * @param sessionOrTx - Neo4j session or transaction
 * @param query - Cypher query string
 * @param params - Query parameters
 * @param source - Optional identifier for the query source (e.g., function name)
 * @returns Query result
 *
 * @example
 * const result = await executeMonitoredQuery(
 *   session,
 *   'MATCH (n:User {id: $id}) RETURN n',
 *   { id: '123' },
 *   'getUserById'
 * );
 */
export async function executeMonitoredQuery<T = QueryResult>(
  sessionOrTx: Session | ManagedTransaction,
  query: string,
  params: Record<string, unknown> = {},
  source?: string
): Promise<T> {
  const startTime = Date.now();
  let recordCount: number | undefined;

  try {
    const result = await sessionOrTx.run(query, params);
    recordCount = result.records.length;
    const duration = Date.now() - startTime;

    // Log query metadata
    logQueryExecution({
      query,
      params: MONITORING_CONFIG.logParameters ? params : undefined,
      duration,
      recordCount,
      source,
    });

    // Record metrics
    recordQueryDuration(source || "unknown", duration);

    return result as T;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log failed query with error details
    logger.error(
      {
        query: truncateQuery(query),
        params: MONITORING_CONFIG.logParameters ? params : undefined,
        duration,
        source,
        err: error,
      },
      "Neo4j query failed"
    );

    throw error;
  }
}

/**
 * Log query execution based on performance thresholds
 */
function logQueryExecution(metadata: QueryMetadata): void {
  const { query, params, duration, recordCount, source } = metadata;

  // Critical slow query
  if (duration >= MONITORING_CONFIG.criticalQueryThresholdMs) {
    logger.error(
      {
        query: truncateQuery(query),
        params,
        duration,
        recordCount,
        source,
      },
      "Critical slow Neo4j query detected"
    );
  }
  // Slow query warning
  else if (duration >= MONITORING_CONFIG.slowQueryThresholdMs) {
    logger.warn(
      {
        query: truncateQuery(query),
        params,
        duration,
        recordCount,
        source,
      },
      "Slow Neo4j query detected"
    );
  }
  // Normal query (debug level)
  else {
    logger.debug(
      {
        query: truncateQuery(query),
        duration,
        recordCount,
        source,
      },
      "Neo4j query executed"
    );
  }
}

/**
 * Truncate long queries for logging
 */
function truncateQuery(query: string, maxLength: number = 500): string {
  const normalized = query.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.substring(0, maxLength) + "...";
}

/**
 * Profile a query using Neo4j's PROFILE command
 * This executes the query and returns detailed execution statistics
 *
 * @param session - Neo4j session
 * @param query - Cypher query to profile
 * @param params - Query parameters
 * @returns Profiling information
 *
 * @example
 * const profile = await profileQuery(session, 'MATCH (n) RETURN n', {});
 * console.log('DB Hits:', profile.profile.dbHits);
 */
export async function profileQuery(
  session: Session,
  query: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  if (!MONITORING_CONFIG.enableProfiling) {
    logger.warn("Query profiling is disabled in production");
    throw new Error("Query profiling is disabled in production");
  }

  const profileQuery = `PROFILE ${query}`;

  logger.info(
    {
      query: truncateQuery(query),
      params: MONITORING_CONFIG.logParameters ? params : undefined,
    },
    "Profiling Neo4j query"
  );

  const result = await session.run(profileQuery, params);

  // Extract profiling information
  if (result.summary.profile) {
    logger.info(
      {
        query: truncateQuery(query),
        dbHits: result.summary.profile.dbHits,
        records: result.records.length,
        profile: result.summary.profile,
      },
      "Query profile completed"
    );
  }

  return result;
}

/**
 * Explain a query using Neo4j's EXPLAIN command
 * This does NOT execute the query, just shows the execution plan
 *
 * @param session - Neo4j session
 * @param query - Cypher query to explain
 * @param params - Query parameters
 * @returns Query execution plan
 *
 * @example
 * const plan = await explainQuery(session, 'MATCH (n) RETURN n', {});
 * console.log('Execution plan:', plan.summary.plan);
 */
export async function explainQuery(
  session: Session,
  query: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  if (!MONITORING_CONFIG.enableProfiling) {
    logger.warn("Query explanation is disabled in production");
    throw new Error("Query explanation is disabled in production");
  }

  const explainQuery = `EXPLAIN ${query}`;

  logger.info(
    {
      query: truncateQuery(query),
      params: MONITORING_CONFIG.logParameters ? params : undefined,
    },
    "Explaining Neo4j query"
  );

  const result = await session.run(explainQuery, params);

  // Extract execution plan
  if (result.summary.plan) {
    logger.info(
      {
        query: truncateQuery(query),
        plan: result.summary.plan,
      },
      "Query explanation completed"
    );
  }

  return result;
}

/**
 * Decorator function to automatically monitor query execution
 * Use this to wrap existing query functions
 *
 * @example
 * const monitoredListRequirements = withQueryMonitoring(
 *   listRequirements,
 *   'listRequirements'
 * );
 */
export function withQueryMonitoring<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  functionName: string
): T {
  return (async (...args: unknown[]) => {
    const startTime = Date.now();

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      logger.debug(
        {
          function: functionName,
          duration,
        },
        "Neo4j operation completed"
      );

      recordQueryDuration(functionName, duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        {
          function: functionName,
          duration,
          err: error,
        },
        "Neo4j operation failed"
      );

      throw error;
    }
  }) as T;
}

/**
 * Get query performance statistics
 * This can be exposed via an admin endpoint for monitoring
 */
export interface QueryStats {
  slowQueries: number;
  criticalQueries: number;
  averageDuration: number;
  totalQueries: number;
}

// Simple in-memory stats (consider using Redis for production)
const stats = {
  slowQueries: 0,
  criticalQueries: 0,
  totalDuration: 0,
  totalQueries: 0,
};

/**
 * Record query statistics
 * Called automatically by executeMonitoredQuery
 */
export function recordQueryStats(duration: number): void {
  stats.totalQueries++;
  stats.totalDuration += duration;

  if (duration >= MONITORING_CONFIG.criticalQueryThresholdMs) {
    stats.criticalQueries++;
  } else if (duration >= MONITORING_CONFIG.slowQueryThresholdMs) {
    stats.slowQueries++;
  }
}

/**
 * Get current query statistics
 */
export function getQueryStats(): QueryStats {
  return {
    slowQueries: stats.slowQueries,
    criticalQueries: stats.criticalQueries,
    averageDuration: stats.totalQueries > 0 ? stats.totalDuration / stats.totalQueries : 0,
    totalQueries: stats.totalQueries,
  };
}

/**
 * Reset query statistics
 */
export function resetQueryStats(): void {
  stats.slowQueries = 0;
  stats.criticalQueries = 0;
  stats.totalDuration = 0;
  stats.totalQueries = 0;
}
