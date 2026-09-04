import express from "express";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestLogger } from "./middleware/requestLogger";
import { apiRouter } from "./routes";
import { webhookRouter } from "./routes/webhook.routes";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  // Razorpay signs the exact request bytes. This parser is deliberately scoped
  // to the webhook endpoint so all other API routes retain normal JSON bodies.
  app.use("/api/webhooks", express.raw({ type: "application/json", limit: "100kb" }), webhookRouter);
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
