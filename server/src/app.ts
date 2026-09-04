import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestLogger } from "./middleware/requestLogger";
import { apiRouter } from "./routes";
import { webhookRouter } from "./routes/webhook.routes";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    }),
  );
  app.use(
    "/api/webhooks",
    express.raw({ type: "application/json", limit: "100kb" }),
    webhookRouter,
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
