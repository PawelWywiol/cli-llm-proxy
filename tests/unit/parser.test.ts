import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../src/types/openai.js";
import {
  buildFullPrompt,
  cleanOutput,
  estimateTokens,
  getLastUserMessage,
  parseCliOutput,
} from "../../src/utils/parser.js";

describe("cleanOutput", () => {
  it("strips ANSI escape sequences", () => {
    const input = "\x1B[31mHello\x1B[0m World";
    expect(cleanOutput(input)).toBe("Hello World");
  });

  it("removes noise patterns", () => {
    const input = "Loading...\nActual content\nInitializing\nMore content";
    const result = cleanOutput(input);
    expect(result).toContain("Actual content");
    expect(result).toContain("More content");
    expect(result).not.toMatch(/^Loading\.{0,3}$/m);
    expect(result).not.toMatch(/^Initializing$/m);
  });

  it("removes lone > prompts", () => {
    expect(cleanOutput("> \nContent")).toBe("Content");
  });

  it("collapses 3+ blank lines to 2", () => {
    const input = "Line 1\n\n\n\n\nLine 2";
    expect(cleanOutput(input)).toBe("Line 1\n\nLine 2");
  });

  it("trims whitespace", () => {
    expect(cleanOutput("  hello  ")).toBe("hello");
  });

  it("handles empty input", () => {
    expect(cleanOutput("")).toBe("");
  });
});

describe("parseCliOutput", () => {
  it("returns cleaned content and wasCleaned flag", () => {
    const result = parseCliOutput("\x1B[31mHello, this is a complete response\x1B[0m");
    expect(result.content).toBe("Hello, this is a complete response");
    expect(result.wasCleaned).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on empty output", () => {
    const result = parseCliOutput("");
    expect(result.warnings).toContain("CLI returned empty output");
  });

  it("warns on very short output", () => {
    const result = parseCliOutput("Hi");
    expect(result.warnings.some((w) => w.includes("very short"))).toBe(true);
  });

  it("does not warn on adequate output", () => {
    const result = parseCliOutput("This is a sufficiently long response from the CLI tool.");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("estimateTokens", () => {
  it("estimates ~1 token per 4 chars", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildFullPrompt", () => {
  it("formats system + user/assistant messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ];
    const result = buildFullPrompt(messages);
    expect(result).toContain("You are helpful.");
    expect(result).toContain("Human: Hello");
    expect(result).toContain("Assistant: Hi there");
    expect(result).toContain("Human: How are you?");
    expect(result).toMatch(/Assistant:$/);
  });

  it("handles no system messages", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Hi" }];
    const result = buildFullPrompt(messages);
    expect(result).toContain("Human: Hi");
    expect(result).toMatch(/Assistant:$/);
  });
});

describe("getLastUserMessage", () => {
  it("returns last user message content", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Second" },
    ];
    expect(getLastUserMessage(messages)).toBe("Second");
  });

  it("returns null when no user messages", () => {
    expect(getLastUserMessage([{ role: "system", content: "sys" }])).toBeNull();
  });
});
