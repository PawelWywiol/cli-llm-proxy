# Plugins

## Overview

cli-llm-proxy uses the [Fastify plugin system](https://fastify.dev/docs/latest/Reference/Plugins/). Plugins are registered via `fastify-plugin` (fp) to share the same encapsulation context.

Plugins are registered in `src/server.ts` during app bootstrap:

```typescript
await app.register(authPlugin);
await app.register(loggerPlugin);
```

## Existing Plugins

### Auth Plugin (`src/plugins/auth.ts`)

Adds a `preHandler` hook that checks `Authorization: Bearer <key>` or `X-API-Key: <key>` headers against `config.server.apiKey`. Skips `/health` endpoint. Disabled when apiKey is empty.

### Logger Plugin (`src/plugins/logger.ts`)

Adds `onRequest` and `onResponse` hooks. Logs:
- Incoming: method, URL, requestId
- Completed: requestId, statusCode, latencyMs, model, adapterName

## Writing a New Plugin

### Step 1: Create the plugin file

```typescript
// src/plugins/rate-limiter.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

interface RateLimitState {
  count: number;
  resetAt: number;
}

async function rateLimiterPlugin(app: FastifyInstance) {
  const limits = new Map<string, RateLimitState>();
  const MAX_REQUESTS = 60;
  const WINDOW_MS = 60_000;

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;
    const now = Date.now();
    const state = limits.get(ip);

    if (!state || now > state.resetAt) {
      limits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }

    state.count++;
    if (state.count > MAX_REQUESTS) {
      return reply.status(429).send({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          param: null,
          code: "rate_limit",
        },
      });
    }
  });
}

export default fp(rateLimiterPlugin, { name: "rate-limiter" });
```

### Step 2: Register in server.ts

```typescript
import rateLimiterPlugin from "./plugins/rate-limiter.js";

// In buildApp():
await app.register(rateLimiterPlugin);
```

### Step 3: Test

```typescript
// tests/plugins/rate-limiter.test.ts
import { buildApp } from "../src/server.js";

test("blocks after limit exceeded", async () => {
  const app = await buildApp();
  for (let i = 0; i < 61; i++) {
    const res = await app.inject({ method: "GET", url: "/v1/models" });
    if (i >= 60) expect(res.statusCode).toBe(429);
  }
});
```

## Available Fastify Hooks

| Hook | When | Use Case |
|------|------|----------|
| `onRequest` | Before parsing | Logging, early rejection |
| `preHandler` | After parsing, before handler | Auth, rate limiting, validation |
| `onSend` | Before sending response | Response transformation |
| `onResponse` | After response sent | Metrics, cleanup |
| `onError` | On error | Error tracking |

## RequestContext Extensibility

`RequestContext` (src/context.ts) uses an index signature `[key: string]: unknown`, so plugins can attach arbitrary data:

```typescript
app.addHook("preHandler", async (request) => {
  const ctx = (request as any).ctx as RequestContext;
  ctx.customField = "value";      // Extend freely
  ctx.tenantId = "tenant-123";
});
```

## Future Plugin Ideas

- **Sessions/Memory** - Use StorageProvider to persist conversation history per session ID
- **Rate Limiter** - Per-IP or per-key request throttling
- **Metrics** - Prometheus endpoint with request counts, latencies, adapter usage
- **Audit Log** - Write every request/response to a file or database
- **Cost Tracker** - Estimate token costs per adapter and track usage
- **Cache** - Cache identical prompts using StorageProvider with TTL
