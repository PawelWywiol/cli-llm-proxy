# Adapters

## How Adapters Work

All adapters extend `BaseAdapter` (src/adapters/base.ts), which provides:

- **Semaphore-based concurrency** - `run()` acquires a semaphore slot before calling `executeRun()`
- **Typed interface** - `AdapterRunOptions` in, `AdapterResult` out
- **Streaming** - `stream()` returns a `StreamEmitter` (typed EventEmitter with token/done/error events)
- **Health checks** - `healthCheck()` verifies CLI availability

```typescript
abstract class BaseAdapter {
  abstract readonly name: string;
  abstract readonly modelAliases: string[];
  abstract readonly enabled: boolean;

  async run(opts: AdapterRunOptions): Promise<AdapterResult>;       // Semaphore-wrapped
  protected abstract executeRun(opts: AdapterRunOptions): Promise<AdapterResult>;
  abstract stream(opts: AdapterRunOptions): StreamEmitter;
  abstract healthCheck(): Promise<HealthCheckResult>;
}
```

## Built-in Adapters

### Claude (default)

- **CLI**: `claude --print <prompt>`
- **Config key**: `adapters.claude`
- **Default aliases**: claude, claude-code, claude-sonnet, claude-opus, claude-haiku, claude-3, claude-3-5, claude-3-7
- **Prompt building**: System messages prepended, then `Human:`/`Assistant:` turn format via `buildFullPrompt()`
- **Health check**: `claude --version`

### Gemini

- **CLI**: `gemini -p <prompt>` with optional `--model <resolved>`
- **Config key**: `adapters.gemini`
- **Default aliases**: gemini, gemini-pro, gemini-flash, gemini-2, gemini-2.5, google
- **Model mapping** (`resolveGeminiModel()`):
  - Contains "2.5" or "2-5" -> `gemini-2.5-pro`
  - Contains "flash" -> `gemini-2.0-flash`
  - Contains "pro" -> `gemini-1.5-pro`
  - Contains "gemini-2" -> `gemini-2.0-flash`
- **Enabled by default**: No (set `adapters.gemini.enabled: true`)

### Copilot

- **CLI**: `gh copilot explain|suggest <prompt>`
- **Config key**: `adapters.copilot`
- **Default aliases**: copilot, github-copilot, gpt-4o, gpt-4, gpt-3.5
- **Mode detection** (`detectCopilotMode()`): If prompt contains "explain", "what does", "how does", etc. -> `explain` mode, otherwise `suggest` mode
- **Extra env**: `CI=1` (suppresses interactive prompts)
- **Health check**: `gh copilot --version`, falls back to checking `gh extension list` for copilot
- **Enabled by default**: No

## Adding a New CLI Adapter

### Step 1: Create the adapter file

```typescript
// src/adapters/ollama-native.ts
import { config } from "../config.js";
import { runCli, streamCli } from "../utils/process.js";
import type { StreamEmitter } from "../utils/process.js";
import { parseCliOutput, buildFullPrompt } from "../utils/parser.js";
import type { ChatMessage } from "../types/openai.js";
import {
  BaseAdapter,
  type AdapterRunOptions,
  type AdapterResult,
  type HealthCheckResult,
} from "./base.js";

export class OllamaNativeAdapter extends BaseAdapter {
  readonly name = "ollama-native";
  readonly enabled: boolean;
  readonly modelAliases: string[];

  // Reference your config section
  private readonly cfg = config.adapters.ollamaNative; // Add to Config interface

  constructor() {
    super(config.adapters.ollamaNative.maxConcurrent);
    this.enabled = this.cfg.enabled;
    this.modelAliases = this.cfg.modelAliases;
  }

  protected async executeRun(opts: AdapterRunOptions): Promise<AdapterResult> {
    const prompt = buildFullPrompt(opts.messages as ChatMessage[]);
    const args = ["run", opts.model, prompt];

    const result = await runCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
      maxOutputChars: config.maxOutputChars,
    });

    const parsed = parseCliOutput(result.stdout);
    return {
      content: parsed.content,
      rawStdout: result.stdout,
      rawStderr: result.stderr,
      exitCode: result.exitCode ?? 1,
      timedOut: result.timedOut,
      warnings: parsed.warnings,
    };
  }

  stream(opts: AdapterRunOptions): StreamEmitter {
    const prompt = buildFullPrompt(opts.messages as ChatMessage[]);
    return streamCli({
      command: this.cfg.command,
      args: ["run", opts.model, prompt],
      timeoutMs: this.cfg.timeoutMs,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const result = await runCli({
        command: this.cfg.command,
        args: ["--version"],
        timeoutMs: 10_000,
      });
      return result.exitCode === 0
        ? { available: true, version: result.stdout.trim() }
        : { available: false, error: result.stderr.trim() };
    } catch (err) {
      return { available: false, error: String(err) };
    }
  }
}
```

### Step 2: Add config defaults

In `src/config.ts`, add the adapter config to the `Config` interface and `defaults` object:

```typescript
adapters: {
  // ... existing adapters ...
  ollamaNative: {
    enabled: false,
    command: "ollama",
    extraArgs: [],
    timeoutMs: 120_000,
    maxConcurrent: 4,
    modelAliases: ["llama", "mistral", "codellama"],
  },
}
```

### Step 3: Register in the registry

In `src/registry.ts`:

```typescript
import { OllamaNativeAdapter } from "./adapters/ollama-native.js";

// In constructor:
this.registerIfEnabled("ollamaNative", () => new OllamaNativeAdapter());
```

### Step 4: Test

Write tests in `tests/adapters/ollama-native.test.ts` covering `executeRun`, `stream`, and `healthCheck`.

## Adding an API Adapter (No CLI)

Same interface, just skip `runCli`/`streamCli` and use `fetch` directly:

```typescript
export class OpenRouterAdapter extends BaseAdapter {
  readonly name = "openrouter";
  readonly enabled = true;
  readonly modelAliases = ["openrouter", "or-*"];

  constructor() {
    super(5);
  }

  protected async executeRun(opts: AdapterRunOptions): Promise<AdapterResult> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model.replace("or-", ""),
        messages: opts.messages,
      }),
    });

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "";

    return {
      content,
      rawStdout: JSON.stringify(json),
      rawStderr: "",
      exitCode: res.ok ? 0 : 1,
      timedOut: false,
      warnings: [],
    };
  }

  stream(opts: AdapterRunOptions): StreamEmitter {
    // Implement SSE parsing from upstream API
    // ...
  }

  async healthCheck() {
    return { available: true };
  }
}
```

The key insight: `BaseAdapter` doesn't mandate CLI usage. Any backend that returns `AdapterResult` works.
