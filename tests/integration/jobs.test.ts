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
    maxRequestTimeoutMs: 600_000,
    docs: { enabled: false, routePrefix: "/docs" },
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

async function pollUntilTerminal(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 50; i++) {
    const res = await app.inject({ method: "GET", url: `/v1/jobs/${id}` });
    const body = JSON.parse(res.body);
    if (["succeeded", "failed", "canceled"].includes(body.status as string)) return body;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("job did not reach a terminal state");
}

describe("async jobs", () => {
  it("enqueues (202) and completes with an OpenAI result", async () => {
    mockRun.mockResolvedValueOnce({
      content: "Async answer",
      rawStdout: "Async answer",
      rawStderr: "",
      exitCode: 0,
      timedOut: false,
      warnings: [],
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: { model: "claude", messages: [{ role: "user", content: "Hi" }] },
    });

    expect(created.statusCode).toBe(202);
    const job = JSON.parse(created.body);
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("queued");
    expect(job.request).toBeUndefined();

    const done = await pollUntilTerminal(job.id);
    expect(done.status).toBe("succeeded");
    const result = done.result as { choices: Array<{ message: { content: string } }> };
    expect(result.choices[0].message.content).toBe("Async answer");
  });

  it("records a failed job on CLI error", async () => {
    mockRun.mockResolvedValueOnce({
      content: "",
      rawStdout: "",
      rawStderr: "Error: rate limit exceeded",
      exitCode: 1,
      timedOut: false,
      warnings: [],
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: { model: "claude", messages: [{ role: "user", content: "Hi" }] },
    });
    const job = JSON.parse(created.body);

    const done = await pollUntilTerminal(job.id);
    expect(done.status).toBe("failed");
    expect((done.error as { message: string }).message).toBeTruthy();
  });

  it("cancels a running job", async () => {
    let release: () => void = () => {};
    mockRun.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () =>
          resolve({ content: "late", rawStdout: "late", rawStderr: "", exitCode: 0, timedOut: false, warnings: [] });
      }),
    );

    const created = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: { model: "claude", messages: [{ role: "user", content: "Hi" }] },
    });
    const job = JSON.parse(created.body);

    const canceled = await app.inject({ method: "DELETE", url: `/v1/jobs/${job.id}` });
    expect(canceled.statusCode).toBe(200);
    expect(JSON.parse(canceled.body).status).toBe("canceled");

    release();
    const done = await pollUntilTerminal(job.id);
    expect(done.status).toBe("canceled");
  });

  it("returns 404 for an unknown job", async () => {
    const get = await app.inject({ method: "GET", url: "/v1/jobs/does-not-exist" });
    expect(get.statusCode).toBe(404);
    const del = await app.inject({ method: "DELETE", url: "/v1/jobs/does-not-exist" });
    expect(del.statusCode).toBe(404);
  });

  it("returns 400 for empty messages", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/jobs", payload: { model: "claude", messages: [] } });
    expect(res.statusCode).toBe(400);
  });
});
