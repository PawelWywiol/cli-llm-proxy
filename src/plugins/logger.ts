import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

async function loggerPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest) => {
    request.log.info({ method: request.method, url: request.url, requestId: request.id }, "incoming request");
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const latency = reply.elapsedTime;
    request.log.info(
      {
        requestId: request.id,
        statusCode: reply.statusCode,
        latencyMs: Math.round(latency),
        model: (request.body as Record<string, unknown>)?.model,
        adapterName: (request as unknown as Record<string, unknown>).adapterName,
      },
      "request completed",
    );
  });
}

export default fp(loggerPlugin, { name: "logger" });
