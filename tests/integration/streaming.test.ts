import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StreamEmitter } from "../../src/utils/process.js";

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

const { mockStream } = vi.hoisted(() => ({
  mockStream: vi.fn(),
}));

vi.mock("../../src/adapters/claude.js", () => ({
  ClaudeAdapter: class {
    name = "claude";
    modelAliases = ["claude"];
    enabled = true;
    run = vi.fn();
    stream = mockStream;
    healthCheck = vi.fn();
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

describe("POST /v1/chat/completions (streaming)", () => {
  it("returns SSE format with role, content chunks, stop, and [DONE]", async () => {
    const emitter = new StreamEmitter();
    mockStream.mockReturnValueOnce(emitter);

    // Emit tokens async after stream is set up
    setTimeout(() => {
      emitter.emit("token", "Hello");
      emitter.emit("token", " world");
      emitter.emit("done", { exitCode: 0 });
    }, 10);

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");

    const lines = res.body.split("\n").filter((l) => l.startsWith("data: "));
    expect(lines.length).toBeGreaterThanOrEqual(4); // role + 2 tokens + stop + [DONE]

    // First chunk should have role
    const first = JSON.parse(lines[0].replace("data: ", ""));
    expect(first.choices[0].delta.role).toBe("assistant");

    // Middle chunks have content
    const second = JSON.parse(lines[1].replace("data: ", ""));
    expect(second.choices[0].delta.content).toBe("Hello");

    const third = JSON.parse(lines[2].replace("data: ", ""));
    expect(third.choices[0].delta.content).toBe(" world");

    // Stop chunk
    const stop = JSON.parse(lines[3].replace("data: ", ""));
    expect(stop.choices[0].finish_reason).toBe("stop");

    // Last line is [DONE]
    expect(lines[4]).toBe("data: [DONE]");
  });

  it("handles stream errors gracefully", async () => {
    const emitter = new StreamEmitter();
    mockStream.mockReturnValueOnce(emitter);

    setTimeout(() => {
      emitter.emit("token", "partial");
      emitter.emit("error", new Error("CLI crashed"));
    }, 10);

    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const lines = res.body.split("\n").filter((l) => l.startsWith("data: "));

    // Should contain error chunk and [DONE]
    const errorChunk = lines.find((l) => {
      if (l === "data: [DONE]") return false;
      const parsed = JSON.parse(l.replace("data: ", ""));
      return parsed.choices?.[0]?.finish_reason === "error";
    });
    expect(errorChunk).toBeDefined();

    const last = lines[lines.length - 1];
    expect(last).toBe("data: [DONE]");
  });
});
