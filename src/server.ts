import cors from "@fastify/cors";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerRoutes } from "./handlers.js";
import authPlugin from "./plugins/auth.js";
import loggerPlugin from "./plugins/logger.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
    },
  });

  await app.register(cors);
  await app.register(authPlugin);
  await app.register(loggerPlugin);
  registerRoutes(app);

  return app;
}

async function main() {
  const app = await buildApp();

  const signals = ["SIGTERM", "SIGINT"] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }

  await app.listen({ host: config.server.host, port: config.server.port });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
