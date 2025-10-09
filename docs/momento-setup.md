# Momento SDK Configuration

This document explains how to configure and use Momento caching in the shipping logistics tools.

## Setup

### 1. Environment Variable Configuration

Add your Momento API key to your environment:

```bash
# In .env.local
MOMENTO_API_KEY=your_momento_api_key_here
```

If the `MOMENTO_API_KEY` environment variable is not provided, the system will automatically:
- Skip all caching operations
- Disable rate limiting
- Log a message indicating caching is disabled
- Continue normal operation without errors

### 2. Automatic Initialization

The Momento client is automatically initialized when the application starts. No manual setup is required.

## Usage in Tool Handlers

### Basic Pattern

```javascript
import { checkRateLimit, createRateLimitError } from '../utils/rateLimiting.js';
import { checkCache, cacheResponse, generateEtag } from '../utils/caching.js';

export async function yourToolHandler(parameters, context) {
  // 1. Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult);
  }

  // 2. Cache check
  const cacheKey = `shipping:yourTool:${parameters.order_id}`;
  const cached = await checkCache(cacheKey, parameters.meta?.if_none_match);
  if (cached) {
    return cached; // Returns cached response or 304 status
  }

  // 3. Your business logic here
  const businessResult = await executeYourBusinessLogic(parameters);

  // 4. Build response with meta
  const response = {
    ...businessResult,
    meta: {
      etag: generateEtag(businessResult),
      last_modified: new Date().toISOString(),
      from_cache: false,
      rate_limit: rateLimitResult.info,
      paging: { next_cursor: null, has_more: false },
      next_steps: "Operation completed successfully"
    }
  };

  // 5. Cache the response
  await cacheResponse(cacheKey, response);

  return response;
}
```

### Simplified Pattern with SimpleCache

```javascript
import { SimpleCache } from '../utils/caching.js';
import { checkRateLimit, createRateLimitError } from '../utils/rateLimiting.js';

export async function yourToolHandler(parameters, context) {
  // Rate limiting check
  const rateLimitResult = await checkRateLimit();
  if (rateLimitResult.exceeded) {
    return createRateLimitError(rateLimitResult);
  }

  // Use SimpleCache for get-or-set pattern
  return await SimpleCache.getOrSet(
    'yourTool',
    parameters.order_id,
    async () => {
      // Your business logic
      const businessResult = await executeYourBusinessLogic(parameters);

      return {
        ...businessResult,
        meta: {
          last_modified: new Date().toISOString(),
          from_cache: false,
          rate_limit: rateLimitResult.info,
          paging: { next_cursor: null, has_more: false },
          next_steps: "Operation completed successfully"
        }
      };
    },
    { ifNoneMatch: parameters.meta?.if_none_match }
  );
}
```

## Fallback Behavior

When Momento is not available (no API key or connection issues):

- **Rate Limiting**: All requests are allowed through
- **Caching**: All cache operations return null/false (cache miss)
- **Error Handling**: No errors are thrown, operations continue normally
- **Response Meta**: `rate_limit` fields are set to `null`, `from_cache` is always `false`

## Configuration Details

### Rate Limiting
- **Limit**: 100 requests per minute per tool
- **Tracking**: Uses Momento increment API with per-minute keys
- **Reset**: Automatically resets every minute
- **Fallback**: No rate limiting when Momento unavailable

### Caching
- **TTL**: 300 seconds (5 minutes) by default
- **Cache Name**: `shipping-cache`
- **Key Format**: `shipping:{toolName}:{identifier}`
- **ETag Support**: Automatic ETag generation and conditional requests
- **Fallback**: No caching when Momento unavailable

### Environment Variables
- `MOMENTO_API_KEY`: Your Momento API key (optional)
- If not provided, all Momento features are disabled gracefully

## Verification

To verify your Momento setup is working:

```javascript
import { verifyMomentoSetup } from './src/utils/momentoVerification.js';

// Run verification
verifyMomentoSetup().then(result => {
  console.log('Momento setup result:', result);
});
```

This will test initialization, rate limiting, and caching functionality.
