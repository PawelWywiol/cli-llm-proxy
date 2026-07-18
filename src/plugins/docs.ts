import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import type { OpenAPIV3 } from "openapi-types";

import { config } from "../config.js";

const chatMessage: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["role", "content"],
  properties: {
    role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
    content: { type: "string" },
  },
};

const errorSchema: OpenAPIV3.SchemaObject = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        message: { type: "string" },
        type: { type: "string" },
        param: { type: "string", nullable: true },
        code: { type: "string", nullable: true },
      },
    },
  },
};

const chatCompletionRequest: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["model", "messages"],
  properties: {
    model: { type: "string", description: "Matched against adapter aliases" },
    messages: { type: "array", items: chatMessage, minItems: 1 },
    stream: { type: "boolean", default: false, description: "SSE streaming (text/event-stream)" },
    temperature: { type: "number" },
    max_tokens: { type: "integer" },
  },
};

const openapiDocument: OpenAPIV3.Document = {
  openapi: "3.0.0",
  info: {
    title: "cli-llm-proxy",
    description: "OpenAI-compatible HTTP proxy that routes LLM requests to local CLI tools.",
    version: "0.1.0",
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
  paths: {
    "/v1/chat/completions": {
      post: {
        summary: "OpenAI-compatible chat completions",
        description:
          "Set `X-Request-Timeout-Ms` to override the adapter timeout (clamped to `maxRequestTimeoutMs`). When `stream:true`, the response is `text/event-stream`.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: chatCompletionRequest } },
        },
        responses: {
          200: { description: "Chat completion or SSE stream" },
          400: { description: "Invalid request", content: { "application/json": { schema: errorSchema } } },
        },
      },
    },
    "/v1/generate": {
      post: {
        summary: "Legacy generate endpoint (teams-captions-ext compat)",
        description: "Deprecated. Prefer /v1/chat/completions. Non-streaming only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  provider: { type: "string", description: "Model alias; falls back to defaultAdapter" },
                  messages: { type: "array", items: chatMessage, minItems: 1 },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Generated text",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { output: { type: "object", properties: { text: { type: "string" } } } },
                },
              },
            },
          },
        },
      },
    },
    "/v1/jobs": {
      post: {
        summary: "Enqueue an async chat completion",
        description: "Accepts the same body as /v1/chat/completions and returns 202 with a job id to poll.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: chatCompletionRequest } },
        },
        responses: { 202: { description: "Job queued" }, 400: { description: "Invalid request" } },
      },
    },
    "/v1/jobs/{id}": {
      get: {
        summary: "Get async job status/result",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Job record" }, 404: { description: "Job not found" } },
      },
      delete: {
        summary: "Cancel an async job",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Job record" }, 404: { description: "Job not found" } },
      },
    },
    "/v1/models": {
      get: { summary: "List models from enabled adapters", responses: { 200: { description: "Model list" } } },
    },
    "/health": {
      get: { summary: "Health check (bypasses auth)", responses: { 200: { description: "Adapter availability" } } },
    },
    "/api/tags": {
      get: { summary: "List models (Ollama format)", responses: { 200: { description: "Ollama tags" } } },
    },
    "/api/chat": {
      post: {
        summary: "Chat (Ollama compat, OpenAI-shaped response)",
        requestBody: { content: { "application/json": { schema: chatCompletionRequest } } },
        responses: { 200: { description: "Chat completion" } },
      },
    },
  },
};

export async function registerDocs(app: FastifyInstance): Promise<void> {
  if (!config.docs.enabled) return;

  await app.register(swagger, {
    mode: "static",
    specification: { document: openapiDocument },
  });
  await app.register(swaggerUi, { routePrefix: config.docs.routePrefix });
}
