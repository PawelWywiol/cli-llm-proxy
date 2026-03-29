# API Reference

## POST /v1/chat/completions

OpenAI-compatible chat completions endpoint.

### Request

```json
{
  "model": "claude",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model name, matched against adapter aliases |
| `messages` | array | Yes | Non-empty array of `{role, content}` objects |
| `stream` | boolean | No | Enable SSE streaming (default: false) |
| `temperature` | number | No | Passed through (not all CLIs support it) |
| `max_tokens` | number | No | Passed through |

Roles: `system`, `user`, `assistant`, `tool`

### Non-Streaming Response

```json
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion",
  "created": 1711700000,
  "model": "claude",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello! How can I help?" },
      "finish_reason": "stop",
      "logprobs": null
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  },
  "system_fingerprint": "fp_claude"
}
```

### Streaming Response (SSE)

When `stream: true`, the response is `text/event-stream`:

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1711700000,"model":"claude","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null,"logprobs":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1711700000,"model":"claude","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null,"logprobs":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1711700000,"model":"claude","choices":[{"index":0,"delta":{},"finish_reason":"stop","logprobs":null}]}

data: [DONE]
```

## GET /v1/models

Lists all models from enabled adapters.

### Response

```json
{
  "object": "list",
  "data": [
    {
      "id": "claude",
      "object": "model",
      "created": 1711700000,
      "owned_by": "cli-proxy/claude"
    },
    {
      "id": "claude-code",
      "object": "model",
      "created": 1711700000,
      "owned_by": "cli-proxy/claude"
    }
  ]
}
```

## GET /health

Health check endpoint. Bypasses auth.

### Response

```json
{
  "status": "ok",
  "adapters": [
    {
      "name": "claude",
      "available": true,
      "version": "1.0.0"
    },
    {
      "name": "gemini",
      "available": false,
      "error": "command not found"
    }
  ]
}
```

`status` is `"ok"` if any adapter is available, `"degraded"` if none are.

## GET /api/tags (Ollama Compat)

Returns models in Ollama format.

```json
{
  "models": [
    {
      "name": "claude",
      "model": "claude",
      "modified_at": "2026-03-29T00:00:00.000Z",
      "size": 0
    }
  ]
}
```

## POST /api/chat (Ollama Compat)

Accepts Ollama-format chat requests, translates internally to OpenAI format, and reuses the main handler.

```json
{
  "model": "claude",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": false
}
```

Response format follows the OpenAI `/v1/chat/completions` shape (not Ollama native format).

## Authentication

All endpoints except `/health` require auth when `server.apiKey` is set.

```
Authorization: Bearer <your-api-key>
```

or:

```
X-API-Key: <your-api-key>
```

## Error Format

All errors follow the OpenAI error shape:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

### HTTP Status Codes

| Status | Meaning | When |
|--------|---------|------|
| 200 | Success | Normal response |
| 400 | Bad Request | Missing/invalid model or messages |
| 401 | Unauthorized | Invalid or missing API key |
| 429 | Rate Limited | CLI reports rate limit or quota exceeded |
| 502 | Bad Gateway | CLI exited with error, network error |
| 504 | Gateway Timeout | CLI execution exceeded timeoutMs |
