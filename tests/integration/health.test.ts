import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
        modelAliases: ["claude"],
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

const { mockHealthCheck } = vi.hoisted(() => ({
  mockHealthCheck: vi.fn(),
}));

vi.mock("../../src/adapters/claude.js", () => ({
  ClaudeAdapter: class {
    name = "claude";
    modelAliases = ["claude"];
    enabled = true;
    run = vi.fn();
    stream = vi.fn();
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

describe("GET /health", () => {
  it("returns ok when adapter is available", async () => {
    mockHealthCheck.mockResolvedValueOnce({
      available: true,
      version: "1.0.0",
    });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.adapters).toHaveLength(1);
    expect(body.adapters[0].name).toBe("claude");
    expect(body.adapters[0].available).toBe(true);
    expect(body.adapters[0].version).toBe("1.0.0");
  });

  it("returns degraded when no adapter available", async () => {
    mockHealthCheck.mockResolvedValueOnce({
      available: false,
      error: "CLI not found",
    });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.adapters[0].available).toBe(false);
    expect(body.adapters[0].error).toBe("CLI not found");
  });
});
