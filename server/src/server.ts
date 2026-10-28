import type { Server } from "http";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { logger } from "./utils/logger";

async function start(): Promise<void> {
  const env = loadEnv();
  const app = createApp();

  try {
    await connectDatabase(env.MONGODB_URI);
  } catch {
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info("AgentShield API listening", {
      port: env.PORT,
    });
  });

  registerShutdown(server);
}

function registerShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info("Shutdown started", { signal });

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((closeError: Error | undefined) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          logger.info("HTTP server closed");
          resolve();
        });
      });
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown shutdown error";
      logger.error("Shutdown failed", { error: message });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  logger.error("Server failed to start", { error: message });
  process.exit(1);
});
