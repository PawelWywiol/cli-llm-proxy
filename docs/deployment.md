# Deployment

## Local Development

```bash
pnpm install
pnpm dev          # Runs with tsx, pino-pretty, auto-reload not included
```

Dev mode uses `pino-pretty` for readable logs. Set `LOG_LEVEL=debug` for verbose output.

## Production

```bash
pnpm build        # TypeScript -> dist/
pnpm start        # node dist/server.js
```

Set `NODE_ENV=production` to disable pino-pretty.

## systemd

1. Build the project on the server:
```bash
pnpm install --frozen-lockfile
pnpm build
```

2. Copy the service file:
```bash
sudo cp cli-llm-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
```

3. Edit the service file to set your paths and API key:
```bash
sudo systemctl edit cli-llm-proxy
```

4. Enable and start:
```bash
sudo systemctl enable --now cli-llm-proxy
sudo journalctl -u cli-llm-proxy -f   # View logs
```

## Docker Compose (recommended)

Designed for a server where the CLI tools are **already installed and authenticated** for a user (e.g. `claude`). The image contains only the Node proxy; the host CLI binary and its auth are mounted in, so there is nothing extra to install or log into.

```bash
docker compose up -d --build
```

That's it. `compose.yml` (defaults for host user `code`, uid 1000) mounts:
- the host CLI binary dir + its versioned payload (`~/.local/bin`, `~/.local/share/claude`) at identical paths so the CLI's absolute symlinks resolve inside the container — host CLI updates flow through with no rebuild;
- the auth/state (`~/.claude`, `~/.claude.json`) read-write.

The image builds `dist/` itself (multi-stage), so the host needs **no Node.js** — only Docker + Compose.

Override via a `.env` file (see `.env.example`) when the host differs:

```bash
HOST_HOME=/home/alice   # host user's home (CLI + auth live here)
HOST_UID=1000           # must own the mounted files
HOST_GID=1000
PROXY_API_KEY=your-secret-key
DEFAULT_ADAPTER=claude
CLAUDE_ENABLED=true
GEMINI_ENABLED=false    # enable + add its mount when installed on the host
COPILOT_ENABLED=false
```

The container forces `HOST=0.0.0.0` so the port is reachable; the proxy still defaults to `127.0.0.1` when run outside a container.

**Adding another host CLI** (e.g. gemini): set `GEMINI_ENABLED=true`, add its binary + auth mounts to `compose.yml`, and set `GEMINI_CLI_PATH` to the mounted absolute path.

### Manual Docker (without Compose)

```bash
docker build -t cli-llm-proxy .
docker run -d --name cli-llm-proxy -p 11434:11434 \
  --user 1000:1000 -e HOST=0.0.0.0 -e HOME=/home/code \
  -e PROXY_API_KEY=your-secret-key -e CLAUDE_CLI_PATH=/home/code/.local/bin/claude \
  -v /home/code/.local/bin:/home/code/.local/bin:ro \
  -v /home/code/.local/share/claude:/home/code/.local/share/claude:ro \
  -v /home/code/.claude:/home/code/.claude \
  -v /home/code/.claude.json:/home/code/.claude.json \
  cli-llm-proxy
```

> The claude native binary links only against standard glibc, so a glibc base image (`node:20-slim`) runs the host binary as-is. Alpine (musl) would not.

## Integration Examples

### Python (openai SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="your-secret-key",
)

response = client.chat.completions.create(
    model="claude",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)
```

### Python (streaming)

```python
stream = client.chat.completions.create(
    model="claude",
    messages=[{"role": "user", "content": "Write a haiku"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### TypeScript

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "your-secret-key",
});

const completion = await client.chat.completions.create({
  model: "claude",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(completion.choices[0].message.content);
```

### LangChain (Python)

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="your-secret-key",
    model="claude",
)

response = llm.invoke("Explain recursion in one sentence.")
print(response.content)
```

### curl

```bash
curl http://localhost:11434/v1/chat/completions \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Open WebUI

In Open WebUI settings, add an OpenAI-compatible connection:

- **URL**: `http://localhost:11434/v1`
- **API Key**: your configured key
- Models will auto-populate from `/v1/models`

### Ollama-compatible clients

Any client supporting Ollama's API can connect directly:

- **URL**: `http://localhost:11434`
- Uses `/api/tags` for model listing and `/api/chat` for chat
