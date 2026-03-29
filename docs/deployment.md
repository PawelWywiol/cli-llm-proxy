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

## Docker

```bash
# Build
pnpm build
docker build -t cli-llm-proxy .

# Run
docker run -d \
  --name cli-llm-proxy \
  -p 11434:11434 \
  -e PROXY_API_KEY=your-secret-key \
  cli-llm-proxy
```

**Important**: The Docker image does NOT include CLI tools (claude, gemini, gh). You must either:
- Mount CLI binaries from the host: `-v /usr/local/bin/claude:/usr/local/bin/claude`
- Install them in a custom Dockerfile
- Use Docker for API-only adapters

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
