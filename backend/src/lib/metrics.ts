/**
 * Prometheus Metrics Infrastructure
 *
 * This module provides comprehensive observability metrics for the AIRGen system:
 * - HTTP request metrics (latency, throughput, status codes)
 * - Neo4j query metrics (query duration, query counts)
 * - Cache metrics (hits, misses)
 * - Active connections tracking
 *
 * OPTIONAL DEPENDENCY: prom-client
 * If prom-client is not installed, metrics will be gracefully disabled.
 * Install with: npm install prom-client
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger.js';

// Type definitions for prom-client (conditional)
type Registry = any;
type Histogram = any;
type Counter = any;
type Gauge = any;

// Metrics instances
let registry: Registry | null = null;
let httpRequestDuration: Histogram | null = null;
let httpRequestsTotal: Counter | null = null;
let neo4jQueryDuration: Histogram | null = null;
let neo4jQueriesTotal: Counter | null = null;
let activeConnections: Gauge | null = null;
let cacheHitsTotal: Counter | null = null;
let cacheMissesTotal: Counter | null = null;

// Module availability flag
let isMetricsAvailable = false;

/**
 * Initialize Prometheus metrics
 * Gracefully handles missing prom-client dependency
 */
export async function initMetrics(): Promise<void> {
  try {
    // Dynamically import prom-client
    const promClient = await import('prom-client');

    // Create registry
    registry = new promClient.Registry();

    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register: registry });

    // HTTP Request Duration Histogram
    httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [registry],
    });

    // HTTP Requests Total Counter
    httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [registry],
    });

    // Neo4j Query Duration Histogram
    neo4jQueryDuration = new promClient.Histogram({
      name: 'neo4j_query_duration_seconds',
      help: 'Duration of Neo4j queries in seconds',
      labelNames: ['query_type'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [registry],
    });

    // Neo4j Queries Total Counter
    neo4jQueriesTotal = new promClient.Counter({
      name: 'neo4j_queries_total',
      help: 'Total number of Neo4j queries executed',
      labelNames: ['query_type', 'status'],
      registers: [registry],
    });

    // Active Database Connections Gauge
    activeConnections = new promClient.Gauge({
      name: 'active_connections',
      help: 'Number of active database connections',
      labelNames: ['type'],
      registers: [registry],
    });

    // Cache Hits Counter
    cacheHitsTotal = new promClient.Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_key_prefix'],
      registers: [registry],
    });

    // Cache Misses Counter
    cacheMissesTotal = new promClient.Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_key_prefix'],
      registers: [registry],
    });

    isMetricsAvailable = true;
    logger.info('Prometheus metrics initialized successfully');
  } catch (err) {
    logger.info('prom-client not installed, metrics disabled. Install with: npm install prom-client');
    isMetricsAvailable = false;
  }
}

/**
 * Get metrics availability status
 */
export function areMetricsAvailable(): boolean {
  return isMetricsAvailable;
}

/**
 * Extract route pattern from URL for consistent labeling
 * Removes tenant/project slugs and IDs to group similar routes
 */
function normalizeRoute(url: string): string {
  // Remove query parameters
  const path = url.split('?')[0];

  // Replace UUIDs and IDs with placeholders
  let normalized = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[0-9]+/g, '/:id')
    // Replace tenant slugs (assume format /tenants/:slug/)
    .replace(/\/tenants\/[^/]+/, '/tenants/:tenant')
    // Replace project slugs
    .replace(/\/projects\/[^/]+/, '/projects/:project')
    // Replace requirement IDs
    .replace(/\/requirements\/[^/]+/, '/requirements/:id')
    // Replace document IDs
    .replace(/\/documents\/[^/]+/, '/documents/:id')
    // Replace diagram IDs
    .replace(/\/diagrams\/[^/]+/, '/diagrams/:id');

  return normalized;
}

/**
 * Fastify middleware to track HTTP request metrics
 */
export async function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!isMetricsAvailable || !httpRequestDuration || !httpRequestsTotal) {
    return;
  }

  const startTime = Date.now();

  // Track request completion
  reply.raw.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const route = normalizeRoute(request.url);
    const method = request.method;
    const statusCode = reply.statusCode.toString();

    // Record histogram
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );

    // Increment counter
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
  });
}

/**
 * Track Neo4j query execution
 *
 * @param queryType - Type of query (e.g., 'getRequirements', 'createDocument')
 * @param executeFn - Function that executes the query
 * @returns Query result
 */
export async function trackNeo4jQuery<T>(
  queryType: string,
  executeFn: () => Promise<T>
): Promise<T> {
  if (!isMetricsAvailable || !neo4jQueryDuration || !neo4jQueriesTotal) {
    return executeFn();
  }

  const startTime = Date.now();
  let status = 'success';

  try {
    const result = await executeFn();
    return result;
  } catch (err) {
    status = 'error';
    throw err;
  } finally {
    const duration = (Date.now() - startTime) / 1000;

    neo4jQueryDuration.observe({ query_type: queryType }, duration);
    neo4jQueriesTotal.inc({ query_type: queryType, status });
  }
}

/**
 * Track active database connections
 *
 * @param type - Connection type (e.g., 'neo4j', 'redis')
 * @param count - Number of active connections
 */
export function setActiveConnections(type: string, count: number): void {
  if (!isMetricsAvailable || !activeConnections) {
    return;
  }

  activeConnections.set({ type }, count);
}

/**
 * Increment active database connections
 *
 * @param type - Connection type
 */
export function incrementActiveConnections(type: string): void {
  if (!isMetricsAvailable || !activeConnections) {
    return;
  }

  activeConnections.inc({ type });
}

/**
 * Decrement active database connections
 *
 * @param type - Connection type
 */
export function decrementActiveConnections(type: string): void {
  if (!isMetricsAvailable || !activeConnections) {
    return;
  }

  activeConnections.dec({ type });
}

/**
 * Record cache hit
 *
 * @param cacheKey - Full cache key (will be normalized to prefix)
 */
export function recordCacheHit(cacheKey: string): void {
  if (!isMetricsAvailable || !cacheHitsTotal) {
    return;
  }

  const prefix = extractCacheKeyPrefix(cacheKey);
  cacheHitsTotal.inc({ cache_key_prefix: prefix });
}

/**
 * Record cache miss
 *
 * @param cacheKey - Full cache key (will be normalized to prefix)
 */
export function recordCacheMiss(cacheKey: string): void {
  if (!isMetricsAvailable || !cacheMissesTotal) {
    return;
  }

  const prefix = extractCacheKeyPrefix(cacheKey);
  cacheMissesTotal.inc({ cache_key_prefix: prefix });
}

/**
 * Extract cache key prefix for metric labeling
 * E.g., "documents:tenant:project:100:0" -> "documents"
 */
function extractCacheKeyPrefix(cacheKey: string): string {
  const parts = cacheKey.split(':');
  return parts[0] || 'unknown';
}

/**
 * Get Prometheus metrics in text format
 * Returns empty string if metrics are not available
 */
export async function getMetrics(): Promise<string> {
  if (!isMetricsAvailable || !registry) {
    return '# Metrics not available - prom-client not installed\n';
  }

  return registry.metrics();
}

/**
 * Get metrics as JSON (for internal monitoring)
 */
export async function getMetricsJSON(): Promise<any> {
  if (!isMetricsAvailable || !registry) {
    return { error: 'Metrics not available - prom-client not installed' };
  }

  return registry.getMetricsAsJSON();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  if (!isMetricsAvailable || !registry) {
    return;
  }

  registry.resetMetrics();
  logger.debug('Metrics reset');
}
