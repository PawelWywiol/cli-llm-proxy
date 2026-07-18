import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config.js", () => ({
  config: {
    server: { host: "127.0.0.1", port: 0, apiKey: "" },
    docs: { enabled: true, routePrefix: "/docs" },
    logLevel: "silent",
  },
}));

import Fastify from "fastify";

import { registerDocs } from "../../src/plugins/docs.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await registerDocs(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("OpenAPI docs", () => {
  it("serves an OpenAPI spec listing the endpoints", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths["/v1/chat/completions"]).toBeTruthy();
    expect(spec.paths["/v1/jobs"]).toBeTruthy();
    expect(spec.paths["/v1/jobs/{id}"]).toBeTruthy();
  });

  it("serves the Swagger UI", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect([200, 302]).toContain(res.statusCode);
  });
});
