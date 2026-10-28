
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestLogger } from "./middleware/requestLogger";
import { authenticate, requireCsrf } from "./middleware/authentication";
import { apiRouter } from "./routes";
import { authRouter } from "./routes/auth.routes";
import { healthRouter } from "./routes/health.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { getClientUrl, getTrustedProxyHops } from "./config/env";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", getTrustedProxyHops());
  app.use(requestLogger);

  app.use(
    cors({
      origin: getClientUrl(),
      credentials: true,
      exposedHeaders: ["X-Request-ID"],
    }),
  );

  // Razorpay signs the exact request bytes. This parser is deliberately scoped
  // to the webhook endpoint so all other API routes retain normal JSON bodies.
  app.use(
    "/api/webhooks",
    express.raw({ type: "application/json", limit: "100kb" }),
    webhookRouter,
  );
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api", authenticate, (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      requireCsrf(req, res, next);
      return;
    }
    next();
  }, apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}