# Architecture

## Overview

cli-llm-proxy is an OpenAI-compatible HTTP proxy that routes LLM requests to local CLI tools. It exposes a standard `/v1/chat/completions` API and translates requests into CLI invocations of Claude Code, Gemini CLI, or GitHub Copilot CLI.

## Request Flow

```
Client (OpenAI SDK, curl, Open WebUI, etc.)
  |
  v
+-----------------------+
| Fastify HTTP Server   |  src/server.ts
|  - CORS               |
|  - Auth Plugin         |  src/plugins/auth.ts
|  - Logger Plugin       |  src/plugins/logger.ts
+-----------------------+
  |
  v
+-----------------------+
| Route Handlers        |  src/handlers.ts
|  - /v1/chat/completions
|  - /v1/models
|  - /health
|  - /api/tags (Ollama)
|  - /api/chat (Ollama)
+-----------------------+
  |
  v
+-----------------------+
| AdapterRegistry       |  src/registry.ts
|  - Model alias lookup |
|  - Fallback to default|
+-----------------------+
  |
  v
+-----------------------+
| BaseAdapter           |  src/adapters/base.ts
|  - Semaphore acquire  |
|  - executeRun()       |
|  - stream()           |
+-----------------------+
  |
  v
+-----------------------+
| CLI Adapter           |  src/adapters/{claude,gemini,copilot}.ts
|  - Build args         |
|  - buildFullPrompt()  |
+-----------------------+
  |
  v
+-----------------------+
| Process Utils         |  src/utils/process.ts
|  - spawn(shell:false) |
|  - Timeout handling   |
|  - Output capping     |
+-----------------------+
  |
  v
+-----------------------+
| Parser                |  src/utils/parser.ts
|  - Strip ANSI/spinners|
|  - Token estimation   |
+-----------------------+
  |
  v
+-----------------------+
| Error Detection       |  src/utils/errors.ts
|  - Rate limit, auth   |
|  - Quota, network     |
+-----------------------+
  |
  v
OpenAI-format JSON response (or SSE stream)
```

## File-by-File Summary

| File | Purpose |
|------|---------|
| `src/server.ts` | Fastify app bootstrap, plugin registration, graceful shutdown |
| `src/config.ts` | Config loading: defaults -> config.json -> env vars. Exports singleton `config` |
| `src/handlers.ts` | Route handlers for OpenAI and Ollama endpoints |
| `src/registry.ts` | AdapterRegistry: model-to-adapter resolution (exact, contains, default fallback) |
| `src/context.ts` | RequestContext factory with requestId, timing, extensible key-value |
| `src/storage.ts` | StorageProvider interface + InMemoryStorage (for future persistence) |
| `src/types/openai.ts` | TypeScript types for OpenAI API request/response shapes |
| `src/adapters/base.ts` | BaseAdapter abstract class with semaphore-based concurrency |
| `src/adapters/claude.ts` | ClaudeAdapter: uses `claude --print <prompt>` |
| `src/adapters/gemini.ts` | GeminiAdapter: uses `gemini -p <prompt>`, model name resolution |
| `src/adapters/copilot.ts` | CopilotAdapter: uses `gh copilot`, explain/suggest heuristic |
| `src/plugins/auth.ts` | Auth middleware: Bearer token or X-API-Key header |
| `src/plugins/logger.ts` | Request/response logging with latency, model, adapter name |
| `src/utils/process.ts` | `runCli()` and `streamCli()`: spawn without shell, timeout, output cap |
| `src/utils/parser.ts` | ANSI stripping, spinner removal, prompt building, token estimation |
| `src/utils/errors.ts` | CLI error detection via regex patterns (rate limit, auth, quota, network) |
| `src/utils/semaphore.ts` | Promise-based semaphore for per-adapter concurrency limiting |

## Layer Responsibilities

**Transport Layer** (server.ts, plugins/) - HTTP handling, CORS, auth, logging.

**Routing Layer** (handlers.ts) - Request validation, response formatting, SSE streaming, Ollama compat translation.

**Resolution Layer** (registry.ts) - Maps model names to adapters via alias matching with fallback.

**Adapter Layer** (adapters/) - Translates OpenAI messages to CLI args, manages concurrency.

**Execution Layer** (utils/process.ts) - Spawns CLI processes securely, handles timeouts and output limits.

**Parsing Layer** (utils/parser.ts, utils/errors.ts) - Cleans CLI output, detects errors, estimates tokens.
