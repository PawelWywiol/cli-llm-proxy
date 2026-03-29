export enum CliErrorType {
  RATE_LIMIT = "RATE_LIMIT",
  AUTH_FAILURE = "AUTH_FAILURE",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

export interface CliError {
  type: CliErrorType;
  message: string;
  httpStatus: number;
}

const PATTERNS: Array<{
  type: CliErrorType;
  httpStatus: number;
  patterns: RegExp[];
}> = [
  {
    type: CliErrorType.RATE_LIMIT,
    httpStatus: 429,
    patterns: [/429/i, /rate limit/i, /too many requests/i, /elevated errors/i],
  },
  {
    type: CliErrorType.AUTH_FAILURE,
    httpStatus: 401,
    patterns: [/not authenticated/i, /login required/i, /unauthorized/i, /session expired/i],
  },
  {
    type: CliErrorType.QUOTA_EXCEEDED,
    httpStatus: 429,
    patterns: [/quota exceeded/i, /billing/i, /usage limit/i],
  },
  {
    type: CliErrorType.NETWORK_ERROR,
    httpStatus: 502,
    patterns: [/connection refused/i, /timeout/i, /ECONNREFUSED/],
  },
];

export function detectCliError(stdout: string, stderr: string): CliError | null {
  const combined = `${stdout}\n${stderr}`;

  for (const { type, httpStatus, patterns } of PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return {
          type,
          message: `CLI error detected: ${type}`,
          httpStatus,
        };
      }
    }
  }

  return null;
}
