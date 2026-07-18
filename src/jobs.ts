import { randomUUID } from "node:crypto";

import { buildChatResponse, runAdapterNonStreaming } from "./chat-service.js";
import { InMemoryStorage, type StorageProvider } from "./storage.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types/openai.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface JobRecord {
  id: string;
  status: JobStatus;
  model: string;
  request: ChatCompletionRequest;
  result?: ChatCompletionResponse;
  error?: { message: string; code: string | null };
  createdAt: number;
  updatedAt: number;
}

export type JobView = Omit<JobRecord, "request">;

export function toJobView(job: JobRecord): JobView {
  const { request: _request, ...view } = job;
  return view;
}

const DEFAULT_TTL_MS = 3_600_000;

export class JobManager {
  private queue: string[] = [];
  private draining = false;
  private canceled = new Set<string>();

  constructor(
    private storage: StorageProvider = new InMemoryStorage(),
    private ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  async enqueue(request: ChatCompletionRequest): Promise<JobView> {
    const id = randomUUID();
    const now = Date.now();
    const job: JobRecord = {
      id,
      status: "queued",
      model: request.model,
      request: { ...request, stream: false },
      createdAt: now,
      updatedAt: now,
    };
    await this.save(job);
    this.queue.push(id);
    void this.drain();
    return toJobView(job);
  }

  async get(id: string): Promise<JobView | null> {
    const job = await this.storage.get<JobRecord>(`job:${id}`);
    return job ? toJobView(job) : null;
  }

  async cancel(id: string): Promise<JobView | null> {
    const job = await this.storage.get<JobRecord>(`job:${id}`);
    if (!job) return null;
    if (job.status === "queued" || job.status === "running") {
      this.canceled.add(id);
      job.status = "canceled";
      job.updatedAt = Date.now();
      await this.save(job);
    }
    return toJobView(job);
  }

  private async save(job: JobRecord): Promise<void> {
    await this.storage.set(`job:${job.id}`, job, this.ttlMs);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift();
        if (id) await this.run(id);
      }
    } finally {
      this.draining = false;
    }
  }

  private async run(id: string): Promise<void> {
    const job = await this.storage.get<JobRecord>(`job:${id}`);
    if (!job) return;
    if (this.canceled.has(id) || job.status === "canceled") {
      this.canceled.delete(id);
      return;
    }

    job.status = "running";
    job.updatedAt = Date.now();
    await this.save(job);

    const outcome = await runAdapterNonStreaming({
      messages: job.request.messages,
      model: job.request.model,
      temperature: job.request.temperature,
      maxTokens: job.request.max_tokens,
    });

    const latest = (await this.storage.get<JobRecord>(`job:${id}`)) ?? job;
    if (this.canceled.has(id) || latest.status === "canceled") {
      this.canceled.delete(id);
      return;
    }

    if (outcome.ok) {
      latest.status = "succeeded";
      latest.result = buildChatResponse(job.request.model, job.request.messages, outcome.content, outcome.adapterName);
    } else {
      latest.status = "failed";
      latest.error = { message: outcome.message, code: outcome.code };
    }
    latest.updatedAt = Date.now();
    await this.save(latest);
  }
}

export const jobManager = new JobManager();
