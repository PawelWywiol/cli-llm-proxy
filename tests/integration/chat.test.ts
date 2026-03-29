import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock config
vi.mock("../../src/config.js", () => ({
  config: {
    server: { host: "127.0.0.1", port: 0, apiKey: "" },
    adapters: {
      claude: {
        enabled: true,
        command: "claude",
        extraArgs: [],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: ["claude", "claude-code"],
      },
      gemini: {
        enabled: false,
        command: "gemini",
        extraArgs: [],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: [],
      },
      copilot: { enabled: false, command: "gh", extraArgs: [], timeoutMs: 120_000, maxConcurrent: 2, modelAliases: [] },
    },
    defaultAdapter: "claude",
    maxOutputChars: 1_000_000,
    logLevel: "silent",
  },
}));

const { mockRun, mockStream, mockHealthCheck } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockStream: vi.fn(),
  mockHealthCheck: vi.fn(),
}));

vi.mock("../../src/adapters/claude.js", () => ({
  ClaudeAdapter: class {
    name = "claude";
    modelAliases = ["claude", "claude-code"];
    enabled = true;
    run = mockRun;
    stream = mockStream;
    healthCheck = mockHealthCheck;
  },
}));

vi.mock("../../src/adapters/gemini.js", () => ({
  GeminiAdapter: class {
    name = "gemini";
    modelAliases = [];
    enabled = false;
    run = vi.fn();
    stream = vi.fn();
    healthCheck = vi.fn();
  },
}));

vi.mock("../../src/adapters/copilot.js", () => ({
  CopilotAdapter: class {
    name = "copilot";
    modelAliases = [];
    enabled = false;
    run = vi.fn();
    stream = vi.fn();
    healthCheck = vi.fn();
  },
}));

import Fastify from "fastify";
import { registerRoutes } from "../../src/handlers.js";
import authPlugin from "../../src/plugins/auth.js";
import loggerPlugin from "../../src/plugins/logger.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.register(loggerPlugin);
  registerRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("POST /v1/chat/completions (non-streaming)", () => {
  it("returns correct OpenAI format", async () => {
    mockRun.mockResolvedValueOnce({
      content: "Hello world",
      rawStdout: "Hello world",
      rawStderr: "",
      exitCode: 0,
      timedOut: false,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.object).toBe("chat.completion");
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.choices[0].message.content).toBe("Hello world");
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.completion_tokens).toBeGreaterThan(0);
    expect(body.system_fingerprint).toBe("fp_claude");
  });

  it("returns 400 for missing messages", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "claude" },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("messages");
  });

  it("returns 400 for empty messages array", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model: "claude", messages: [] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing model", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { messages: [{ role: "user", content: "Hi" }] },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("model");
  });

  it("returns 504 on timeout", async () => {
    mockRun.mockResolvedValueOnce({
      content: "",
      rawStdout: "",
      rawStderr: "",
      exitCode: null,
      timedOut: true,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(res.statusCode).toBe(504);
  });

  it("returns 429 on rate limit error from CLI stderr", async () => {
    mockRun.mockResolvedValueOnce({
      content: "",
      rawStdout: "",
      rawStderr: "Error: rate limit exceeded",
      exitCode: 1,
      timedOut: false,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(res.statusCode).toBe(429);
  });

  it("returns 502 on unknown CLI error", async () => {
    mockRun.mockResolvedValueOnce({
      content: "",
      rawStdout: "",
      rawStderr: "some unknown error",
      exitCode: 1,
      timedOut: false,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(res.statusCode).toBe(502);
  });
});
