import { afterEach, describe, expect, it } from "vitest";
import { deepMerge, loadConfig } from "../../src/config.js";

describe("deepMerge", () => {
  it("merges nested objects", () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const override = { a: { b: 10 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3 });
  });

  it("replaces arrays instead of merging", () => {
    const base = { items: [1, 2, 3] };
    const override = { items: [4, 5] };
    const result = deepMerge(base, override);
    expect(result.items).toEqual([4, 5]);
  });

  it("does not mutate base", () => {
    const base = { a: { b: 1 } };
    const override = { a: { b: 2 } };
    deepMerge(base, override);
    expect(base.a.b).toBe(1);
  });

  it("handles empty override", () => {
    const base = { a: 1, b: { c: 2 } };
    const result = deepMerge(base, {});
    expect(result).toEqual(base);
  });

  it("handles top-level value overrides", () => {
    const base = { a: 1, b: "hello" };
    const override = { a: 42 };
    const result = deepMerge(base, override);
    expect(result.a).toBe(42);
    expect(result.b).toBe("hello");
  });
});

describe("loadConfig", () => {
  const envKeys = ["PROXY_API_KEY", "PORT", "CLAUDE_CLI_PATH", "GEMINI_CLI_PATH", "COPILOT_CLI_PATH"];
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns defaults when no config file", () => {
    const cfg = loadConfig();
    expect(cfg.server.host).toBe("127.0.0.1");
    expect(cfg.server.port).toBe(11434);
    expect(cfg.defaultAdapter).toBe("claude");
  });

  it("applies PROXY_API_KEY env var", () => {
    savedEnv.PROXY_API_KEY = process.env.PROXY_API_KEY;
    process.env.PROXY_API_KEY = "test-key-123";
    const cfg = loadConfig();
    expect(cfg.server.apiKey).toBe("test-key-123");
  });

  it("applies PORT env var", () => {
    savedEnv.PORT = process.env.PORT;
    process.env.PORT = "3000";
    const cfg = loadConfig();
    expect(cfg.server.port).toBe(3000);
  });

  it("applies CLI path env vars", () => {
    savedEnv.CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH;
    savedEnv.GEMINI_CLI_PATH = process.env.GEMINI_CLI_PATH;
    savedEnv.COPILOT_CLI_PATH = process.env.COPILOT_CLI_PATH;

    process.env.CLAUDE_CLI_PATH = "/usr/local/bin/claude";
    process.env.GEMINI_CLI_PATH = "/usr/local/bin/gemini";
    process.env.COPILOT_CLI_PATH = "/usr/local/bin/gh";

    const cfg = loadConfig();
    expect(cfg.adapters.claude.command).toBe("/usr/local/bin/claude");
    expect(cfg.adapters.gemini.command).toBe("/usr/local/bin/gemini");
    expect(cfg.adapters.copilot.command).toBe("/usr/local/bin/gh");
  });
});
