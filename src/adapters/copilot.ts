import { config } from "../config.js";
import type { ChatMessage } from "../types/openai.js";
import { getLastUserMessage, parseCliOutput } from "../utils/parser.js";
import type { StreamEmitter } from "../utils/process.js";
import { runCli, streamCli } from "../utils/process.js";
import { type AdapterResult, type AdapterRunOptions, BaseAdapter, type HealthCheckResult } from "./base.js";

const EXPLAIN_SIGNALS = [
  "explain",
  "what does",
  "what is",
  "how does",
  "describe",
  "tell me about",
  "why does",
  "why is",
];

export function detectCopilotMode(prompt: string): "explain" | "suggest" {
  const lower = prompt.toLowerCase();
  for (const signal of EXPLAIN_SIGNALS) {
    if (lower.includes(signal)) return "explain";
  }
  return "suggest";
}

export class CopilotAdapter extends BaseAdapter {
  readonly name = "copilot";
  readonly enabled: boolean;
  readonly modelAliases: string[];

  private readonly cfg = config.adapters.copilot;

  constructor() {
    super(config.adapters.copilot.maxConcurrent);
    this.enabled = this.cfg.enabled;
    this.modelAliases = this.cfg.modelAliases;
  }

  protected async executeRun(opts: AdapterRunOptions): Promise<AdapterResult> {
    const prompt = getLastUserMessage(opts.messages as ChatMessage[]) ?? opts.messages[0]?.content ?? "";
    const args = this.buildArgs(prompt);

    const result = await runCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
      maxOutputChars: config.maxOutputChars,
      env: { CI: "1" },
    });

    const parsed = parseCliOutput(result.stdout);

    return {
      content: parsed.content,
      rawStdout: result.stdout,
      rawStderr: result.stderr,
      exitCode: result.exitCode ?? 1,
      timedOut: result.timedOut,
      warnings: parsed.warnings,
    };
  }

  stream(opts: AdapterRunOptions): StreamEmitter {
    const prompt = getLastUserMessage(opts.messages as ChatMessage[]) ?? opts.messages[0]?.content ?? "";
    const args = this.buildArgs(prompt);

    return streamCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
      env: { CI: "1" },
    });
  }

  private buildArgs(prompt: string): string[] {
    const mode = detectCopilotMode(prompt);
    const args = [...this.cfg.extraArgs];

    if (mode === "explain") {
      // Replace default "suggest" with "explain" if extraArgs contains suggest-related args
      const suggestIdx = args.indexOf("suggest");
      if (suggestIdx !== -1) {
        args[suggestIdx] = "explain";
      } else if (!args.includes("explain")) {
        args.push("explain");
      }
    } else {
      if (!args.includes("suggest")) {
        args.push("suggest", "-t", "shell");
      }
    }

    args.push(prompt);
    return args;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const result = await runCli({
        command: this.cfg.command,
        args: ["copilot", "--version"],
        timeoutMs: 10_000,
      });

      if (result.exitCode === 0) {
        return { available: true, version: result.stdout.trim() };
      }

      // Fallback: check extension list
      const extResult = await runCli({
        command: this.cfg.command,
        args: ["extension", "list"],
        timeoutMs: 10_000,
      });

      if (extResult.stdout.toLowerCase().includes("copilot")) {
        return { available: true, version: "copilot extension found" };
      }

      return { available: false, error: "copilot extension not found" };
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
