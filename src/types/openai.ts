export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  [key: string]: unknown;
}

export interface Choice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "error" | null;
  logprobs: null;
}

export interface StreamChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: "stop" | "length" | "error" | null;
  logprobs: null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
  system_fingerprint: string;
}

export interface ChatCompletionStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
}

export interface Model {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: "list";
  data: Model[];
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}
