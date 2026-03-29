import { describe, expect, it } from "vitest";
import { CliErrorType, detectCliError } from "../../src/utils/errors.js";

describe("detectCliError", () => {
  it("detects rate limit from stdout", () => {
    const err = detectCliError("Error: rate limit exceeded", "");
    expect(err).not.toBeNull();
    expect(err!.type).toBe(CliErrorType.RATE_LIMIT);
    expect(err!.httpStatus).toBe(429);
  });

  it("detects 429 status code", () => {
    const err = detectCliError("", "HTTP 429 Too Many Requests");
    expect(err?.type).toBe(CliErrorType.RATE_LIMIT);
  });

  it("detects too many requests", () => {
    const err = detectCliError("too many requests, please retry", "");
    expect(err?.type).toBe(CliErrorType.RATE_LIMIT);
  });

  it("detects elevated errors", () => {
    const err = detectCliError("elevated errors detected", "");
    expect(err?.type).toBe(CliErrorType.RATE_LIMIT);
  });

  it("detects auth failure - not authenticated", () => {
    const err = detectCliError("", "not authenticated");
    expect(err?.type).toBe(CliErrorType.AUTH_FAILURE);
    expect(err?.httpStatus).toBe(401);
  });

  it("detects auth failure - login required", () => {
    const err = detectCliError("login required to continue", "");
    expect(err?.type).toBe(CliErrorType.AUTH_FAILURE);
  });

  it("detects auth failure - unauthorized", () => {
    const err = detectCliError("", "Unauthorized access");
    expect(err?.type).toBe(CliErrorType.AUTH_FAILURE);
  });

  it("detects auth failure - session expired", () => {
    const err = detectCliError("session expired, please re-login", "");
    expect(err?.type).toBe(CliErrorType.AUTH_FAILURE);
  });

  it("detects quota exceeded", () => {
    const err = detectCliError("quota exceeded for this month", "");
    expect(err?.type).toBe(CliErrorType.QUOTA_EXCEEDED);
    expect(err?.httpStatus).toBe(429);
  });

  it("detects billing issue", () => {
    const err = detectCliError("", "billing issue detected");
    expect(err?.type).toBe(CliErrorType.QUOTA_EXCEEDED);
  });

  it("detects usage limit", () => {
    const err = detectCliError("usage limit reached", "");
    expect(err?.type).toBe(CliErrorType.QUOTA_EXCEEDED);
  });

  it("detects network error - connection refused", () => {
    const err = detectCliError("", "connection refused");
    expect(err?.type).toBe(CliErrorType.NETWORK_ERROR);
    expect(err?.httpStatus).toBe(502);
  });

  it("detects network error - ECONNREFUSED", () => {
    const err = detectCliError("", "Error: ECONNREFUSED 127.0.0.1:443");
    expect(err?.type).toBe(CliErrorType.NETWORK_ERROR);
  });

  it("detects network error - timeout", () => {
    const err = detectCliError("timeout waiting for response", "");
    expect(err?.type).toBe(CliErrorType.NETWORK_ERROR);
  });

  it("returns null for clean output", () => {
    expect(detectCliError("Hello, how can I help?", "")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(detectCliError("", "")).toBeNull();
  });
});
