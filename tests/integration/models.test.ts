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
        modelAliases: ["claude", "claude-code"],
      },
      gemini: {
        enabled: true,
        command: "gemini",
        extraArgs: [],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: ["gemini", "gemini-pro"],
      },
      copilot: { enabled: false, command: "gh", extraArgs: [], timeoutMs: 120_000, maxConcurrent: 2, modelAliases: [] },
    },
    defaultAdapter: "claude",
    maxOutputChars: 1_000_000,
    logLevel: "silent",
  },
}));

vi.mock("../../src/adapters/claude.js", () => ({
  ClaudeAdapter: class {
    name = "claude";
    modelAliases = ["claude", "claude-code"];
    enabled = true;
    run = vi.fn();
    stream = vi.fn();
    healthCheck = vi.fn();
  },
}));

vi.mock("../../src/adapters/gemini.js", () => ({
  GeminiAdapter: class {
    name = "gemini";
    modelAliases = ["gemini", "gemini-pro"];
    enabled = true;
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

describe("GET /v1/models", () => {
  it("returns all enabled adapters model aliases", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe("list");
    expect(body.data.length).toBe(4); // claude, claude-code, gemini, gemini-pro

    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("claude-code");
    expect(ids).toContain("gemini");
    expect(ids).toContain("gemini-pro");

    // Check owned_by format
    const claudeModel = body.data.find((m: { id: string }) => m.id === "claude");
    expect(claudeModel.owned_by).toBe("cli-proxy/claude");
    expect(claudeModel.object).toBe("model");
  });
});

describe("GET /api/tags (Ollama compat)", () => {
  it("returns models in Ollama format", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tags" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toBeDefined();
    expect(body.models.length).toBe(4);
    expect(body.models[0]).toHaveProperty("name");
    expect(body.models[0]).toHaveProperty("model");
    expect(body.models[0]).toHaveProperty("modified_at");
    expect(body.models[0]).toHaveProperty("size");
  });
});
