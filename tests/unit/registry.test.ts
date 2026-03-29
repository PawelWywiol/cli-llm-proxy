import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock config before importing anything that uses it
vi.mock("../../src/config.js", () => ({
  config: {
    server: { host: "127.0.0.1", port: 8787, apiKey: "" },
    adapters: {
      claude: {
        enabled: true,
        command: "claude",
        extraArgs: [],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: [
          "claude",
          "claude-code",
          "claude-sonnet",
          "claude-opus",
          "claude-haiku",
          "claude-3",
          "claude-3-5",
          "claude-3-7",
        ],
      },
      gemini: {
        enabled: true,
        command: "gemini",
        extraArgs: [],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: ["gemini", "gemini-pro", "gemini-flash", "gemini-2", "gemini-2.5", "google"],
      },
      copilot: {
        enabled: false,
        command: "gh",
        extraArgs: ["copilot"],
        timeoutMs: 120_000,
        maxConcurrent: 2,
        modelAliases: ["copilot", "github-copilot", "gpt-4o", "gpt-4", "gpt-3.5"],
      },
    },
    defaultAdapter: "claude",
    maxOutputChars: 1_000_000,
  },
}));

import { AdapterRegistry } from "../../src/registry.js";

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it("resolves exact alias match", () => {
    const adapter = registry.resolve("claude-code");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("claude");
  });

  it("resolves exact alias case-insensitively", () => {
    const adapter = registry.resolve("Claude-Code");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("claude");
  });

  it("resolves contains match", () => {
    const adapter = registry.resolve("claude-3-5-sonnet-20241022");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("claude");
  });

  it("resolves gemini exact alias", () => {
    const adapter = registry.resolve("gemini-pro");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("gemini");
  });

  it("falls back to default adapter for unknown model", () => {
    const adapter = registry.resolve("some-unknown-model");
    expect(adapter).not.toBeNull();
    expect(adapter!.name).toBe("claude");
  });

  it("getEnabled filters disabled adapters", () => {
    const enabled = registry.getEnabled();
    const names = enabled.map((a) => a.name);
    expect(names).toContain("claude");
    expect(names).toContain("gemini");
    expect(names).not.toContain("copilot");
  });

  it("getAll returns only registered (enabled) adapters", () => {
    const all = registry.getAll();
    // copilot is disabled so not registered
    expect(all.length).toBe(2);
  });
});

describe("AdapterRegistry with no adapters", () => {
  it("returns null when no adapters and no default", async () => {
    // Dynamically create a registry-like scenario with no adapters
    const { config } = await import("../../src/config.js");
    const origDefault = config.defaultAdapter;
    const origClaude = config.adapters.claude.enabled;
    const origGemini = config.adapters.gemini.enabled;

    config.adapters.claude.enabled = false;
    config.adapters.gemini.enabled = false;
    config.defaultAdapter = "nonexistent";

    const emptyRegistry = new AdapterRegistry();
    expect(emptyRegistry.resolve("anything")).toBeNull();

    // Restore
    config.defaultAdapter = origDefault;
    config.adapters.claude.enabled = origClaude;
    config.adapters.gemini.enabled = origGemini;
  });
});
