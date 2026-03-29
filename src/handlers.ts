import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRequestContext } from "./context.js";
import { registry } from "./registry.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamChunk,
  Model,
  ModelsResponse,
  OpenAIError,
} from "./types/openai.js";
import { detectCliError } from "./utils/errors.js";
import { estimateTokens } from "./utils/parser.js";

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

async function chatCompletions(request: FastifyRequest<{ Body: ChatCompletionRequest }>, reply: FastifyReply) {
  const body = request.body;

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(reply, 400, "messages is required and must be a non-empty array");
  }
  if (!body.model || typeof body.model !== "string") {
    return errorResponse(reply, 400, "model is required and must be a string");
  }

  const ctx = createRequestContext(body.model);
  const adapter = registry.resolve(body.model);

  if (!adapter) {
    return errorResponse(reply, 400, `No adapter found for model: ${body.model}`);
  }

  ctx.adapterName = adapter.name;
  (request as unknown as Record<string, unknown>).adapterName = adapter.name;

  const opts = {
    messages: body.messages,
    model: body.model,
    temperature: body.temperature,
    maxTokens: body.max_tokens as number | undefined,
  };

  // Streaming path
  if (body.stream === true) {
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
  const result = await adapter.run(opts);

  if (result.timedOut) {
    return errorResponse(reply, 504, "CLI adapter timed out", "server_error", "timeout");
  }

  const cliError = detectCliError(result.rawStdout, result.rawStderr);
  if (result.exitCode !== 0 && !result.content) {
    if (cliError) {
      return errorResponse(reply, cliError.httpStatus, cliError.message, "server_error", cliError.type);
    }
    return errorResponse(reply, 502, `CLI exited with code ${result.exitCode}: ${result.rawStderr}`, "server_error");
  }

  const promptText = body.messages.map((m) => m.content).join(" ");
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(result.content);

  const response: ChatCompletionResponse = {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.content },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    system_fingerprint: `fp_${adapter.name}`,
  };

  return reply.send(response);
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
  app.get("/v1/models", listModels);
  app.get("/health", healthCheck);
  app.get("/api/tags", ollamaTags);
  app.post("/api/chat", ollamaChat);
}
