import { randomUUID } from "node:crypto";

import { registry } from "./registry.js";
import type { ChatCompletionResponse, ChatMessage } from "./types/openai.js";
import { detectCliError } from "./utils/errors.js";
import { estimateTokens } from "./utils/parser.js";

export interface ChatRunOptions {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export type AdapterOutcome =
  | { ok: true; content: string; adapterName: string }
  | { ok: false; status: number; message: string; type: string; code: string | null };

export async function runAdapterNonStreaming(opts: ChatRunOptions): Promise<AdapterOutcome> {
  const adapter = registry.resolve(opts.model);
  if (!adapter) {
    return {
      ok: false,
      status: 400,
      message: `No adapter found for model: ${opts.model}`,
      type: "invalid_request_error",
      code: null,
    };
  }

  const result = await adapter.run(opts);

  if (result.timedOut) {
    return { ok: false, status: 504, message: "CLI adapter timed out", type: "server_error", code: "timeout" };
  }

  const cliError = detectCliError(result.rawStdout, result.rawStderr);
  if (result.exitCode !== 0 && !result.content) {
    if (cliError) {
      return {
        ok: false,
        status: cliError.httpStatus,
        message: cliError.message,
        type: "server_error",
        code: cliError.type,
      };
    }
    return {
      ok: false,
      status: 502,
      message: `CLI exited with code ${result.exitCode}: ${result.rawStderr}`,
      type: "server_error",
      code: null,
    };
  }

  return { ok: true, content: result.content, adapterName: adapter.name };
}

export function buildChatResponse(
  model: string,
  messages: ChatMessage[],
  content: string,
  adapterName: string,
): ChatCompletionResponse {
  const promptTokens = estimateTokens(messages.map((m) => m.content).join(" "));
  const completionTokens = estimateTokens(content);

  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    system_fingerprint: `fp_${adapterName}`,
  };
}
