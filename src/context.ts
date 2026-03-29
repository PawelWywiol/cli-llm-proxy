import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  startTime: number;
  model: string;
  adapterName?: string;
  [key: string]: unknown;
}

export function createRequestContext(model: string): RequestContext {
  return {
    requestId: randomUUID(),
    startTime: Date.now(),
    model,
  };
}
