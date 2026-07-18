import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { buildChatResponse, type ChatRunOptions, runAdapterNonStreaming } from "./chat-service.js";
import { config } from "./config.js";
import { jobManager } from "./jobs.js";
import { registry } from "./registry.js";
import type {
  ChatCompletionRequest,
  ChatCompletionStreamChunk,
  ChatMessage,
  Model,
  ModelsResponse,
  OpenAIError,
} from "./types/openai.js";

function errorResponse(
  reply: FastifyReply,
  status: number,
  message: string,
  type = "invalid_request_error",
  code: string | null = null,
) {
  const body: OpenAIError = {
    error: { message, type, param: null, code },
  };
  return reply.status(status).send(body);
}

function resolveTimeoutMs(request: FastifyRequest): number | undefined {
  const header = request.headers["x-request-timeout-ms"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, config.maxRequestTimeoutMs);
}

async function chatCompletions(request: FastifyRequest<{ Body: ChatCompletionRequest }>, reply: FastifyReply) {
  const body = request.body;

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(reply, 400, "messages is required and must be a non-empty array");
  }
  if (!body.model || typeof body.model !== "string") {
    return errorResponse(reply, 400, "model is required and must be a string");
  }

  const opts: ChatRunOptions = {
    messages: body.messages,
    model: body.model,
    temperature: body.temperature,
    maxTokens: body.max_tokens as number | undefined,
    timeoutMs: resolveTimeoutMs(request),
  };

  // Streaming path
  if (body.stream === true) {
    const adapter = registry.resolve(body.model);
    if (!adapter) {
      return errorResponse(reply, 400, `No adapter found for model: ${body.model}`);
    }
    (request as unknown as Record<string, unknown>).adapterName = adapter.name;

    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const id = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);

    const writeChunk = (chunk: ChatCompletionStreamChunk) => {
      raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    // First chunk with role
    writeChunk({
      id,
      object: "chat.completion.chunk",
      created,
      model: body.model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null, logprobs: null }],
    });

    const emitter = adapter.stream(opts);

    emitter.on("token", (token: string) => {
      writeChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model: body.model,
        choices: [{ index: 0, delta: { content: token }, finish_reason: null, logprobs: null }],
      });
    });

    emitter.on("done", () => {
      writeChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model: body.model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop", logprobs: null }],
      });
      raw.write("data: [DONE]\n\n");
      raw.end();
    });

    emitter.on("error", (err: Error) => {
      writeChunk({
        id,
        object: "chat.completion.chunk",
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            delta: { content: `Error: ${err.message}` },
            finish_reason: "error",
            logprobs: null,
          },
        ],
      });
      raw.write("data: [DONE]\n\n");
      raw.end();
    });

    return reply;
  }

  // Non-streaming path
  const outcome = await runAdapterNonStreaming(opts);
  if (!outcome.ok) {
    return errorResponse(reply, outcome.status, outcome.message, outcome.type, outcome.code);
  }
  (request as unknown as Record<string, unknown>).adapterName = outcome.adapterName;

  return reply.send(buildChatResponse(body.model, body.messages, outcome.content, outcome.adapterName));
}

// teams-captions-ext compat: POST /v1/generate
// Accepts { provider, messages, metadata }, maps provider -> model alias,
// returns { output: { text } } / { error: { message } } (non-streaming only).
async function generate(
  request: FastifyRequest<{
    Body: { provider?: string; messages?: ChatMessage[]; metadata?: Record<string, unknown> };
  }>,
  reply: FastifyReply,
) {
  const body = request.body;

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return reply.status(400).send({ error: { message: "messages is required and must be a non-empty array" } });
  }

  const model = body.provider || config.defaultAdapter;
  const outcome = await runAdapterNonStreaming({
    messages: body.messages,
    model,
    timeoutMs: resolveTimeoutMs(request),
  });

  if (!outcome.ok) {
    return reply.status(outcome.status).send({ error: { message: outcome.message } });
  }

  (request as unknown as Record<string, unknown>).adapterName = outcome.adapterName;
  return reply.send({ output: { text: outcome.content } });
}

// Async job queue: submit -> 202, then poll status / fetch result.
async function createJob(request: FastifyRequest<{ Body: ChatCompletionRequest }>, reply: FastifyReply) {
  const body = request.body;

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(reply, 400, "messages is required and must be a non-empty array");
  }
  if (!body.model || typeof body.model !== "string") {
    return errorResponse(reply, 400, "model is required and must be a string");
  }

  const job = await jobManager.enqueue(body);
  return reply.status(202).send(job);
}

async function getJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const job = await jobManager.get(request.params.id);
  if (!job) {
    return errorResponse(reply, 404, `No job found: ${request.params.id}`, "invalid_request_error", "job_not_found");
  }
  return reply.send(job);
}

async function cancelJob(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const job = await jobManager.cancel(request.params.id);
  if (!job) {
    return errorResponse(reply, 404, `No job found: ${request.params.id}`, "invalid_request_error", "job_not_found");
  }
  return reply.send(job);
}

async function listModels(_request: FastifyRequest, reply: FastifyReply) {
  const adapters = registry.getEnabled();
  const models: Model[] = [];

  for (const adapter of adapters) {
    for (const alias of adapter.modelAliases) {
      models.push({
        id: alias,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: `cli-proxy/${adapter.name}`,
      });
    }
  }

  const response: ModelsResponse = { object: "list", data: models };
  return reply.send(response);
}

async function healthCheck(_request: FastifyRequest, reply: FastifyReply) {
  const adapters = registry.getEnabled();
  const results = await Promise.all(
    adapters.map(async (a) => {
      const check = await a.healthCheck();
      return { name: a.name, ...check };
    }),
  );

  const anyAvailable = results.some((r) => r.available);

  return reply.send({
    status: anyAvailable ? "ok" : "degraded",
    adapters: results,
  });
}

// Ollama compat: GET /api/tags
async function ollamaTags(_request: FastifyRequest, reply: FastifyReply) {
  const adapters = registry.getEnabled();
  const models = [];

  for (const adapter of adapters) {
    for (const alias of adapter.modelAliases) {
      models.push({
        name: alias,
        model: alias,
        modified_at: new Date().toISOString(),
        size: 0,
      });
    }
  }

  return reply.send({ models });
}

// Ollama compat: POST /api/chat
async function ollamaChat(
  request: FastifyRequest<{
    Body: {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
      stream?: boolean;
    };
  }>,
  reply: FastifyReply,
) {
  const body = request.body ?? {};
  const openaiBody: ChatCompletionRequest = {
    model: body.model ?? "",
    messages: (body.messages ?? []).map((m) => ({
      role: m.role as "user" | "assistant" | "system" | "tool",
      content: m.content,
    })),
    stream: body.stream,
  };

  // Reuse the main handler by mutating request body
  (request as FastifyRequest<{ Body: ChatCompletionRequest }>).body = openaiBody;
  return chatCompletions(request as FastifyRequest<{ Body: ChatCompletionRequest }>, reply);
}

export function registerRoutes(app: FastifyInstance) {
  app.post("/v1/chat/completions", chatCompletions);
  app.post("/v1/generate", generate);
  app.post("/v1/jobs", createJob);
  app.get("/v1/jobs/:id", getJob);
  app.delete("/v1/jobs/:id", cancelJob);
  app.get("/v1/models", listModels);
  app.get("/health", healthCheck);
  app.get("/api/tags", ollamaTags);
  app.post("/api/chat", ollamaChat);
}
