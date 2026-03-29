# Extending

## Adding New CLI Backends

See [adapters.md](./adapters.md#adding-a-new-cli-adapter) for a full step-by-step guide.

Summary:
1. Create `src/adapters/<name>.ts` extending `BaseAdapter`
2. Implement `executeRun()`, `stream()`, `healthCheck()`
3. Add config to `Config` interface and `defaults` in `src/config.ts`
4. Register in `src/registry.ts` constructor
5. Add tests

## Adding API Backends

See [adapters.md](./adapters.md#adding-an-api-adapter-no-cli) for a full example.

`BaseAdapter` doesn't mandate CLI usage. Use `fetch()` instead of `runCli()` in `executeRun()`. Return the same `AdapterResult` shape.

## Adding New Plugins

See [plugins.md](./plugins.md#writing-a-new-plugin) for a full example.

Summary:
1. Create `src/plugins/<name>.ts`
2. Export `fp(pluginFn, { name: "<name>" })`
3. Use Fastify hooks (`preHandler`, `onRequest`, `onResponse`, etc.)
4. Register in `src/server.ts` via `app.register()`

## StorageProvider for Persistence

`src/storage.ts` defines a `StorageProvider` interface:

```typescript
interface StorageProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
}
```

The built-in `InMemoryStorage` is suitable for development. For production persistence:

### Redis Example

```typescript
import { createClient } from "redis";
import type { StorageProvider } from "./storage.js";

export class RedisStorage implements StorageProvider {
  private client;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.connect();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const json = JSON.stringify(value);
    if (ttlMs) {
      await this.client.set(key, json, { PX: ttlMs });
    } else {
      await this.client.set(key, json);
    }
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.client.del(key);
    return count > 0;
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }
}
```

### Usage in a Plugin

```typescript
import { InMemoryStorage } from "../storage.js";

async function sessionPlugin(app: FastifyInstance) {
  const store = new InMemoryStorage(); // or RedisStorage

  app.addHook("preHandler", async (request) => {
    const sessionId = request.headers["x-session-id"] as string;
    if (sessionId) {
      const history = await store.get<ChatMessage[]>(sessionId);
      (request as any).sessionHistory = history ?? [];
    }
  });

  app.addHook("onResponse", async (request) => {
    const sessionId = request.headers["x-session-id"] as string;
    if (sessionId && (request as any).sessionHistory) {
      await store.set(sessionId, (request as any).sessionHistory, 3600_000);
    }
  });
}
```

## RequestContext for State

`RequestContext` (src/context.ts) is created per-request with:
- `requestId` - UUID
- `startTime` - timestamp
- `model` - requested model name
- `adapterName` - resolved adapter (set after resolution)
- `[key: string]: unknown` - extensible

Plugins and handlers can attach arbitrary state to the context for cross-cutting concerns (tenant IDs, feature flags, trace IDs, etc.).
