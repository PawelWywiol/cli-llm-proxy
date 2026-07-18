import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunCli } = vi.hoisted(() => ({ mockRunCli: vi.fn() }));

vi.mock("../../src/utils/process.js", () => ({
  runCli: mockRunCli,
  streamCli: vi.fn(),
  StreamEmitter: class {},
}));

import { ClaudeAdapter } from "../../src/adapters/claude.js";
import { GeminiAdapter } from "../../src/adapters/gemini.js";

beforeEach(() => {
  mockRunCli.mockReset();
  mockRunCli.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0, timedOut: false });
});

describe("large-prompt delivery via stdin", () => {
  it("claude sends the prompt over stdin, keeping argv small", async () => {
    const bigPrompt = "X".repeat(200_000);
    await new ClaudeAdapter().run({ model: "claude", messages: [{ role: "user", content: bigPrompt }] });

    const call = mockRunCli.mock.calls[0][0];
    expect(call.stdin).toContain(bigPrompt);
    expect(call.args).toEqual(["--print"]);
    expect(call.args.some((a: string) => a.length > 1000)).toBe(false);
  });

  it("gemini pipes the prompt over stdin without -p", async () => {
    await new GeminiAdapter().run({ model: "gemini-2.5-pro", messages: [{ role: "user", content: "hello" }] });

    const call = mockRunCli.mock.calls[0][0];
    expect(call.stdin).toContain("hello");
    expect(call.args).not.toContain("-p");
    expect(call.args).toContain("--model");
  });

  it("passes a per-request timeout override to the CLI", async () => {
    await new ClaudeAdapter().run({
      model: "claude",
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5_000,
    });

    expect(mockRunCli.mock.calls[0][0].timeoutMs).toBe(5_000);
  });
});
