import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config.js";
import type { OpenAIError } from "../types/openai.js";

async function authPlugin(app: FastifyInstance) {
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.server.apiKey) return;
    if (request.url === "/health") return;

    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers["x-api-key"];

    let token: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (typeof apiKeyHeader === "string") {
      token = apiKeyHeader;
    }

    if (token !== config.server.apiKey) {
      const error: OpenAIError = {
        error: {
          message: "Invalid API key",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      };
      return reply.status(401).send(error);
    }
  });
}

export default fp(authPlugin, { name: "auth" });
