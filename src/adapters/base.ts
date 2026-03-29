import type { StreamEmitter } from "../utils/process.js";
import { Semaphore } from "../utils/semaphore.js";

export interface AdapterRunOptions {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AdapterResult {
  content: string;
  rawStdout: string;
  rawStderr: string;
  exitCode: number;
  timedOut: boolean;
  warnings: string[];
}

export interface HealthCheckResult {
  available: boolean;
  version?: string;
  error?: string;
}

export abstract class BaseAdapter {
  abstract readonly name: string;
  abstract readonly modelAliases: string[];
  abstract readonly enabled: boolean;

  protected semaphore: Semaphore;

  constructor(maxConcurrent: number = 3) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async run(opts: AdapterRunOptions): Promise<AdapterResult> {
    await this.semaphore.acquire();
    try {
      return await this.executeRun(opts);
    } finally {
      this.semaphore.release();
    }
  }

  protected abstract executeRun(opts: AdapterRunOptions): Promise<AdapterResult>;
  abstract stream(opts: AdapterRunOptions): StreamEmitter;
  abstract healthCheck(): Promise<HealthCheckResult>;
}
