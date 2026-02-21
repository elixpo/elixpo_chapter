/**
 * Prometheus Metrics Service
 * Tracks application metrics for monitoring and alerting
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a single registry
const register = new Registry();

// Add default metrics
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

/**
 * HTTP Request Metrics
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

/**
 * Authentication Metrics
 */
export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['type', 'status'], // type: login, register, oauth
  registers: [register],
});

export const activeUsers = new Gauge({
  name: 'active_users_total',
  help: 'Total number of active users',
  registers: [register],
});

export const emailVerifications = new Counter({
  name: 'email_verifications_total',
  help: 'Total email verifications',
  labelNames: ['status'],
  registers: [register],
});

/**
 * OAuth Metrics
 */
export const oauthRequestsCounter = new Counter({
  name: 'oauth_requests_total',
  help: 'Total OAuth requests',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const oauthTokensIssued = new Counter({
  name: 'oauth_tokens_issued_total',
  help: 'Total OAuth tokens issued',
  labelNames: ['token_type'],
  registers: [register],
});

/**
 * API Key Metrics
 */
export const apiKeyRequestsCounter = new Counter({
  name: 'api_key_requests_total',
  help: 'Total API key requests',
  labelNames: ['endpoint', 'status'],
  registers: [register],
});

export const apiKeyRequestDuration = new Histogram({
  name: 'api_key_request_duration_seconds',
  help: 'API key request duration in seconds',
  labelNames: ['endpoint'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

/**
 * Database Metrics
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbConnections = new Gauge({
  name: 'db_connections_active',
  help: 'Active database connections',
  registers: [register],
});

/**
 * Error Metrics
 */
export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total errors',
  labelNames: ['error_type', 'endpoint'],
  registers: [register],
});

export const rateLimitExceeded = new Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Rate limit exceeded count',
  labelNames: ['endpoint', 'ip'],
  registers: [register],
});

/**
 * Admin Metrics
 */
export const adminActions = new Counter({
  name: 'admin_actions_total',
  help: 'Total admin actions performed',
  labelNames: ['action', 'resource', 'status'],
  registers: [register],
});

export const adminActivityGauge = new Gauge({
  name: 'admin_activity_current',
  help: 'Current admin activity level',
  registers: [register],
});

/**
 * Application Metrics
 */
export const appRegistrations = new Counter({
  name: 'app_registrations_total',
  help: 'Total OAuth app registrations',
  registers: [register],
});

export const userRegistrations = new Counter({
  name: 'user_registrations_total',
  help: 'Total user registrations',
  labelNames: ['provider'], // direct, google, github, etc
  registers: [register],
});

/**
 * System Metrics
 */
export const uptime = new Gauge({
  name: 'system_uptime_seconds',
  help: 'Application uptime in seconds',
  registers: [register],
});

export const systemMemoryUsage = new Gauge({
  name: 'system_memory_usage_bytes',
  help: 'System memory usage in bytes',
  registers: [register],
});

/**
 * Webhook Metrics
 */
export const webhookDispatchDuration = new Histogram({
  name: 'webhook_dispatch_duration_seconds',
  help: 'Webhook dispatch duration in seconds',
  labelNames: ['event_type', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const webhookFailures = new Counter({
  name: 'webhook_failures_total',
  help: 'Total webhook failures',
  labelNames: ['event_type', 'reason'],
  registers: [register],
});

/**
 * Get Prometheus metrics as text
 */
export async function getMetricsText(): Promise<string> {
  return register.metrics();
}

/**
 * Helper to record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  duration: number
) {
  httpRequestDuration.labels(method, route, status.toString()).observe(duration);
  httpRequestCounter.labels(method, route, status.toString()).inc();
}

/**
 * Helper to record database query metrics
 */
export function recordDbQuery(queryType: string, duration: number) {
  dbQueryDuration.labels(queryType).observe(duration);
}

/**
 * Helper to record error metrics
 */
export function recordError(errorType: string, endpoint: string) {
  errorCounter.labels(errorType, endpoint).inc();
}

/**
 * Helper to record admin action
 */
export function recordAdminAction(action: string, resource: string, status: string) {
  adminActions.labels(action, resource, status).inc();
}

/**
 * Update system metrics
 */
export function updateSystemMetrics() {
  if (typeof process !== 'undefined' && process.uptime) {
    uptime.set(process.uptime());
  }

  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memUsage = process.memoryUsage();
    systemMemoryUsage.set(memUsage.heapUsed);
  }
}

// Update system metrics periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    updateSystemMetrics();
  }, 30000); // Every 30 seconds
}

export { register };
