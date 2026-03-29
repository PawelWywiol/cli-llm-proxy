import type { ChatMessage } from "../types/openai.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ESC char for ANSI stripping
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;
const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒⏳⌛|\\/-]+/g;
const NOISE_PATTERNS = [/^(Loading|Initializing|Thinking)\.{0,3}$/gm, /^>\s*$/gm];

export function cleanOutput(raw: string): string {
  let result = raw;

  // Strip ANSI escape sequences
  result = result.replace(ANSI_REGEX, "");

  // Strip spinner characters (standalone sequences)
  result = result.replace(SPINNER_CHARS, (match) => {
    // Only strip if the match is primarily spinner chars (not part of real text)
    if (match.length <= 3) return "";
    return match;
  });

  // Remove noise patterns
  for (const pattern of NOISE_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Collapse 3+ blank lines to 2
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

export interface ParseResult {
  content: string;
  wasCleaned: boolean;
  warnings: string[];
}

export function parseCliOutput(raw: string, _opts?: { minLength?: number }): ParseResult {
  const warnings: string[] = [];
  const cleaned = cleanOutput(raw);
  const wasCleaned = cleaned !== raw.trim();

  if (cleaned.length === 0) {
    warnings.push("CLI returned empty output");
  } else if (cleaned.length < (_opts?.minLength ?? 10)) {
    warnings.push(`CLI output very short (${cleaned.length} chars)`);
  }

  return { content: cleaned, wasCleaned, warnings };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildFullPrompt(messages: ChatMessage[]): string {
  const parts: string[] = [];

  const systemMessages = messages.filter((m) => m.role === "system");
  if (systemMessages.length > 0) {
    parts.push(systemMessages.map((m) => m.content).join("\n"));
  }

  const nonSystem = messages.filter((m) => m.role !== "system");
  for (const msg of nonSystem) {
    const prefix = msg.role === "user" ? "Human" : "Assistant";
    parts.push(`${prefix}: ${msg.content}`);
  }

  parts.push("Assistant:");
  return parts.join("\n\n");
}

export function getLastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return null;
}
