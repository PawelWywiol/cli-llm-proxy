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

describe("POST /v1/generate (teams-captions-ext compat)", () => {
  it("returns { output: { text } } on success", async () => {
    mockRun.mockResolvedValueOnce({
      content: "Summary text",
      rawStdout: "Summary text",
      rawStderr: "",
      exitCode: 0,
      timedOut: false,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/generate",
      payload: {
        provider: "claude",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Summarize this." },
        ],
        metadata: { client: "teams-captions-ext", request_kind: "captions-map" },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.output.text).toBe("Summary text");
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ model: "claude" }));
  });

  it("falls back to defaultAdapter when provider is missing", async () => {
    mockRun.mockResolvedValueOnce({
      content: "Default summary",
      rawStdout: "Default summary",
      rawStderr: "",
      exitCode: 0,
      timedOut: false,
      warnings: [],
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/generate",
      payload: { messages: [{ role: "user", content: "Hi" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).output.text).toBe("Default summary");
  });

  it("returns 400 with error shape for empty messages", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/generate",
      payload: { provider: "claude", messages: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toContain("messages");
  });

  it("returns error shape on CLI failure", async () => {
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
      url: "/v1/generate",
      payload: { provider: "claude", messages: [{ role: "user", content: "Hi" }] },
    });

    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body).error.message).toBeTruthy();
  });
});
