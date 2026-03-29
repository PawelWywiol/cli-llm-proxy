import { config } from "../config.js";
import type { ChatMessage } from "../types/openai.js";
import { buildFullPrompt, parseCliOutput } from "../utils/parser.js";
import type { StreamEmitter } from "../utils/process.js";
import { runCli, streamCli } from "../utils/process.js";
import { type AdapterResult, type AdapterRunOptions, BaseAdapter, type HealthCheckResult } from "./base.js";

export function resolveGeminiModel(model: string): string | null {
  const lower = model.toLowerCase();
  if (lower.includes("2.5") || lower.includes("2-5")) return "gemini-2.5-pro";
  if (lower.includes("flash")) return "gemini-2.0-flash";
  if (lower.includes("pro")) return "gemini-1.5-pro";
  if (lower.includes("gemini-2")) return "gemini-2.0-flash";
  return null;
}

export class GeminiAdapter extends BaseAdapter {
  readonly name = "gemini";
  readonly enabled: boolean;
  readonly modelAliases: string[];

  private readonly cfg = config.adapters.gemini;

  constructor() {
    super(config.adapters.gemini.maxConcurrent);
    this.enabled = this.cfg.enabled;
    this.modelAliases = this.cfg.modelAliases;
  }

  protected async executeRun(opts: AdapterRunOptions): Promise<AdapterResult> {
    const prompt = buildFullPrompt(opts.messages as ChatMessage[]);
    const args = this.buildArgs(opts.model, prompt);

    const result = await runCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
      maxOutputChars: config.maxOutputChars,
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
    const prompt = buildFullPrompt(opts.messages as ChatMessage[]);
    const args = this.buildArgs(opts.model, prompt);

    return streamCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
    });
  }

  private buildArgs(model: string, prompt: string): string[] {
    const args = [...this.cfg.extraArgs];
    const resolved = resolveGeminiModel(model);
    if (resolved) {
      args.push("--model", resolved);
    }
    args.push("-p", prompt);
    return args;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const result = await runCli({
        command: this.cfg.command,
        args: ["--version"],
        timeoutMs: 10_000,
      });

      if (result.exitCode === 0) {
        return { available: true, version: result.stdout.trim() };
      }
      return { available: false, error: result.stderr.trim() || "non-zero exit" };
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
