import type { BaseAdapter } from "./adapters/base.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { CopilotAdapter } from "./adapters/copilot.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { config } from "./config.js";

export class AdapterRegistry {
  private adapters = new Map<string, BaseAdapter>();
  private aliasMap = new Map<string, string>();

  constructor() {
    this.registerIfEnabled("claude", () => new ClaudeAdapter());
    this.registerIfEnabled("gemini", () => new GeminiAdapter());
    this.registerIfEnabled("copilot", () => new CopilotAdapter());
  }

  private registerIfEnabled(name: keyof typeof config.adapters, factory: () => BaseAdapter) {
    if (config.adapters[name].enabled) {
      this.register(name, factory());
    }
  }

  private register(name: string, adapter: BaseAdapter) {
    this.adapters.set(name, adapter);
    for (const alias of adapter.modelAliases) {
      this.aliasMap.set(alias.toLowerCase(), name);
    }
  }

  resolve(modelName: string): BaseAdapter | null {
    const lower = modelName.toLowerCase();

    // 1. Exact alias match
    const exact = this.aliasMap.get(lower);
    if (exact) {
      const adapter = this.adapters.get(exact);
      if (adapter) return adapter;
    }

    // 2. Contains match
    for (const [alias, name] of this.aliasMap.entries()) {
      if (lower.includes(alias)) {
        const adapter = this.adapters.get(name);
        if (adapter) return adapter;
      }
    }

    // 3. Fallback to default adapter
    const defaultAdapter = this.adapters.get(config.defaultAdapter);
    return defaultAdapter ?? null;
  }

  getAll(): BaseAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(): BaseAdapter[] {
    return this.getAll().filter((a) => a.enabled);
  }
}

export const registry = new AdapterRegistry();
