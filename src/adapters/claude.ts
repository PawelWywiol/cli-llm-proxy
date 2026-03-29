import { config } from "../config.js";
import type { ChatMessage } from "../types/openai.js";
import { buildFullPrompt, parseCliOutput } from "../utils/parser.js";
import type { StreamEmitter } from "../utils/process.js";
import { runCli, streamCli } from "../utils/process.js";
import { type AdapterResult, type AdapterRunOptions, BaseAdapter, type HealthCheckResult } from "./base.js";

export class ClaudeAdapter extends BaseAdapter {
  readonly name = "claude";
  readonly enabled: boolean;
  readonly modelAliases: string[];

  private readonly cfg = config.adapters.claude;

  constructor() {
    super(config.adapters.claude.maxConcurrent);
    this.enabled = this.cfg.enabled;
    this.modelAliases = this.cfg.modelAliases;
  }

  protected async executeRun(opts: AdapterRunOptions): Promise<AdapterResult> {
    const prompt = buildFullPrompt(opts.messages as ChatMessage[]);
    const args = [...this.cfg.extraArgs, "--print", prompt];

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
    const args = [...this.cfg.extraArgs, "--print", prompt];

    return streamCli({
      command: this.cfg.command,
      args,
      timeoutMs: this.cfg.timeoutMs,
    });
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
