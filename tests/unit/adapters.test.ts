import { describe, expect, it } from "vitest";
import { detectCopilotMode } from "../../src/adapters/copilot.js";
import { resolveGeminiModel } from "../../src/adapters/gemini.js";

describe("resolveGeminiModel", () => {
  it("maps 2.5 to gemini-2.5-pro", () => {
    expect(resolveGeminiModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(resolveGeminiModel("something-2.5")).toBe("gemini-2.5-pro");
  });

  it("maps 2-5 to gemini-2.5-pro", () => {
    expect(resolveGeminiModel("gemini-2-5-pro")).toBe("gemini-2.5-pro");
  });

  it("maps flash to gemini-2.0-flash", () => {
    expect(resolveGeminiModel("gemini-flash")).toBe("gemini-2.0-flash");
  });

  it("maps pro to gemini-1.5-pro", () => {
    expect(resolveGeminiModel("gemini-pro")).toBe("gemini-1.5-pro");
  });

  it("maps gemini-2 to gemini-2.0-flash", () => {
    expect(resolveGeminiModel("gemini-2")).toBe("gemini-2.0-flash");
  });

  it("returns null for unrecognized model", () => {
    expect(resolveGeminiModel("some-random-model")).toBeNull();
  });
});

describe("detectCopilotMode", () => {
  it("detects explain signals", () => {
    expect(detectCopilotMode("explain this code")).toBe("explain");
    expect(detectCopilotMode("what does this do")).toBe("explain");
    expect(detectCopilotMode("How does git work")).toBe("explain");
    expect(detectCopilotMode("describe the function")).toBe("explain");
    expect(detectCopilotMode("why is this slow")).toBe("explain");
  });

  it("defaults to suggest", () => {
    expect(detectCopilotMode("list all files")).toBe("suggest");
    expect(detectCopilotMode("find large files")).toBe("suggest");
    expect(detectCopilotMode("delete tmp folder")).toBe("suggest");
  });
});
