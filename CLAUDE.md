# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # dev server (tsx, port 11434)
pnpm build            # tsc → dist/
pnpm test             # vitest run (all tests)
pnpm test -- tests/unit/parser.test.ts  # single test file
pnpm test:watch       # vitest watch mode
pnpm lint             # biome check
pnpm lint:fix         # biome check --write (format + lint + imports)
pnpm release          # standard-version (patch bump + changelog)
```

## Architecture

OpenAI-compatible HTTP proxy that routes `/v1/chat/completions` to local CLI tools via adapter pattern.

**Request flow**: HTTP → CORS → Auth plugin → handler → `registry.resolve(model)` → adapter.run()/stream() → `spawn(cli, args, {shell: false})` → parse CLI output → OpenAI-format response

**Key abstractions**:

- `BaseAdapter` (abstract class, `src/adapters/base.ts`) — concurrency-gated via Semaphore. Subclasses implement `executeRun()`, `stream()`, `healthCheck()`. Each adapter owns its prompt construction.
- `AdapterRegistry` (`src/registry.ts`) — resolves model name → adapter via: exact alias match → substring contains → default fallback
- Fastify plugins (`src/plugins/`) — auth and logger registered in `src/server.ts`. New features (sessions, memory) should be added as plugins.
- `RequestContext` (`src/context.ts`) — per-request metadata, extensible via `[key: string]: unknown`
- `StorageProvider` (`src/storage.ts`) — KV interface with `InMemoryStorage`, designed for future swap to SQLite/Redis

**Config precedence**: hardcoded defaults → `config.json` (deep merge) → env vars (`PROXY_API_KEY`, `PORT`, `*_CLI_PATH`, `LOG_LEVEL`)

## ESM + TypeScript

- `"type": "module"` with `module: "NodeNext"` — imports **must** use `.js` extensions (e.g., `import { config } from '../config.js'`)
- Target ES2022, strict mode

## Adding a New Adapter

1. Create `src/adapters/newadapter.ts` extending `BaseAdapter`
2. Add config entry in `src/config.ts` defaults (with `modelAliases: string[]`)
3. Register in `src/registry.ts` constructor via `registerIfEnabled()`

## Testing

- Unit tests in `tests/unit/`, integration tests in `tests/integration/`
- Integration tests use Fastify's `app.inject()` — no real HTTP
- Adapters are mocked in integration tests — no real CLI execution
- Pre-commit hook runs: lint-staged → build (type check) → test

## Code Style

- Biome: 120 char line width, double quotes, trailing commas, 2-space indent
- `noNonNullAssertion` enforced in src (use `?? fallback` or narrowing), relaxed in tests
- ANSI regex in parser.ts has a `biome-ignore` for intentional control chars

## Git Rules

- NEVER create git commits
- NEVER push git commits
- NEVER add Co-Authored-By to anything

## Plans

- at the end of each plan, give me a list unresolved questions to answer, if any. Make the questions extremely concise. Sacrifice grammar for the sake of concision.
