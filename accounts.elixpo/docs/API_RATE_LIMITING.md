# API Key Rate Limiting Implementation

## Overview

The API key rate limiting system provides comprehensive request tracking and enforcement for API keys. It uses a sliding window approach with minute-based tracking to ensure fair usage across all API consumers.

## Features

### 1. **Sliding Window Rate Limiting**
- Tracks requests within a configurable time window
- Counts only requests that fall within the current window
- Automatically resets when the window expires
- Per-API key rate limit configuration

### 2. **Request Tracking**
- Logs every API request with full metadata:
  - Endpoint and HTTP method
  - Status code and response time
  - IP address and user agent
  - Timestamp

### 3. **Rate Limit Headers**
All API responses include rate limit information:
```
X-RateLimit-Limit: 1000          # Max requests allowed in window
X-RateLimit-Window: 60           # Time window in seconds
X-RateLimit-Remaining: 987       # Remaining requests in current window
Retry-After: 45                  # Seconds to wait (only on 429 responses)
```

### 4. **Analytics & Reporting**
- Track request statistics per API key
- Identify top endpoints and methods
- Monitor success vs failure rates
- Average response time calculation

## Usage

### Basic Setup

```typescript
import { withApiAuth } from '@/lib/api-auth-middleware';

// Protect an API route
export const POST = withApiAuth(
  async (request, context) => {
    // context.apiKeyId - The API key ID
    // context.userId - The user who owns the API key
    // context.scopes - Permissions granted to this key
    // context.rateLimitRequests - Max requests
    // context.rateLimitWindow - Window size in seconds

    return NextResponse.json({ success: true });
  },
  ['auth:read', 'auth:write'] // Required scopes
);
```

### API Key Configuration

When creating an API key, specify rate limits:

```typescript
import { generateApiKey } from '@/lib/api-key-service';

const { key, apiKey } = await generateApiKey(
  userId,
  'My API Key',
  {
    'auth:read': true,
    'auth:write': true,
  },
  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiration
  'Optional description'
);

// Default rate limits (can be customized):
// - rateLimitRequests: 1000
// - rateLimitWindow: 60 (seconds)
```

## Rate Limiting Logic

### Sliding Window Algorithm

```
Window Duration: 60 seconds
Max Requests: 1000

Example Timeline:
Time 0:00   - Request 1-100 (100 requests)
Time 0:30   - Request 101-500 (400 requests) [Total: 500]
Time 1:00   - Request 501-800 (300 requests) [Total: 800]
Time 1:30   - Request 801-1000 (200 requests) [Total: 1000] ✓
Time 1:45   - Request 1001+ (REJECTED - limit exceeded)
             Wait 15 seconds until Time 2:00 when window resets
Time 2:00   - Request 1001-1100 (100 requests) [Window reset, total: 100]
```

### Database Schema

```sql
-- API Keys
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  rate_limit_requests INTEGER,
  rate_limit_window INTEGER,
  last_used_at DATETIME,
  -- ... other fields
);

-- Usage Tracking
CREATE TABLE api_key_usage (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
```

## Functions

### Check Rate Limit

```typescript
import { checkApiKeyRateLimit } from '@/lib/api-rate-limiter';

const status = await checkApiKeyRateLimit(
  apiKeyId,           // string
  rateLimitRequests,  // number (e.g., 1000)
  rateLimitWindow     // number in seconds (e.g., 60)
);

// Returns:
{
  allowed: boolean,              // Can the request proceed?
  requestsUsed: number,          // Requests in current window
  requestsLimit: number,         // Max allowed
  remainingRequests: number,     // How many left
  resetAt: Date,                 // When window resets
  retryAfter?: number            // Seconds to wait (if exceeded)
}
```

### Log Request Usage

```typescript
import { logApiKeyUsage } from '@/lib/api-rate-limiter';

await logApiKeyUsage(
  apiKeyId,      // string
  endpoint,      // string (e.g., '/api/users')
  method,        // string (e.g., 'GET')
  statusCode,    // number (200, 404, 500, etc.)
  responseTime,  // number in milliseconds
  ipAddress,     // string
  userAgent      // string (optional)
);
```

### Get Statistics

```typescript
import { getApiKeyStats } from '@/lib/api-rate-limiter';

const stats = await getApiKeyStats(
  apiKeyId,
  24  // Last 24 hours
);

// Returns:
{
  totalRequests: number,
  successfulRequests: number,      // status < 400
  failedRequests: number,          // status >= 400
  averageResponseTime: number,     // ms
  topEndpoints: [
    { endpoint: string, count: number },
    // ...
  ],
  topMethods: [
    { method: string, count: number },
    // ...
  ]
}
```

### Get Recent Requests

```typescript
import { getApiKeyRequests } from '@/lib/api-rate-limiter';

const requests = await getApiKeyRequests(
  apiKeyId,
  50  // Last 50 requests
);

// Returns array of:
{
  id: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number,
  ipAddress: string,
  userAgent?: string,
  createdAt: string
}
```

### Cleanup Old Records

```typescript
import { cleanupOldApiKeyUsage } from '@/lib/api-rate-limiter';

// Remove records older than 90 days
await cleanupOldApiKeyUsage(90);

// Run this in a cron job or scheduled task
```

## HTTP Status Codes

### Success (2xx)
- Includes rate limit headers
- Request counted against limit

### Client Errors (4xx)
- **401 Unauthorized**: Invalid or missing API key
- **403 Forbidden**: API key lacks required scopes
- **429 Too Many Requests**: Rate limit exceeded
  - Includes `Retry-After` header
  - Includes rate limit headers

### Server Errors (5xx)
- **500 Internal Server Error**: Handler threw exception
  - Still includes rate limit headers
  - Request is still logged

## Best Practices

### 1. **Respect Rate Limit Headers**
Always check response headers:
```javascript
const remaining = parseInt(response.headers['x-ratelimit-remaining']);
if (remaining < 100) {
  console.warn('Approaching rate limit!');
}
```

### 2. **Implement Exponential Backoff**
```javascript
const retryAfter = parseInt(response.headers['retry-after'] || '60');
await sleep(retryAfter * 1000);
```

### 3. **Monitor Usage**
Check statistics regularly:
```typescript
const stats = await getApiKeyStats(apiKeyId, 24);
if (stats.failedRequests > stats.totalRequests * 0.1) {
  // 10% error rate - investigate!
}
```

### 4. **Set Appropriate Limits**
- **Public APIs**: 100-500 requests/minute
- **Partner APIs**: 1000-5000 requests/minute
- **Internal APIs**: 10000+ requests/minute

### 5. **Plan Ahead**
- Monitor `X-RateLimit-Remaining`
- Space out requests if approaching limit
- Request higher limits if needed

## Configuration

### Per-API-Key Limits
Each API key can have custom rate limits:

```typescript
// Default: 1000 requests per 60 seconds
const { apiKey } = await generateApiKey(
  userId,
  'API Key',
  { 'auth:read': true }
);

// TODO: Add ability to customize rates per key
// Future: await updateApiKeyRateLimit(keyId, 5000, 120);
```

### Global Configuration
Configure defaults in environment variables:

```bash
# .env.local
NEXT_PUBLIC_DEFAULT_RATE_LIMIT_REQUESTS=1000
NEXT_PUBLIC_DEFAULT_RATE_LIMIT_WINDOW=60
API_KEY_USAGE_RETENTION_DAYS=90
```

## Monitoring & Alerts

### Database Metrics
```sql
-- Top API keys by usage
SELECT api_key_id, COUNT(*) as requests
FROM api_key_usage
WHERE created_at > datetime('now', '-1 hour')
GROUP BY api_key_id
ORDER BY requests DESC
LIMIT 10;

-- Endpoints with highest error rates
SELECT endpoint, 
       COUNT(*) as total,
       SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
       CAST(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as error_rate
FROM api_key_usage
WHERE created_at > datetime('now', '-1 hour')
GROUP BY endpoint
HAVING error_rate > 0.1
ORDER BY error_rate DESC;
```

## Performance Considerations

### Database Queries
- Each request requires 1-2 database queries
- Sliding window calculation is O(1) with indexed timestamps
- Consider connection pooling for high-traffic APIs

### Optimization Strategies
1. **Cache API Key Data**: Cache validated keys for 1-5 minutes
2. **Batch Usage Logs**: Write in batches if very high volume
3. **Archive Old Data**: Move records >90 days to archive table
4. **Use Indexes**: Ensure indexes on api_key_id and created_at

### Load Testing
```bash
# Test rate limiting with Apache Bench
ab -n 1500 -c 50 -H "Authorization: Bearer <api-key>" https://api.example.com/endpoint
```

## Troubleshooting

### "Rate limit exceeded" on first request
**Cause**: Previous window's requests still counted
**Solution**: Check `X-RateLimit-Remaining` header, wait for window reset

### Missing rate limit headers
**Cause**: Request failed before reaching rate limit check
**Solution**: Ensure API key is valid (401/403 response)

### High latency on rate limit checks
**Cause**: Database query performance
**Solution**: 
- Add indexes: `CREATE INDEX idx_api_key_usage_api_key_id ON api_key_usage(api_key_id, created_at);`
- Archive old records
- Consider Redis cache layer

## Future Enhancements

1. **Tiered Rate Limiting**
   - Different limits for different endpoints
   - Premium tier with higher limits

2. **Advanced Analytics**
   - Predictive rate limit warnings
   - Usage trend analysis
   - Cost calculation based on usage

3. **Cache Layer**
   - Redis for sub-second lookups
   - Distributed rate limiting across multiple servers

4. **Rate Limit Optimization**
   - Token bucket algorithm option
   - Burst allowance
   - Dynamic limits based on server load

5. **Webhook Notifications**
   - Alert when approaching 80% of limit
   - Notification when limit exceeded
   - Usage reports

## Related Files

- `/src/lib/api-rate-limiter.ts` - Rate limiting implementation
- `/src/lib/api-auth-middleware.ts` - Middleware integration
- `/src/lib/api-key-service.ts` - API key management
- `/src/workers/migrations/0003_add_api_keys_table.sql` - Database schema
