import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface AdapterConfig {
  enabled: boolean;
  command: string;
  extraArgs: string[];
  timeoutMs: number;
  maxConcurrent: number;
  modelAliases: string[];
}

export interface Config {
  server: {
    host: string;
    port: number;
    apiKey: string;
  };
  adapters: {
    claude: AdapterConfig;
    gemini: AdapterConfig;
    copilot: AdapterConfig;
  };
  defaultAdapter: string;
  maxOutputChars: number;
  maxRequestTimeoutMs: number;
  docs: {
    enabled: boolean;
    routePrefix: string;
  };
  logLevel: string;
}

const defaults: Config = {
  server: {
    host: "127.0.0.1",
    port: 11434,
    apiKey: "",
  },
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
      enabled: false,
      command: "gemini",
      extraArgs: [],
      timeoutMs: 120_000,
      maxConcurrent: 2,
      modelAliases: ["gemini", "gemini-pro", "gemini-flash", "gemini-2", "gemini-2.5", "google"],
    },
    copilot: {
      enabled: true,
      command: "gh",
      extraArgs: ["copilot", "explain"],
      timeoutMs: 120_000,
      maxConcurrent: 2,
      modelAliases: ["copilot", "github-copilot", "gpt-4o", "gpt-4", "gpt-3.5"],
    },
  },
  defaultAdapter: "copilot",
  maxOutputChars: 1_000_000,
  maxRequestTimeoutMs: 600_000,
  docs: {
    enabled: true,
    routePrefix: "/docs",
  },
  logLevel: "info",
};

export function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  const src = override as Record<string, unknown>;
  const baseRec = base as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    const baseVal = baseRec[key];
    const overrideVal = src[key];

    if (
      overrideVal !== undefined &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }

  return result as T;
}

export function loadConfig(): Config {
  let fileConfig: Partial<Config> = {};

  try {
    const raw = readFileSync(resolve("config.json"), "utf-8");
    fileConfig = JSON.parse(raw) as Partial<Config>;
  } catch {
    // No config file, use defaults
  }

  const merged = deepMerge(defaults, fileConfig);

  // Env var overrides
  if (process.env.PROXY_API_KEY) {
    merged.server.apiKey = process.env.PROXY_API_KEY;
  }
  if (process.env.HOST) {
    merged.server.host = process.env.HOST;
  }
  if (process.env.PORT) {
    merged.server.port = parseInt(process.env.PORT, 10);
  }
  if (process.env.DEFAULT_ADAPTER) {
    merged.defaultAdapter = process.env.DEFAULT_ADAPTER;
  }
  for (const name of ["claude", "gemini", "copilot"] as const) {
    const flag = process.env[`${name.toUpperCase()}_ENABLED`];
    if (flag !== undefined) {
      merged.adapters[name].enabled = flag !== "false" && flag !== "0";
    }
  }
  if (process.env.CLAUDE_CLI_PATH) {
    merged.adapters.claude.command = process.env.CLAUDE_CLI_PATH;
  }
  if (process.env.GEMINI_CLI_PATH) {
    merged.adapters.gemini.command = process.env.GEMINI_CLI_PATH;
  }
  if (process.env.COPILOT_CLI_PATH) {
    merged.adapters.copilot.command = process.env.COPILOT_CLI_PATH;
  }
  if (process.env.LOG_LEVEL) {
    merged.logLevel = process.env.LOG_LEVEL;
  }
  if (process.env.DOCS_ENABLED) {
    merged.docs.enabled = process.env.DOCS_ENABLED !== "false" && process.env.DOCS_ENABLED !== "0";
  }

  return merged;
}

export const config = loadConfig();
