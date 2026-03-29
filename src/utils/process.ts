import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export interface RunOptions {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
  env?: Record<string, string>;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface StreamEvents {
  token: [string];
  done: [{ exitCode: number | null }];
  error: [Error];
}

export class StreamEmitter extends EventEmitter {
  override emit<K extends keyof StreamEvents>(event: K, ...args: StreamEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof StreamEvents>(event: K, listener: (...args: StreamEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof StreamEvents>(event: K, listener: (...args: StreamEvents[K]) => void): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
}

export function runCli(opts: RunOptions): Promise<RunResult> {
  const { command, args, stdin, timeoutMs = 120_000, maxOutputChars = 1_000_000, env } = opts;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false, // SECURITY: never use shell: true — prevents shell injection
      env: env ? { ...process.env, ...env } : undefined,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxOutputChars) {
        stdout += chunk.toString();
        if (stdout.length > maxOutputChars) {
          stdout = stdout.slice(0, maxOutputChars);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxOutputChars) {
        stderr += chunk.toString();
        if (stderr.length > maxOutputChars) {
          stderr = stderr.slice(0, maxOutputChars);
        }
      }
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!killed) {
          child.kill("SIGKILL");
        }
      }, 3000);
    }, timeoutMs);

    child.on("close", (exitCode) => {
      killed = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, timedOut });
    });

    child.on("error", (err) => {
      killed = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr: err.message, exitCode: null, timedOut });
    });
  });
}

export function streamCli(opts: RunOptions): StreamEmitter {
  const { command, args, stdin, timeoutMs = 120_000, env } = opts;
  const emitter = new StreamEmitter();

  try {
    const child = spawn(command, args, {
      shell: false, // SECURITY: never use shell: true — prevents shell injection
      env: env ? { ...process.env, ...env } : undefined,
    });

    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      // Word-buffered: emit on whitespace boundaries
      const words = buffer.split(/(\s+)/);
      if (words.length > 1) {
        // Keep last incomplete word in buffer
        buffer = words.pop() ?? "";
        const text = words.join("");
        if (text) emitter.emit("token", text);
      }
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
      }, 3000);
    }, timeoutMs);

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (buffer) {
        emitter.emit("token", buffer);
      }
      emitter.emit("done", { exitCode });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      emitter.emit("error", err);
    });
  } catch (err) {
    process.nextTick(() => emitter.emit("error", err instanceof Error ? err : new Error(String(err))));
  }

  return emitter;
}
