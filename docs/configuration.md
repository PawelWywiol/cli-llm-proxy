# Configuration

## Precedence

```
Hardcoded defaults  <  config.json  <  Environment variables
```

Later sources override earlier ones.

## config.json Schema

Place `config.json` in the working directory (project root).

```jsonc
{
  "server": {
    "host": "127.0.0.1",   // Bind address. Use 0.0.0.0 for all interfaces (see security.md)
    "port": 11434,          // HTTP port (Ollama-compatible default)
    "apiKey": ""            // Required API key. Empty = auth disabled
  },
  "adapters": {
    "claude": {
      "enabled": true,          // Enable this adapter
      "command": "claude",      // CLI binary path or name
      "extraArgs": [],          // Extra args prepended before --print
      "timeoutMs": 120000,      // Max CLI execution time
      "maxConcurrent": 2,       // Concurrent requests via semaphore
      "modelAliases": [         // Model names that route to this adapter
        "claude", "claude-code", "claude-sonnet",
        "claude-opus", "claude-haiku",
        "claude-3", "claude-3-5", "claude-3-7"
      ]
    },
    "gemini": {
      "enabled": false,
      "command": "gemini",
      "extraArgs": [],
      "timeoutMs": 120000,
      "maxConcurrent": 2,
      "modelAliases": [
        "gemini", "gemini-pro", "gemini-flash",
        "gemini-2", "gemini-2.5", "google"
      ]
    },
    "copilot": {
      "enabled": true,
      "command": "gh",
      "extraArgs": ["copilot", "explain"],
      "timeoutMs": 120000,
      "maxConcurrent": 2,
      "modelAliases": [
        "copilot", "github-copilot",
        "gpt-4o", "gpt-4", "gpt-3.5"
      ]
    }
  },
  "defaultAdapter": "copilot",  // Fallback when model doesn't match any alias
  "maxOutputChars": 1000000,    // Max stdout/stderr captured per request
  "maxRequestTimeoutMs": 600000,// Ceiling for the per-request X-Request-Timeout-Ms header
  "docs": {
    "enabled": true,            // Serve Swagger UI + OpenAPI spec
    "routePrefix": "/docs"      // UI at /docs, spec at /docs/json
  },
  "logLevel": "info"            // Pino log level: trace, debug, info, warn, error, fatal
}
```

## Environment Variables

| Variable | Overrides | Default | Description |
|----------|-----------|---------|-------------|
| `PROXY_API_KEY` | `server.apiKey` | `""` (disabled) | API key for authentication |
| `PORT` | `server.port` | `11434` | HTTP listen port |
| `CLAUDE_CLI_PATH` | `adapters.claude.command` | `claude` | Path to Claude CLI binary |
| `GEMINI_CLI_PATH` | `adapters.gemini.command` | `gemini` | Path to Gemini CLI binary |
| `COPILOT_CLI_PATH` | `adapters.copilot.command` | `gh` | Path to GitHub CLI binary |
| `LOG_LEVEL` | `logLevel` | `info` | Pino log level |
| `DOCS_ENABLED` | `docs.enabled` | `true` | Set to `false`/`0` to disable Swagger docs |
| `NODE_ENV` | - | - | Set to `production` to disable pino-pretty |

## Request timeout override

Clients may send an `X-Request-Timeout-Ms` header on `/v1/chat/completions`, `/v1/generate`, and `/v1/jobs` to raise or lower the CLI timeout for a single request (useful for very large prompts). The value is clamped to `maxRequestTimeoutMs`; the per-adapter `timeoutMs` is used when the header is absent.

## API docs (Swagger)

When `docs.enabled` is `true` (default), interactive OpenAPI docs are served at `docs.routePrefix` (default `/docs`), with the raw spec at `/docs/json`. The docs route bypasses auth, like `/health`.

## Per-Adapter Config Details

### `enabled`
Controls whether the adapter is registered at startup. Disabled adapters won't appear in `/v1/models` or `/health`.

### `command`
The CLI binary. Can be a bare name (resolved via PATH) or absolute path.

### `extraArgs`
Prepended to every CLI invocation. Useful for global flags:
```json
{ "extraArgs": ["--no-analytics", "--quiet"] }
```

### `timeoutMs`
After this duration, the CLI process receives SIGTERM, then SIGKILL after 3s.

### `maxConcurrent`
Semaphore limit per adapter. Prevents overwhelming a single CLI tool. Requests beyond this limit queue.

### `modelAliases`
List of model name strings. The registry matches incoming `model` field against these:
1. Exact match (case-insensitive)
2. Contains match (model name contains an alias)
3. Fallback to `defaultAdapter`
