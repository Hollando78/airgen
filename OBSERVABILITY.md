# AIRGen Observability Infrastructure

This document describes the observability infrastructure for the AIRGen backend system, including metrics collection, error tracking, and monitoring best practices.

## Table of Contents

1. [Overview](#overview)
2. [Prometheus Metrics](#prometheus-metrics)
3. [Sentry Error Tracking](#sentry-error-tracking)
4. [Health Check Endpoint](#health-check-endpoint)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Grafana Dashboards](#grafana-dashboards)
8. [Alerting Rules](#alerting-rules)
9. [Troubleshooting](#troubleshooting)

## Overview

AIRGen implements a comprehensive observability stack with graceful degradation:

- **Prometheus Metrics**: HTTP request metrics, Neo4j query metrics, cache metrics, and system metrics
- **Sentry Error Tracking**: Automatic error capture with context, user tracking, and performance monitoring
- **Health Checks**: Enhanced health endpoint with service status and cache statistics

All observability dependencies are **optional**. The system works normally without them, logging warnings when features are disabled.

## Prometheus Metrics

### Installation

```bash
cd backend
npm install prom-client
```

### Available Metrics

#### HTTP Request Metrics

**`http_request_duration_seconds` (Histogram)**
- Description: Duration of HTTP requests in seconds
- Labels: `method`, `route`, `status_code`
- Buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10 seconds

**`http_requests_total` (Counter)**
- Description: Total number of HTTP requests
- Labels: `method`, `route`, `status_code`

#### Neo4j Query Metrics

**`neo4j_query_duration_seconds` (Histogram)**
- Description: Duration of Neo4j queries in seconds
- Labels: `query_type`
- Buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5 seconds

**`neo4j_queries_total` (Counter)**
- Description: Total number of Neo4j queries executed
- Labels: `query_type`, `status` (success/error)

#### Cache Metrics

**`cache_hits_total` (Counter)**
- Description: Total number of cache hits
- Labels: `cache_key_prefix`

**`cache_misses_total` (Counter)**
- Description: Total number of cache misses
- Labels: `cache_key_prefix`

#### Connection Metrics

**`active_connections` (Gauge)**
- Description: Number of active database connections
- Labels: `type` (neo4j, redis)

#### Default Metrics

The following Node.js metrics are automatically collected:

- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `nodejs_heap_size_total_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_external_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- And many more...

### Metrics Endpoint

Metrics are exposed at:

```
GET /metrics
```

This endpoint:
- Is **unauthenticated** (for Prometheus scraping)
- Returns metrics in Prometheus text format
- Does not appear in Swagger documentation
- Returns an informative message if `prom-client` is not installed

### Example Usage

#### Instrumenting Neo4j Queries

```typescript
import { trackNeo4jQuery } from '../lib/metrics.js';

async function getRequirements(tenant: string, project: string) {
  return trackNeo4jQuery('getRequirements', async () => {
    const session = getSession();
    // ... execute query
    return results;
  });
}
```

#### Recording Custom Metrics

```typescript
import { recordCacheHit, recordCacheMiss } from '../lib/metrics.js';

// Cache hit
recordCacheHit('documents:acme:project1');

// Cache miss
recordCacheMiss('requirements:acme:project1');
```

### Prometheus Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'airgen-backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:8787']
    metrics_path: '/metrics'
```

## Sentry Error Tracking

### Installation

```bash
cd backend
npm install @sentry/node @sentry/profiling-node
```

Note: `@sentry/profiling-node` is optional for performance profiling.

### Configuration

Set environment variables:

```bash
# Required - Your Sentry DSN
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id

# Optional - Environment name (defaults to NODE_ENV)
SENTRY_ENVIRONMENT=production

# Optional - Sample rate for performance monitoring (0.0 to 1.0, default: 0.1)
SENTRY_TRACES_SAMPLE_RATE=0.1

# Optional - Release version (defaults to package.json version)
SENTRY_RELEASE=1.0.0
```

If `SENTRY_DSN` is not set, error tracking is gracefully disabled with a log message.

### Features

#### Automatic Error Capture

All uncaught exceptions and unhandled promise rejections are automatically captured and sent to Sentry.

#### Request Context

Every error includes:
- HTTP method and URL
- Request headers (user-agent, content-type)
- Query parameters
- User IP address
- Authenticated user information (if available)

#### User Tracking

Errors are associated with authenticated users:

```typescript
import { setUser, clearUser } from '../lib/sentry.js';

// After authentication
setUser({
  id: user.userId,
  email: user.email,
  username: user.email,
  roles: user.roles
});

// On logout
clearUser();
```

#### Manual Error Capture

```typescript
import { captureException, captureMessage } from '../lib/sentry.js';

try {
  // Some operation
} catch (error) {
  captureException(error, {
    context: 'custom context',
    userId: '123',
    // Any additional context
  });
}

// Capture informational messages
captureMessage('Something important happened', 'info', {
  customData: 'value'
});
```

#### Breadcrumbs

Track the sequence of events leading to an error:

```typescript
import { addBreadcrumb } from '../lib/sentry.js';

addBreadcrumb('User logged in', 'auth', 'info', {
  userId: '123',
  email: 'user@example.com'
});

addBreadcrumb('Fetching requirements', 'api', 'info', {
  tenant: 'acme',
  project: 'project1'
});
```

#### Performance Monitoring

Track slow operations:

```typescript
import { startTransaction, finishTransaction } from '../lib/sentry.js';

const transaction = startTransaction('processLargeFile', 'task');

try {
  // Long-running operation
  await processFile(file);
} finally {
  finishTransaction(transaction);
}
```

### Error Filtering

The system automatically filters:
- Health check errors (from `/health` endpoint)
- Health check transactions (sampled at 1%)

## Health Check Endpoint

Enhanced health endpoint with comprehensive system status:

```
GET /api/health
```

### Response Structure

```json
{
  "ok": true,
  "timestamp": "2025-09-30T12:34:56.789Z",
  "uptime": 3600.5,
  "environment": "production",
  "version": "0.1.0",
  "memory": {
    "heapUsedMB": 45.23,
    "heapTotalMB": 128.50,
    "rssMB": 150.75,
    "externalMB": 2.34
  },
  "services": {
    "database": "connected",
    "cache": "connected",
    "llm": "configured"
  },
  "observability": {
    "metrics": true,
    "errorTracking": true
  },
  "cacheStats": {
    "totalConnections": "42",
    "totalCommands": "1234",
    "keyspaceHits": "890",
    "keyspaceMisses": "344"
  }
}
```

### Service Status Values

- **database**: `connected`, `disconnected`, `unknown`
- **cache**: `connected`, `unavailable`
- **llm**: `configured`, `not-configured`

## Installation

### Full Observability Stack

Install all optional dependencies:

```bash
cd backend
npm install prom-client @sentry/node @sentry/profiling-node redis
```

### Minimal Setup (No Observability)

No additional packages needed. The system will log warnings:

```
INFO: prom-client not installed, metrics disabled. Install with: npm install prom-client
INFO: SENTRY_DSN not configured, error tracking disabled
INFO: Redis module not installed, caching disabled. Install with: npm install redis
```

### Partial Setup

Install only what you need:

```bash
# Metrics only
npm install prom-client

# Error tracking only
npm install @sentry/node

# Cache only
npm install redis
```

## Configuration

### Environment Variables

```bash
# Sentry Configuration
SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_RELEASE=1.0.0

# Redis Configuration (for caching)
REDIS_URL=redis://localhost:6379
```

## Grafana Dashboards

### Dashboard 1: HTTP Performance

**Panels:**

1. **Request Rate (QPS)**
   ```promql
   sum(rate(http_requests_total[5m])) by (route)
   ```

2. **Request Duration p95**
   ```promql
   histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))
   ```

3. **Error Rate**
   ```promql
   sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)
   ```

4. **Status Code Distribution**
   ```promql
   sum(rate(http_requests_total[5m])) by (status_code)
   ```

### Dashboard 2: Neo4j Performance

**Panels:**

1. **Query Rate**
   ```promql
   sum(rate(neo4j_queries_total[5m])) by (query_type)
   ```

2. **Query Duration p95**
   ```promql
   histogram_quantile(0.95, sum(rate(neo4j_query_duration_seconds_bucket[5m])) by (le, query_type))
   ```

3. **Query Success Rate**
   ```promql
   sum(rate(neo4j_queries_total{status="success"}[5m]))
   /
   sum(rate(neo4j_queries_total[5m]))
   ```

4. **Active Connections**
   ```promql
   active_connections{type="neo4j"}
   ```

### Dashboard 3: Cache Performance

**Panels:**

1. **Cache Hit Rate**
   ```promql
   sum(rate(cache_hits_total[5m]))
   /
   (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))
   ```

2. **Cache Operations**
   ```promql
   sum(rate(cache_hits_total[5m])) by (cache_key_prefix)
   sum(rate(cache_misses_total[5m])) by (cache_key_prefix)
   ```

3. **Redis Connections**
   ```promql
   active_connections{type="redis"}
   ```

### Dashboard 4: System Resources

**Panels:**

1. **Memory Usage**
   ```promql
   nodejs_heap_size_used_bytes / 1024 / 1024
   ```

2. **Event Loop Lag**
   ```promql
   nodejs_eventloop_lag_seconds
   ```

3. **CPU Usage**
   ```promql
   rate(process_cpu_user_seconds_total[5m])
   rate(process_cpu_system_seconds_total[5m])
   ```

## Alerting Rules

### Prometheus Alert Rules

Create `alerts.yml`:

```yaml
groups:
  - name: airgen_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)
          /
          sum(rate(http_requests_total[5m])) by (route)
          > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.route }}"
          description: "Error rate is {{ $value | humanizePercentage }} on route {{ $labels.route }}"

      # Slow requests
      - alert: SlowRequests
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow requests on {{ $labels.route }}"
          description: "P95 latency is {{ $value }}s on route {{ $labels.route }}"

      # Database connection issues
      - alert: DatabaseDisconnected
        expr: active_connections{type="neo4j"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Neo4j database disconnected"
          description: "No active Neo4j connections detected"

      # High cache miss rate
      - alert: HighCacheMissRate
        expr: |
          sum(rate(cache_misses_total[5m]))
          /
          (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])))
          > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High cache miss rate"
          description: "Cache miss rate is {{ $value | humanizePercentage }}"

      # High memory usage
      - alert: HighMemoryUsage
        expr: |
          nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Heap usage is {{ $value | humanizePercentage }}"

      # Event loop lag
      - alert: EventLoopLag
        expr: nodejs_eventloop_lag_seconds > 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High event loop lag"
          description: "Event loop lag is {{ $value }}s"

      # Neo4j query failures
      - alert: Neo4jQueryFailures
        expr: |
          sum(rate(neo4j_queries_total{status="error"}[5m]))
          /
          sum(rate(neo4j_queries_total[5m]))
          > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High Neo4j query failure rate"
          description: "Query failure rate is {{ $value | humanizePercentage }}"
```

### Alertmanager Configuration

Create `alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'team-notifications'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: 'team-notifications'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK_URL'
        channel: '#airgen-alerts'
        title: 'AIRGen Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

    email_configs:
      - to: 'team@example.com'
        from: 'alerts@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alerts@example.com'
        auth_password: 'password'
```

## Troubleshooting

### Metrics Not Appearing

**Problem**: `/metrics` endpoint returns "Metrics not available"

**Solutions**:
1. Install prom-client: `npm install prom-client`
2. Restart the server
3. Check logs for initialization errors

### Sentry Not Capturing Errors

**Problem**: Errors not appearing in Sentry

**Solutions**:
1. Verify `SENTRY_DSN` is set correctly
2. Check logs for "Sentry initialized successfully"
3. Verify network connectivity to Sentry
4. Check Sentry project settings

### Cache Metrics Always Zero

**Problem**: Cache hit/miss metrics show zero

**Solutions**:
1. Install Redis: `npm install redis`
2. Start Redis server: `redis-server`
3. Set `REDIS_URL` if using non-default settings
4. Check logs for Redis connection status

### High Memory Usage

**Problem**: Memory usage continuously growing

**Solutions**:
1. Check for memory leaks in custom code
2. Review cache TTL settings
3. Monitor `nodejs_heap_size_used_bytes` metric
4. Consider implementing cache size limits

### Slow Health Checks

**Problem**: `/api/health` endpoint is slow

**Solutions**:
1. Health check queries the database - this is expected
2. If consistently slow (>1s), check Neo4j connection
3. Consider caching health check results for 5-10 seconds

### Prometheus Scrape Errors

**Problem**: Prometheus can't scrape metrics

**Solutions**:
1. Verify server is running on expected port
2. Check firewall rules
3. Verify `/metrics` endpoint is accessible
4. Check Prometheus logs for specific errors

## Best Practices

### Metric Naming

- Use `_total` suffix for counters
- Use `_seconds` suffix for durations
- Use descriptive label names
- Keep cardinality low (avoid unique IDs in labels)

### Error Tracking

- Add context to captured exceptions
- Use breadcrumbs for debugging trails
- Set user context after authentication
- Filter sensitive data from error reports

### Performance

- Sample high-volume transactions (health checks at 1%)
- Use appropriate histogram buckets
- Monitor event loop lag
- Set reasonable cache TTLs

### Alerting

- Alert on symptoms, not causes
- Use appropriate thresholds
- Include runbook links in alerts
- Test alert rules regularly

## Support

For issues or questions:
- Check application logs
- Review this documentation
- Check Prometheus/Sentry documentation
- Contact the development team

## License

Part of the AIRGen project.
